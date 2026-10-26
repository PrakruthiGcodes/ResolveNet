# ResolveNet YOLOv8n — GPU Training on Google Colab

This continues training of the existing 7-epoch CPU-trained model for 15
additional epochs on a Colab GPU, using `colab_train.py`.

## 1. Files to upload/copy to Colab

| Local file | Colab destination | Purpose |
|---|---|---|
| `ai-engine/runs/civic_issues_yolov8n_5ep_resume5/weights/best.pt` | `/content/best.pt` | Starting weights (7 epochs completed) |
| `ai-engine/colab_train.py` | `/content/colab_train.py` | Training script |
| `ai-engine/dataset/Civic-issues.v1i.yolov8/` (zip it first, ~497 MB) | `/content/dataset/Civic-issues.v1i.yolov8/` | Full dataset (train/valid/test images + labels) |

You also need a **Colab-specific `data.yaml`** — the existing `ai-engine/data.yaml`
uses paths relative to the local `ai-engine/` folder, which do not exist on Colab.
Create a new file locally, e.g. `data_colab.yaml`, with the same class list but Colab paths:

```yaml
train: /content/dataset/Civic-issues.v1i.yolov8/train/images
val: /content/dataset/Civic-issues.v1i.yolov8/valid/images
test: /content/dataset/Civic-issues.v1i.yolov8/test/images

nc: 5
names: ['fallen_tree', 'garbage', 'pothole', 'streetlight', 'water_leak']
```

Upload this as `/content/data.yaml`. (This does not touch or modify the original
`ai-engine/data.yaml` — it's a separate new file for the Colab environment.)

**Recommended upload method for the dataset**: zip
`dataset/Civic-issues.v1i.yolov8/` locally, upload the zip to Google Drive, then
in Colab mount Drive and `unzip` it into `/content/dataset/`. This is far more
reliable than uploading ~5,454 individual files through the browser.

## 2. Install dependencies (in a Colab cell)

```python
!pip install ultralytics==8.4.143
```

This matches the exact Ultralytics version used for the CPU-trained baseline, to
avoid any behavior drift between the two training phases.

## 3. Run training (in a Colab cell)

```python
!python /content/colab_train.py \
    --weights /content/best.pt \
    --data /content/data.yaml \
    --epochs 15 \
    --batch 16 \
    --project /content/runs \
    --name civic_issues_yolov8n_gpu_add15
```

Notes:
- `--batch 16` is a reasonable starting point for a Colab GPU (T4/A100); the CPU
  baseline used `--batch 8` due to CPU memory/speed constraints. Raise or lower
  based on the GPU you're assigned and any out-of-memory errors.
- The script auto-detects CUDA and will warn (and fall back to CPU) if no GPU
  runtime is enabled — check **Runtime > Change runtime type > GPU** first.
- `--name` must not collide with a local run folder name if you later copy
  results back — the current local runs are `civic_issues_yolov8n_5ep` and
  `civic_issues_yolov8n_5ep_resume5`, so `civic_issues_yolov8n_gpu_add15` is
  already distinct from both.

## 4. Where the trained best.pt will be located

After training finishes, the script prints the exact path, which will be:

```
/content/runs/civic_issues_yolov8n_gpu_add15/weights/best.pt
```

(with `last.pt`, `results.csv`, and the standard plots alongside it in the same
`weights/`-parent folder). The script also runs validation automatically on both
the `val` and `test` splits and prints Precision/Recall/mAP50/mAP50-95 right
after training.

## 5. Download the trained model

In a Colab cell:

```python
from google.colab import files
files.download('/content/runs/civic_issues_yolov8n_gpu_add15/weights/best.pt')
```

Or, if you mounted Google Drive, just copy it there instead so it survives the
Colab session ending:

```python
!cp -r /content/runs/civic_issues_yolov8n_gpu_add15 /content/drive/MyDrive/ResolveNet_runs/
```

Once downloaded, place it locally at, e.g.:
```
ai-engine/runs/civic_issues_yolov8n_gpu_add15/weights/best.pt
```
This keeps it alongside (not overwriting) the existing
`civic_issues_yolov8n_5ep/` and `civic_issues_yolov8n_5ep_resume5/` runs.
