// Standalone load test for the Teachable Machine image model.
// Usage: node test/teachableMachineModelLoad.js [path/to/image]
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { Jimp } = require('jimp');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODEL_DIR = path.join(PROJECT_ROOT, 'ai-engine', 'model', 'teachable_machine');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');
const DEFAULT_IMAGE = path.join(
  PROJECT_ROOT,
  'ai-engine',
  'dataset',
  'Civic-issues-v2',
  'test',
  'images',
  '2_jpg.rf.dae424121b1f4b1c526a1f84cb6dd653.jpg'
);

// Reads model.json and every weight shard it lists, then hands them to tfjs as
// in-memory artifacts. Plain @tensorflow/tfjs has no Node file-system loader,
// so tf.loadLayersModel('file://...') would not work here.
function readModelArtifacts(modelJsonPath) {
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
}

// Resizes to 224x224 and scales RGB to [-1, 1] with x / 127 - 1, which matches
// the normalization used by the Teachable Machine image library.
async function imageToTensor(imagePath, size) {
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
}

async function main() {
  const imagePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_IMAGE;

  console.log('tfjs version :', tf.version.tfjs);
  console.log('model.json   :', MODEL_JSON, fs.existsSync(MODEL_JSON) ? '(found)' : '(MISSING)');
  console.log('metadata.json:', METADATA_JSON, fs.existsSync(METADATA_JSON) ? '(found)' : '(MISSING)');
  console.log('image        :', imagePath, fs.existsSync(imagePath) ? '(found)' : '(MISSING)');

  const metadata = JSON.parse(fs.readFileSync(METADATA_JSON, 'utf8'));
  const labels = metadata.labels;
  const imageSize = metadata.imageSize || 224;

  const artifacts = readModelArtifacts(MODEL_JSON);
  const weightBytes = artifacts.weightData.byteLength;
  console.log(`weights      : ${artifacts.weightSpecs.length} tensors, ${weightBytes} bytes`);

  const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
  console.log('model loaded : input shape', JSON.stringify(model.inputs[0].shape),
    '| output shape', JSON.stringify(model.outputs[0].shape));

  const input = await imageToTensor(imagePath, imageSize);
  const output = model.predict(input);
  const probs = Array.from(await output.data());

  const ranked = labels
    .map((label, i) => ({ label, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);

  console.log('\npredictions:');
  for (const { label, probability } of ranked) {
    console.log(`  ${label.padEnd(18)} ${(probability * 100).toFixed(2)}%  (${probability.toFixed(6)})`);
  }

  input.dispose();
  output.dispose();
  model.dispose();
}

main().catch((err) => {
  console.error('\nTEST FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
