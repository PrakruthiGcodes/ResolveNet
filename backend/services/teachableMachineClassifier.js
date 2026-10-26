const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { Jimp } = require('jimp');

/**
 * Image-based issue classifier, backed by the Teachable Machine image model in
 * ai-engine/model/teachable_machine. It classifies the whole image, so it
 * returns one class per photo rather than boxes.
 *
 * Loading and preprocessing match backend/test/teachableMachineModelLoad.js.
 */

const AI_ENGINE_DIR = path.join(__dirname, '..', '..', 'ai-engine');
const MODEL_DIR = path.join(AI_ENGINE_DIR, 'model', 'teachable_machine');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');

// Below this top-class probability the photo is reported as not detected, the
// same role the default 0.25 threshold plays in ai-engine/inference.py.
const MIN_DETECTION_PROBABILITY = 0.25;

// PROVISIONAL. When the runner-up class is this close to the top class, the photo
// is treated as ambiguous and not detected. A near-tie should not be stored as a
// confident classification. This margin is a policy choice, not a measured
// accuracy figure, and should be revisited with labelled validation data.
const AMBIGUITY_MARGIN = 0.15;

// Maps the exact Teachable Machine labels (ai-engine/model/teachable_machine/
// metadata.json) to the app's issue categories. There is no fallen-tree
// category, so 'fallentree' maps to 'other', as the YOLO model's fallen_tree does.
const LABEL_MAP = {
  pathhole: 'pothole',
  streetlight: 'streetlight',
  fallentree: 'other',
  Garbageoverflow: 'garbage',
  waterleakage: 'water_leakage',
};

// Reads model.json and every weight shard it lists, then hands them to tfjs as
// in-memory artifacts. Plain @tensorflow/tfjs has no Node file-system loader,
// so tf.loadLayersModel('file://...') would not work here.
const readModelArtifacts = (modelJsonPath) => {
  const modelDir = path.dirname(modelJsonPath);
  const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));

  const weightSpecs = [];
  const shards = [];
  for (const group of modelJson.weightsManifest) {
    weightSpecs.push(...group.weights);
    for (const shardPath of group.paths) {
      shards.push(fs.readFileSync(path.join(modelDir, shardPath)));
    }
  }

  const combined = Buffer.concat(shards);
  const weightData = combined.buffer.slice(
    combined.byteOffset,
    combined.byteOffset + combined.byteLength
  );

  return { modelTopology: modelJson.modelTopology, weightSpecs, weightData };
};

// The model is loaded once and shared. A failed load is not cached, so the
// next call can retry.
let modelPromise = null;

const loadModel = () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      const metadata = JSON.parse(fs.readFileSync(METADATA_JSON, 'utf8'));
      const model = await tf.loadLayersModel(tf.io.fromMemory(readModelArtifacts(MODEL_JSON)));
      return { model, labels: metadata.labels, imageSize: metadata.imageSize || 224 };
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
};

// Resizes to the model's input size and scales RGB to [-1, 1] with x / 127 - 1,
// the normalization the Teachable Machine image library uses.
const imageToTensor = async (imagePath, size) => {
  const image = await Jimp.read(imagePath);
  image.resize({ w: size, h: size });

  const { data } = image.bitmap;
  const pixelCount = size * size;
  const values = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    values[i * 3] = data[i * 4] / 127 - 1;
    values[i * 3 + 1] = data[i * 4 + 1] / 127 - 1;
    values[i * 3 + 2] = data[i * 4 + 2] / 127 - 1;
  }
  return tf.tensor4d(values, [1, size, size, 3]);
};

const predictProbabilities = async (imagePath) => {
  const { model, labels, imageSize } = await loadModel();
  const input = await imageToTensor(imagePath, imageSize);
  const output = model.predict(input);
  try {
    return { labels, probabilities: Array.from(await output.data()) };
  } finally {
    input.dispose();
    output.dispose();
  }
};

// Result shape (same fields as imageClassifier.js):
//   issueType      - the app category for the top class, 'other' when unsure.
//   confidence     - the top class probability, or null when there is no
//                    usable prediction. Never a made-up number.
//   detected       - true only when the top class clears MIN_DETECTION_PROBABILITY.
//   modelAvailable - false when the model or image could not be used.
//   message        - present when there is no usable prediction.
const unavailable = (message) => ({
  issueType: 'other',
  confidence: null,
  detected: false,
  modelAvailable: false,
  message,
});

const toResult = (labels, probabilities) => {
  let topIndex = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[topIndex]) topIndex = i;
  }

  const topProbability = probabilities[topIndex];
  if (topProbability < MIN_DETECTION_PROBABILITY) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: true,
      message: 'Model ran successfully but no issue type was confident enough',
    };
  }

  let runnerUpProbability = 0;
  for (let i = 0; i < probabilities.length; i++) {
    if (i !== topIndex && probabilities[i] > runnerUpProbability) runnerUpProbability = probabilities[i];
  }
  if (topProbability - runnerUpProbability < AMBIGUITY_MARGIN) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: true,
      message: 'Model ran successfully but two issue types were almost equally likely',
    };
  }

  return {
    issueType: LABEL_MAP[labels[topIndex]] || 'other',
    confidence: Math.round(topProbability * 10000) / 10000,
    detected: true,
    modelAvailable: true,
  };
};

const classifyImage = async (imagePath) => {
  if (!imagePath || !fs.existsSync(imagePath)) {
    return unavailable('Image not available for classification');
  }

  try {
    const { labels, probabilities } = await predictProbabilities(imagePath);
    return toResult(labels, probabilities);
  } catch (error) {
    return unavailable('Image classification failed');
  }
};

module.exports = { classifyImage, toResult, LABEL_MAP, MIN_DETECTION_PROBABILITY, AMBIGUITY_MARGIN };
