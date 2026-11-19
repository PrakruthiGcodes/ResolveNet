
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { Jimp } = require('jimp');

const AI_ENGINE_DIR = path.join(__dirname, '..', '..', 'ai-engine');
const MODEL_DIR = path.join(AI_ENGINE_DIR, 'model', 'teachable_machine');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');

const MIN_DETECTION_PROBABILITY = 0.25;
const AMBIGUITY_MARGIN = 0.15;

const LABEL_MAP = {
  pathhole: 'pothole',
  streetlight: 'streetlight',
  fallentree: 'other',
  Garbageoverflow: 'garbage',
  waterleakage: 'water_leakage',
};

const readModelArtifacts = (modelJsonPath) => {
  const modelDir = path.dirname(modelJsonPath);
  const modelJson = JSON.parse(
    fs.readFileSync(modelJsonPath, 'utf8')
  );

  const weightSpecs = [];
  const shards = [];

  for (const group of modelJson.weightsManifest) {
    weightSpecs.push(...group.weights);

    for (const shardPath of group.paths) {
      shards.push(
        fs.readFileSync(path.join(modelDir, shardPath))
      );
    }
  }

  const combined = Buffer.concat(shards);

  const weightData = combined.buffer.slice(
    combined.byteOffset,
    combined.byteOffset + combined.byteLength
  );

  return {
    modelTopology: modelJson.modelTopology,
    weightSpecs,
    weightData,
  };
};

let modelPromise = null;

const loadModel = () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      const metadata = JSON.parse(
        fs.readFileSync(METADATA_JSON, 'utf8')
      );

      const model = await tf.loadLayersModel(
        tf.io.fromMemory(readModelArtifacts(MODEL_JSON))
      );

      return {
        model,
        labels: metadata.labels,
        imageSize: metadata.imageSize || 224,
      };
    })();

    modelPromise.catch(() => {
      modelPromise = null;
    });
  }

  return modelPromise;
};

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
    return {
      labels,
      probabilities: Array.from(await output.data()),
    };
  } finally {
    input.dispose();
    output.dispose();
  }
};

const unavailable = (message) => ({
  issueType: 'other',
  confidence: null,
  detected: false,
  modelAvailable: false,
  message,
});

const toResult = (labels, probabilities) => {
  if (
    !Array.isArray(labels) ||
    !Array.isArray(probabilities) ||
    labels.length === 0 ||
    labels.length !== probabilities.length ||
    probabilities.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
    )
  ) {
    return unavailable('Invalid model prediction output');
  }

  let topIndex = 0;

  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[topIndex]) {
      topIndex = i;
    }
  }

  const topProbability = probabilities[topIndex];

  if (topProbability < MIN_DETECTION_PROBABILITY) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: true,
      message: 'No issue type was confident enough',
    };
  }

  let runnerUpProbability = 0;

  for (let i = 0; i < probabilities.length; i++) {
    if (
      i !== topIndex &&
      probabilities[i] > runnerUpProbability
    ) {
      runnerUpProbability = probabilities[i];
    }
  }

  if (
    topProbability - runnerUpProbability <
    AMBIGUITY_MARGIN
  ) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: true,
      message: 'Two issue types were almost equally likely',
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
    const { labels, probabilities } =
      await predictProbabilities(imagePath);

    return toResult(labels, probabilities);
  } catch (error) {
    console.error(
      '[image-classifier] Classification failed:',
      error.message
    );

    return unavailable('Image classification failed');
  }
};

module.exports = {
  classifyImage,
  toResult,
  LABEL_MAP,
  MIN_DETECTION_PROBABILITY,
  AMBIGUITY_MARGIN,
};
