const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Image-based issue classifier, backed by the trained YOLOv8 model in
 * ai-engine/model/best.pt (invoked via ai-engine/inference.py).
 *
 * The YOLO model's own class names don't match the app's issue categories
 * one-to-one (e.g. it detects "water_leak" and "fallen_tree", not
 * "water_leakage"/"other"), so CLASS_MAP translates between them.
 */

const SUPPORTED_CLASSES = ['pothole', 'garbage', 'water_leakage', 'streetlight', 'other'];

// Maps the YOLO model's trained class names (ai-engine/data.yaml) to the
// app's issue categories (SUPPORTED_CLASSES above).
const CLASS_MAP = {
  pothole: 'pothole',
  garbage: 'garbage',
  streetlight: 'streetlight',
  water_leak: 'water_leakage',
  fallen_tree: 'other',
};

const AI_ENGINE_DIR = path.join(__dirname, '..', '..', 'ai-engine');
const INFERENCE_SCRIPT = path.join(AI_ENGINE_DIR, 'inference.py');
const PYTHON_PATH = path.join(AI_ENGINE_DIR, '.venv', 'Scripts', 'python.exe');
const INFERENCE_TIMEOUT_MS = 120000;

const runInferenceScript = (imagePath) =>
  new Promise((resolve, reject) => {
    execFile(
      PYTHON_PATH,
      [INFERENCE_SCRIPT, imagePath],
      { timeout: INFERENCE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        // inference.py exits non-zero on a handled error (e.g. missing
        // weights/image) but still prints a JSON {"error": ...} body, so
        // try to parse stdout before treating this as a hard failure.
        if (stdout) {
          try {
            resolve(JSON.parse(stdout));
            return;
          } catch (parseError) {
            // fall through to reject below
          }
        }
        reject(error || new Error('Inference script produced no output'));
      }
    );
  });

const pickBestDetection = (detections) =>
  detections.reduce(
    (best, detection) => (best === null || detection.confidence > best.confidence ? detection : best),
    null
  );

// Result shape:
//   detected       - true only when the model returned a detection.
//   confidence     - the model's own score, or null when there is no
//                    prediction. Never a made-up number.
//   modelAvailable - false when the model or image could not be used.
//   message        - present when there is no usable prediction.
const classifyImage = async (imagePath) => {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) {
      return {
        issueType: 'other',
        confidence: null,
        detected: false,
        modelAvailable: false,
        message: 'Image not available for classification',
      };
    }

    if (!fs.existsSync(PYTHON_PATH)) {
      return {
        issueType: 'other',
        confidence: null,
        detected: false,
        modelAvailable: false,
        message: 'Python environment for image classification is not set up',
      };
    }

    const result = await runInferenceScript(imagePath);

    if (result.error) {
      return {
        issueType: 'other',
        confidence: null,
        detected: false,
        modelAvailable: false,
        message: result.error,
      };
    }

    const detections = Array.isArray(result.detections) ? result.detections : [];
    const best = pickBestDetection(detections);

    if (!best) {
      return {
        issueType: 'other',
        confidence: null,
        detected: false,
        modelAvailable: true,
        message: 'Model ran successfully but detected no known issue in the image',
      };
    }

    const issueType = CLASS_MAP[best.class_name] || 'other';

    return {
      issueType,
      confidence: best.confidence,
      detected: true,
      modelAvailable: true,
    };
  } catch (error) {
    return {
      issueType: 'other',
      confidence: null,
      detected: false,
      modelAvailable: false,
      message: 'Image classification failed',
    };
  }
};

module.exports = { classifyImage, SUPPORTED_CLASSES };
