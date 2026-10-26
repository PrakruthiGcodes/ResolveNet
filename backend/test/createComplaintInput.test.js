/**
 * Tests for how a new complaint is created from a description, a photo, or both.
 *
 * Covers: photo only, description only, photo plus description, no detection,
 * inference failure, and missing both inputs. The image classifier is stubbed
 * through its module object, so the YOLO model is never run and no MongoDB is
 * needed.
 *
 * Uses node:test. Run with: npm test (from backend/).
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const imageClassifier = require('../services/teachableMachineClassifier');
const { createComplaint } = require('../controllers/complaintController');
const { resolveIssueType } = require('../services/issueConfirmation');
const { STATUS } = require('../services/complaintStatus');

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const citizen = { id: 'citizen-1', role: 'citizen' };

// A usable YOLO result, as classifyImage returns it for a real detection.
const detection = (issueType, confidence = 0.91) => ({
  issueType,
  confidence,
  detected: true,
  modelAvailable: true,
});

// The results classifyImage returns when it cannot give a usable prediction.
const noDetection = {
  issueType: 'other',
  confidence: null,
  detected: false,
  modelAvailable: true,
  message: 'Model ran successfully but detected no known issue in the image',
};

const modelUnavailable = {
  issueType: 'other',
  confidence: null,
  detected: false,
  modelAvailable: false,
  message: 'Image classification failed',
};

// A multer-style upload. The path is never read, because classifyImage is stubbed.
const photoFile = () => ({
  filename: 'upload.jpg',
  path: 'uploads/upload.jpg',
  originalname: 'issue.jpg',
  mimetype: 'image/jpeg',
  size: 1000,
});

let create;
let notificationCreate;
let classify;

beforeEach(() => {
  create = mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));
  notificationCreate = mock.method(Notification, 'create', async () => ({}));
  classify = mock.method(imageClassifier, 'classifyImage', async () => detection('pothole'));
});

afterEach(() => {
  mock.restoreAll();
});

const submit = async ({ body = {}, file } = {}) => {
  const res = mockRes();
  await createComplaint({ user: citizen, body, file }, res);
  return res;
};

const savedData = () => create.mock.calls[0].arguments[0];

describe('photo only (no description)', () => {
  it('is accepted and classified from the photo, then routed to the mapped department', async () => {
    classify.mock.mockImplementation(async () => detection('pothole', 0.87));

    const res = await submit({ file: photoFile() });

    assert.equal(res.statusCode, 201);
    assert.equal(classify.mock.callCount(), 1);
    const data = savedData();
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.confidence, 0.87);
    assert.equal(data.department, 'Road Department');
    assert.ok(data.dueAt instanceof Date);
    assert.equal(data.status, undefined, 'a usable photo result keeps the schema default status');
    assert.equal(data.description, '', 'no description is stored as an empty string');
  });

  it('routes a garbage photo to the Sanitation Department', async () => {
    classify.mock.mockImplementation(async () => detection('garbage'));

    await submit({ file: photoFile() });

    assert.equal(savedData().department, 'Sanitation Department');
  });

  it('a whitespace-only description counts as no description', async () => {
    classify.mock.mockImplementation(async () => detection('streetlight'));

    const res = await submit({ body: { description: '   ' }, file: photoFile() });

    assert.equal(res.statusCode, 201);
    assert.equal(savedData().issueType, 'streetlight');
    assert.equal(savedData().description, '');
  });
});

describe('description only (no photo)', () => {
  it('uses the text classifier and does not run image classification', async () => {
    const res = await submit({ body: { description: 'There is a pothole on Main Street' } });

    assert.equal(res.statusCode, 201);
    assert.equal(classify.mock.callCount(), 0);
    const data = savedData();
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.confidence, 0.95);
    assert.equal(data.department, 'Road Department');
    assert.equal(data.image, undefined);
    assert.equal(data.imageClassification, undefined);
    assert.equal(data.status, undefined);
  });

  it('falls back to other and the General department when the text matches no rule', async () => {
    await submit({ body: { description: 'Something odd near the school' } });

    const data = savedData();
    assert.equal(data.issueType, 'other');
    assert.equal(data.department, 'General/Municipal Department');
  });
});

describe('photo plus description', () => {
  it('a confident water_leakage photo still asks for confirmation, even when the text returns other', async () => {
    classify.mock.mockImplementation(async () => detection('water_leakage', 0.8));

    const res = await submit({
      body: { description: 'Something is wrong here' },
      file: photoFile(),
    });

    assert.equal(res.statusCode, 201);
    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.issueType, 'water_leakage', 'the photo type is the suggestion');
    assert.equal(data.confidence, undefined);
    assert.equal(data.department, undefined);
    assert.equal(data.dueAt, undefined);
    assert.equal(data.imageClassification.confidence, 0.8, 'the photo result is kept');
  });

  it('a photo the text agrees with still needs confirmation if its confidence is below the threshold', async () => {
    classify.mock.mockImplementation(async () => detection('pothole', 0.3));

    await submit({ body: { description: 'Pothole on Main Street' }, file: photoFile() });

    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.department, undefined);
    assert.equal(data.imageClassification.confidence, 0.3);
  });

  it('when the photo and description agree, the photo result is used', async () => {
    classify.mock.mockImplementation(async () => detection('pothole', 0.93));

    await submit({ body: { description: 'Big pothole on Main Street' }, file: photoFile() });

    const data = savedData();
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.confidence, 0.93);
    assert.equal(data.status, undefined);
  });

  it('when the photo and description conflict, asks the citizen to confirm and suggests the description type', async () => {
    classify.mock.mockImplementation(async () => detection('garbage', 0.9));

    const res = await submit({ body: { description: 'Pothole on Main Street' }, file: photoFile() });

    assert.equal(res.statusCode, 201);
    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.issueType, 'pothole', 'the description type is the suggestion');
    assert.equal(data.department, undefined, 'no department until the citizen confirms');
    assert.equal(data.dueAt, undefined);
    assert.equal(data.imageClassification.issueType, 'garbage', 'the photo result is kept');
  });

  it('when the photo shows an unrelated object, the description still decides but the photo result is kept', async () => {
    classify.mock.mockImplementation(async () => detection('other', 0.7));

    await submit({ body: { description: 'Pothole on Main Street' }, file: photoFile() });

    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.imageClassification.issueType, 'other');
  });
});

describe('no detection', () => {
  it('saves a photo-only complaint as needs_confirmation, with no description required', async () => {
    classify.mock.mockImplementation(async () => noDetection);

    const res = await submit({ file: photoFile() });

    assert.equal(res.statusCode, 201);
    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.department, undefined);
    assert.equal(data.dueAt, undefined);
    assert.equal(data.confidence, undefined, 'no invented confidence score');
    assert.equal(data.imageClassification.detected, false);
    assert.equal(data.imageClassification.modelAvailable, true);
  });

  it('does not suggest a type from a description that was not given', async () => {
    classify.mock.mockImplementation(async () => noDetection);

    await submit({ file: photoFile() });

    assert.equal(savedData().issueType, 'other', 'the default is a neutral starting point, not a suggestion');
  });

  it('notifies the citizen to confirm, and does not announce a department yet', async () => {
    classify.mock.mockImplementation(async () => noDetection);

    await submit({ file: photoFile() });

    assert.deepEqual(
      notificationCreate.mock.calls.map((call) => call.arguments[0].type),
      ['complaint_created']
    );
  });
});

describe('inference failure or unavailable model', () => {
  it('a model that is unavailable saves as needs_confirmation, not an error', async () => {
    classify.mock.mockImplementation(async () => modelUnavailable);

    const res = await submit({ body: { description: 'Broken pipe near the park' }, file: photoFile() });

    assert.equal(res.statusCode, 201);
    assert.equal(savedData().status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(savedData().imageClassification.modelAvailable, false);
  });

  it('a classifier that throws does not fail the submission, and is reported as unavailable', async () => {
    classify.mock.mockImplementation(async () => {
      throw new Error('spawn failed');
    });

    const res = await submit({ file: photoFile() });

    assert.equal(res.statusCode, 201);
    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.imageClassification.modelAvailable, false);
    assert.equal(data.imageClassification.confidence, null);
    assert.equal(typeof data.imageClassification.message, 'string');
  });

  it('a failed photo with a description still keeps the description as the suggestion', async () => {
    classify.mock.mockImplementation(async () => modelUnavailable);

    await submit({ body: { description: 'Pothole on Main Street' }, file: photoFile() });

    const data = savedData();
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.issueType, 'pothole');
  });
});

describe('missing both inputs', () => {
  it('is refused with a clear message, before any classification or database write', async () => {
    const res = await submit({ body: {} });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Please describe the issue or attach a photo');
    assert.equal(classify.mock.callCount(), 0);
    assert.equal(create.mock.callCount(), 0);
  });

  it('a whitespace-only description with no photo is refused the same way', async () => {
    const res = await submit({ body: { description: '  \n ' } });

    assert.equal(res.statusCode, 400);
    assert.equal(create.mock.callCount(), 0);
  });

  it('a request with no body at all is refused the same way', async () => {
    const res = mockRes();
    await createComplaint({ user: citizen }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(create.mock.callCount(), 0);
  });
});

describe('resolveIssueType decision rules', () => {
  const text = (issueType) => ({ issueType, confidence: 0.95 });

  it('no photo uses the description type with its rule confidence', () => {
    assert.deepEqual(resolveIssueType({ hasImage: false, textResult: text('garbage') }), {
      issueType: 'garbage',
      confidence: 0.95,
      needsConfirmation: false,
    });
  });

  it('no photo and no description falls back to other', () => {
    assert.deepEqual(resolveIssueType({ hasImage: false, textResult: null }), {
      issueType: 'other',
      confidence: undefined,
      needsConfirmation: false,
    });
  });

  it('an unusable photo asks for confirmation and gives no confidence', () => {
    const result = resolveIssueType({ hasImage: true, textResult: null, imageClassification: noDetection });
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.confidence, undefined);
  });

  it('a detection with an unsupported issue type is not trusted', () => {
    const imageClassification = { issueType: 'unknown_thing', confidence: 0.9, detected: true, modelAvailable: true };
    const result = resolveIssueType({ hasImage: true, textResult: null, imageClassification });
    assert.equal(result.needsConfirmation, true);
  });

  it('a usable photo with no description uses the photo type and its confidence', () => {
    assert.deepEqual(
      resolveIssueType({ hasImage: true, textResult: null, imageClassification: detection('streetlight', 0.66) }),
      { issueType: 'streetlight', confidence: 0.66, needsConfirmation: false }
    );
  });

  it('a usable photo that agrees with the description keeps the photo confidence', () => {
    assert.deepEqual(
      resolveIssueType({ hasImage: true, textResult: text('pothole'), imageClassification: detection('pothole', 0.8) }),
      { issueType: 'pothole', confidence: 0.8, needsConfirmation: false }
    );
  });

  it('a specific description against a different photo type needs confirmation', () => {
    const result = resolveIssueType({
      hasImage: true,
      textResult: text('pothole'),
      imageClassification: detection('garbage'),
    });
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.issueType, 'pothole');
  });
});
