/**
 * Evaluates the production Teachable Machine image classifier on a labelled
 * dataset split. Read-only: it reads images and YOLO label files and prints
 * metrics. It does not change thresholds, routing, the model, or any file.
 *
 * Usage (from backend/):
 *   node scripts/evaluateImageModel.js [--dataset Civic-issues-v2] [--split test]
 *
 * Ground truth comes from each image's YOLO label file. Images whose labels
 * mix several classes, or that have no labels, are skipped and counted, so
 * every evaluated image has one known answer.
 *
 * Prediction is the production decision from classifyImage(). An image the
 * production code will not auto-route (not detected, or ambiguous) is counted
 * as "uncertain". It is never counted as a correct answer.
 *
 * Leakage check: exact-duplicate images (same bytes) between the evaluated
 * split and the training split are reported. Near-duplicates are not checked.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { classifyImage } = require('../services/teachableMachineClassifier');

const DATASET_ROOT = path.join(__dirname, '..', '..', 'ai-engine', 'dataset');
const SPLITS = ['train', 'valid', 'test'];

// Same order as the "names" list in ai-engine/data.yaml. YOLO label files store the index.
const YOLO_NAMES = ['fallen_tree', 'garbage', 'pothole', 'streetlight', 'water_leak'];

// The app category each dataset class should be classified as.
const EXPECTED_CATEGORY = {
  fallen_tree: 'other',
  garbage: 'garbage',
  pothole: 'pothole',
  streetlight: 'streetlight',
  water_leak: 'water_leakage',
};

const CATEGORIES = ['pothole', 'garbage', 'water_leakage', 'streetlight', 'other'];
const UNCERTAIN = 'uncertain';

const parseArgs = (argv) => {
  const args = { dataset: 'Civic-issues-v2', split: 'test' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--dataset') args.dataset = value;
    else if (key === '--split') args.split = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!SPLITS.includes(args.split)) throw new Error(`--split must be one of ${SPLITS.join(', ')}`);
  return args;
};

const labelPathFor = (imagePath, labelsDir) => path.join(labelsDir, path.basename(imagePath).replace(/\.[^.]+$/, '.txt'));

const collectSamples = (splitDir) => {
  const imagesDir = path.join(splitDir, 'images');
  const labelsDir = path.join(splitDir, 'labels');
  const samples = [];
  const skipped = { noLabel: 0, mixedClasses: 0 };

  for (const name of fs.readdirSync(imagesDir).sort()) {
    const imagePath = path.join(imagesDir, name);
    const labelPath = labelPathFor(imagePath, labelsDir);
    if (!fs.existsSync(labelPath)) {
      skipped.noLabel++;
      continue;
    }

    const classIds = [
      ...new Set(
        fs
          .readFileSync(labelPath, 'utf8')
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => Number(line.split(/\s+/)[0]))
      ),
    ];
    if (classIds.length === 0) {
      skipped.noLabel++;
      continue;
    }
    if (classIds.length > 1) {
      skipped.mixedClasses++;
      continue;
    }

    const className = YOLO_NAMES[classIds[0]];
    samples.push({ imagePath, className, truth: EXPECTED_CATEGORY[className] });
  }

  return { samples, skipped };
};

const hashFile = (filePath) => crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');

// Counts evaluated images whose exact bytes also appear in the training split.
const countTrainingOverlap = (evalImages, trainDir) => {
  const trainImagesDir = path.join(trainDir, 'images');
  const trainHashes = new Set(fs.readdirSync(trainImagesDir).map((name) => hashFile(path.join(trainImagesDir, name))));
  return evalImages.filter((imagePath) => trainHashes.has(hashFile(imagePath))).length;
};

const safeDivide = (numerator, denominator) => (denominator === 0 ? null : numerator / denominator);
const formatRate = (value) => (value === null ? '   n/a' : `${(value * 100).toFixed(1).padStart(5)}%`);

const computeMetrics = (rows) => {
  const matrix = {};
  for (const truth of CATEGORIES) {
    matrix[truth] = {};
    for (const predicted of [...CATEGORIES, UNCERTAIN]) matrix[truth][predicted] = 0;
  }
  for (const row of rows) matrix[row.truth][row.predicted]++;

  const perClass = CATEGORIES.map((category) => {
    const truePositives = matrix[category][category];
    const actual = Object.values(matrix[category]).reduce((sum, n) => sum + n, 0);
    const predicted = CATEGORIES.reduce((sum, truth) => sum + matrix[truth][category], 0);
    const precision = safeDivide(truePositives, predicted);
    const recall = safeDivide(truePositives, actual);
    const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
    return { category, actual, predicted, precision, recall, f1 };
  });

  const correct = rows.filter((row) => row.truth === row.predicted).length;
  const decided = rows.filter((row) => row.predicted !== UNCERTAIN).length;
  const uncertain = rows.length - decided;
  const decidedCorrect = rows.filter((row) => row.predicted !== UNCERTAIN && row.truth === row.predicted).length;

  return {
    matrix,
    perClass,
    total: rows.length,
    correct,
    accuracyAll: safeDivide(correct, rows.length),
    decided,
    uncertain,
    accuracyDecided: safeDivide(decidedCorrect, decided),
  };
};

const printReport = (metrics) => {
  console.log('\nPer-class metrics (on decided and undecided images, uncertain counts as a miss)');
  console.log('category         actual  predicted  precision  recall     F1');
  for (const row of metrics.perClass) {
    console.log(
      `${row.category.padEnd(16)} ${String(row.actual).padStart(6)}  ${String(row.predicted).padStart(9)}  ${formatRate(row.precision)}   ${formatRate(row.recall)}  ${formatRate(row.f1)}`
    );
  }

  console.log('\nConfusion matrix (rows = actual, columns = predicted)');
  const columns = [...CATEGORIES, UNCERTAIN];
  console.log(`${''.padEnd(16)}${columns.map((c) => c.slice(0, 11).padStart(12)).join('')}`);
  for (const truth of CATEGORIES) {
    console.log(`${truth.padEnd(16)}${columns.map((c) => String(metrics.matrix[truth][c]).padStart(12)).join('')}`);
  }

  console.log('\nOverall');
  console.log(`  images evaluated:          ${metrics.total}`);
  console.log(`  accuracy, all images:      ${formatRate(metrics.accuracyAll)}  (${metrics.correct}/${metrics.total})`);
  console.log(`  decided by the model:      ${metrics.decided}  (uncertain: ${metrics.uncertain})`);
  console.log(`  accuracy, decided only:    ${formatRate(metrics.accuracyDecided)}`);
};

(async () => {
  const { dataset, split } = parseArgs(process.argv.slice(2));
  const splitDir = path.join(DATASET_ROOT, dataset, split);
  if (!fs.existsSync(splitDir)) throw new Error(`Split not found: ${splitDir}`);

  console.log(`Dataset: ${dataset}, split: ${split}`);
  const { samples, skipped } = collectSamples(splitDir);
  console.log(`Labelled single-class images: ${samples.length}`);
  console.log(`Skipped: no label ${skipped.noLabel}, mixed classes ${skipped.mixedClasses}`);

  if (split !== 'train') {
    const overlap = countTrainingOverlap(
      samples.map((s) => s.imagePath),
      path.join(DATASET_ROOT, dataset, 'train')
    );
    console.log(`Exact duplicates of training images: ${overlap}`);
  }

  const rows = [];
  for (const sample of samples) {
    const result = await classifyImage(sample.imagePath);
    rows.push({ truth: sample.truth, predicted: result.detected ? result.issueType : UNCERTAIN });
  }

  printReport(computeMetrics(rows));
})().catch((error) => {
  console.error(`Evaluation failed: ${error.message}`);
  process.exit(1);
});
