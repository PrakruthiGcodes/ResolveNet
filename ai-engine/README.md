# ResolveNet AI Engine

This folder holds the image models and training material for ResolveNet. It contains two separate pipelines. Only one of them is used by the running application.

## 1. Runtime image classifier (used by the application)

**Location:** `model/teachable_machine/`

| File | Purpose |
| --- | --- |
| `model.json` | Model architecture (TensorFlow.js layers format) |
| `weights.bin` | Model weights |
| `metadata.json` | Class labels and input size (224 × 224) |

The backend loads these files in Node.js with TensorFlow.js. The code is in [`backend/services/teachableMachineClassifier.js`](../backend/services/teachableMachineClassifier.js). No Python is needed to run it.

**Input:** one photo per complaint (JPEG, PNG, GIF, or WEBP, up to 5 MB). The image is resized to 224 × 224 and its RGB values are scaled to −1 to 1.

**Output classes**, from `metadata.json`:

| Model label | App issue type |
| --- | --- |
| `pathhole` (the model's spelling of pothole) | pothole |
| `Garbageoverflow` | garbage |
| `waterleakage` | water_leakage |
| `streetlight` | streetlight |
| `fallentree` | other |

**Measured result:** 78 of 195 correct on the test split of the `Civic-issues-v2` dataset, an overall accuracy of 40.0%. Streetlight recall is 8.9% (11 of 123). The split is heavily imbalanced, and it has no garbage or "other" images. Real-world performance has not been established. The full per-class results and the decision thresholds are in the [root README](../README.md#ai-image-classification).

**Evaluation script:** `backend/scripts/evaluateImageModel.js` reads the labelled dataset and prints metrics. It does not change the model or the data.

**Important:** `ai-engine/.gitignore` must not exclude `model/teachable_machine/`. Without these three files, the application cannot classify photos, and every complaint with a photo needs the citizen to confirm its issue type.

## 2. Legacy YOLOv8 pipeline (not used by the running application)

This was an earlier object-detection approach. The running application does not call it.

| File | Purpose |
| --- | --- |
| `model/best.pt` | YOLOv8 weights trained on the civic-issue dataset |
| `train.py` | Local training script |
| `colab_train.py`, `COLAB_TRAINING.md`, `COLAB_TRAINING_V2.md`, `data_colab_v2.yaml` | Google Colab training notes and configuration |
| `validate_dataset.py` | Dataset checks |
| `inference.py` | Runs `best.pt` on one image and prints JSON detections |
| `data.yaml` | Dataset configuration for local training, with paths relative to `ai-engine/`. Its YOLO classes are `fallen_tree`, `garbage`, `pothole`, `streetlight`, and `water_leak`. |
| `classes.json` | The five app issue categories (`pothole`, `garbage`, `water_leakage`, `streetlight`, `other`) |
| `requirements.txt` | Python packages for the YOLO scripts (`ultralytics`, `torch`, `opencv-python`, and others) |

`backend/services/imageClassifier.js` was written to call `inference.py`, but no part of the running backend imports it. It is kept for reference only.

To run the legacy scripts you would need Python, the packages in `requirements.txt`, and the dataset folder `ai-engine/dataset/`. The dataset and training outputs (`ai-engine/dataset/`, `ai-engine/runs/`) are git-ignored and are not part of the repository.

Example of the legacy inference command, from the project root (not needed to run the application):

```powershell
.venv\Scripts\python.exe ai-engine\inference.py <image-path> --weights ai-engine\model\best.pt
```

## Folder contents at a glance

```
ai-engine/
├── model/
│   ├── teachable_machine/   Runtime model used by the application
│   ├── best.pt              Legacy YOLO weights (not used at runtime)
│   └── .gitkeep
├── classes.json             Legacy YOLO class names
├── data.yaml                Legacy YOLO dataset configuration
├── data_colab_v2.yaml       Colab dataset configuration
├── train.py                 Legacy: local YOLO training
├── colab_train.py           Legacy: Colab YOLO training
├── inference.py             Legacy: YOLO inference
├── validate_dataset.py      Legacy: dataset checks
├── requirements.txt         Python packages for the legacy scripts
├── COLAB_TRAINING.md        Colab training steps
├── COLAB_TRAINING_V2.md     Colab training steps (version 2)
└── .gitignore               Git exclusions for this folder
```

## Limitations

- The runtime model's accuracy is low, particularly for streetlights. Treat its output as a suggestion that the citizen confirms, not a verified result.
- The thresholds in the backend (0.25, 0.15, and 0.5) are not validated on labelled data.
- The legacy YOLO weights were not used in the application, so their results are not reported as application results.
