/**
 * Tests for the Teachable Machine image classifier.
 *
 * The label mapping and threshold are checked on plain arrays. One case runs
 * the real model on a known streetlight photo from the dataset and is skipped
 * when that dataset file is not present.
 *
 * Uses node:test. Run with: npm test (from backend/).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  classifyImage,
  toResult,
  LABEL_MAP,
  MIN_DETECTION_PROBABILITY,
  AMBIGUITY_MARGIN,
} = require('../services/teachableMachineClassifier');
const { getDepartment } = require('../services/departmentRouter');
const { resolveIssueType } = require('../services/issueConfirmation');

const LABELS = ['pathhole', 'Garbageoverflow', 'waterleakage', 'streetlight', 'fallentree'];

describe('label mapping', () => {
  it('maps every exact model label to a ResolveNet issue category', () => {
    assert.deepEqual(LABEL_MAP, {
      pathhole: 'pothole',
      streetlight: 'streetlight',
      fallentree: 'other',
      Garbageoverflow: 'garbage',
      waterleakage: 'water_leakage',
    });
  });

  it('every mapped category is one the app supports', () => {
    const supported = ['pothole', 'garbage', 'water_leakage', 'streetlight', 'other'];
    for (const category of Object.values(LABEL_MAP)) {
      assert.ok(supported.includes(category), `${category} is not a supported issue type`);
    }
  });
});

describe('toResult', () => {
  it('returns the mapped category, probability and detected flag for a confident top class', () => {
    const result = toResult(LABELS, [0.01, 0.02, 0.03, 0.9, 0.04]);
    assert.deepEqual(result, {
      issueType: 'streetlight',
      confidence: 0.9,
      detected: true,
      modelAvailable: true,
    });
  });

  it('maps the pathhole label to pothole', () => {
    const result = toResult(LABELS, [0.8, 0.05, 0.05, 0.05, 0.05]);
    assert.equal(result.issueType, 'pothole');
  });

  it('maps fallentree to other', () => {
    const result = toResult(LABELS, [0.01, 0.01, 0.01, 0.01, 0.96]);
    assert.equal(result.issueType, 'other');
    assert.equal(result.detected, true);
  });

  it('reports not detected, with no confidence, when the top class is below the threshold', () => {
    const probabilities = [0.2, 0.2, 0.2, 0.2, 0.2];
    assert.ok(0.2 < MIN_DETECTION_PROBABILITY);
    const result = toResult(LABELS, probabilities);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, null);
    assert.equal(result.issueType, 'other');
    assert.equal(result.modelAvailable, true);
    assert.ok(result.message);
  });
});

describe('classifyImage', () => {
  it('a missing image file yields no invented confidence score', async () => {
    const result = await classifyImage('does/not/exist.jpg');
    assert.equal(result.modelAvailable, false);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, null);
    assert.ok(result.message);
  });

  it('classifies a known streetlight photo from the dataset as streetlight', async (t) => {
    const imagePath = path.join(
      __dirname,
      '..',
      '..',
      'ai-engine',
      'dataset',
      'Civic-issues-v2',
      'test',
      'images',
      'frontFar_BLR-2018-03-22_17-39-26_2_frontFar_0008880_jpg.rf.471aa49da881c1f3f00fc58dfc2eebab.jpg'
    );
    if (!fs.existsSync(imagePath)) {
      t.skip('dataset image not present');
      return;
    }

    const result = await classifyImage(imagePath);
    assert.equal(result.modelAvailable, true);
    assert.equal(result.detected, true);
    assert.equal(result.issueType, 'streetlight');
    assert.ok(result.confidence > 0.99, `expected confidence above 0.99, got ${result.confidence}`);
  });
});

describe('ambiguous predictions', () => {
  it('a near-tie is not reported as a confident detection', () => {
    const result = toResult(LABELS, [0.5, 0.45, 0.02, 0.02, 0.01]);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, null);
    assert.equal(result.issueType, 'other');
    assert.equal(result.modelAvailable, true);
    assert.ok(result.message);
  });

  it('a top class with a clear lead is still detected', () => {
    const result = toResult(LABELS, [0.6, 0.2, 0.1, 0.05, 0.05]);
    assert.equal(result.detected, true);
    assert.equal(result.issueType, 'pothole');
  });

  it('a lead just wider than the margin is treated as clear, and just narrower as ambiguous', () => {
    const wider = toResult(LABELS, [0.6, 0.6 - AMBIGUITY_MARGIN - 0.01, 0.1, 0.1, 0.1]);
    assert.equal(wider.detected, true);

    const narrower = toResult(LABELS, [0.6, 0.6 - AMBIGUITY_MARGIN + 0.01, 0.1, 0.1, 0.1]);
    assert.equal(narrower.detected, false);
  });

  it('a low-confidence near-tie (0.30 vs 0.29) is not stored as a detection', () => {
    const result = toResult(LABELS, [0.3, 0.29, 0.2, 0.1, 0.11]);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, null);
  });
});

describe('invalid and unreadable images', () => {
  it('a file with an image extension but no image data is reported as failed, not classified', async () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-classifier-'));
    const fakePath = path.join(dir, 'not-really.jpg');
    fs.writeFileSync(fakePath, 'this is plain text, not a JPEG');
    try {
      const result = await classifyImage(fakePath);
      assert.equal(result.modelAvailable, false);
      assert.equal(result.detected, false);
      assert.equal(result.confidence, null);
      assert.equal(result.message, 'Image classification failed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable photo sends the complaint to confirmation with no auto-route', async () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-classifier-'));
    const fakePath = path.join(dir, 'broken.png');
    fs.writeFileSync(fakePath, 'garbage bytes');
    try {
      const imageClassification = await classifyImage(fakePath);
      const decision = resolveIssueType({ hasImage: true, textResult: null, imageClassification });
      assert.equal(decision.needsConfirmation, true);
      assert.equal(decision.confidence, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('label to department routing', () => {
  it('every model label routes to the expected department', () => {
    const expected = {
      pathhole: 'Road Department',
      Garbageoverflow: 'Sanitation Department',
      waterleakage: 'Water Department',
      streetlight: 'Electrical Department',
      fallentree: 'General/Municipal Department',
    };
    for (const label of LABELS) {
      assert.equal(getDepartment(LABEL_MAP[label]), expected[label], `label ${label}`);
    }
  });

  it('fallentree is not given a department of its own', () => {
    assert.equal(LABEL_MAP.fallentree, 'other');
  });
});
