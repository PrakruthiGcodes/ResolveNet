# ResolveNet YOLOv8n — GPU Training on Colab using Civic-issues-v2

This fine-tunes the existing checkpoint (`civic_issues_yolov8n_5ep_resume5/weights/best.pt`)
further on the combined dataset `Civic-issues-v2` (ResolveNet v1 + supplemental
water-leak data, water-leak remapped to class index 4). It reuses the same
`colab_train.py` used for the v1 GPU run — that script is dataset-agnostic
(driven entirely by `--data`/`--weights`/`--project`/`--name`), so it needed
no code changes. This doc, and the run name below, are new and separate from
`COLAB_TRAINING.md` / the v1 GPU run.

## 1. Files to upload/copy to Colab

| Local file | Colab destination | Purpose |
|---|---|---|
| `ai-engine/runs/civic_issues_yolov8n_5ep_resume5/weights/best.pt` | `/content/best.pt` | Starting weights (unchanged checkpoint) |
| `ai-engine/colab_train.py` | `/content/colab_train.py` | Training script (unmodified, reused) |
| `ai-engine/data_colab_v2.yaml` | `/content/data.yaml` | Colab-path data config for v2 |
| `ai-engine/dataset/Civic-issues-v2/` (zip first, ~554 MB) | `/content/dataset/Civic-issues-v2/` | Combined dataset (train/valid/test) |

Zip the dataset locally first (PowerShell, from the repo root):
```powershell
Compress-Archive -Path "ai-engine\dataset\Civic-issues-v2\*" -DestinationPath "Civic-issues-v2.zip"
```
Upload `Civic-issues-v2.zip` to Google Drive, then in Colab mount Drive and
unzip into `/content/dataset/Civic-issues-v2/`. This is far more reliable than
uploading ~7,000 individual files through the browser.

This does not read from or modify `Civic-issues.v1i.yolov8/` or the original
water-leak source dataset at all — `Civic-issues-v2` is a fully independent,
already-merged copy.

## 2. Select GPU runtime (Tesla T4)

In Colab: **Runtime > Change runtime type > Hardware accelerator > GPU**
(T4 is the standard free-tier GPU). Verify with:
```python
!nvidia-smi
```

## 3. Install dependencies

```python
!pip install ultralytics==8.4.143
```
Same pinned version as the v1 CPU/GPU runs, to avoid behavior drift.

## 4. Run training

```python
!python /content/colab_train.py \
    --weights /content/best.pt \
    --data /content/data.yaml \
    --epochs 20 \
    --batch 32 \
    --imgsz 640 \
    --workers 8 \
    --patience 20 \
    --project /content/runs \
    --name civic_issues_yolov8n_v2_gpu_t4
```

**Configuration rationale:**
- `--epochs 20`: this is a fine-tune continuation from an already-trained
  checkpoint (not training from scratch), but v2 roughly doubles total images
  (5454 -> ~6936) and increases water_leak objects from 80 to 2348, so a
  modestly larger budget than the prior 15-epoch GPU continuation is
  reasonable to let the model adapt to the newly-balanced class. Not large
  enough to risk excessive overfitting/runtime on a single Colab session.
- `--batch 32`: T4 has 16 GB VRAM; YOLOv8n at imgsz 640 is small enough that
  batch 32 comfortably fits with AMP (Ultralytics enables mixed precision by
  default on CUDA). Drop to `--batch 16` if you hit an out-of-memory error.
- `--patience 20`: equal to `--epochs`, so early stopping won't cut the run
  short within this modest budget, while still being available if you raise
  `--epochs` later.
- `--name civic_issues_yolov8n_v2_gpu_t4`: distinct from every existing run
  name (`civic_issues_yolov8n_5ep`, `civic_issues_yolov8n_5ep_resume5`, and
  the v1-doc's `civic_issues_yolov8n_gpu_add15`), so it cannot collide with
  or overwrite any of them. `colab_train.py` also runs with `exist_ok=False`,
  so Ultralytics will refuse to silently overwrite this folder if it exists.
- `--data /content/data.yaml` points at Civic-issues-v2 only, via
  `data_colab_v2.yaml`'s Colab-absolute paths.

The script auto-detects CUDA (`device=0`) and prints the detected GPU name;
it will warn and fall back to CPU if the GPU runtime isn't enabled.

## 5. Validation (already built into colab_train.py)

After training, the script automatically runs `model.val()` on both the
`val` and `test` splits of Civic-issues-v2 and prints Precision, Recall,
mAP50, and mAP50-95 for each — no extra step needed. Because v2's `test`
split is byte-identical to the original v1 `test` set, this test-split
validation is directly comparable to prior runs' test metrics, and also
evaluates all 5 classes fairly (not just water_leak).

## 6. Output model path

```
/content/runs/civic_issues_yolov8n_v2_gpu_t4/weights/best.pt
```
(with `last.pt`, `results.csv`, and plots alongside it).

## 7. Bring the result back locally

```python
!cp -r /content/runs/civic_issues_yolov8n_v2_gpu_t4 /content/drive/MyDrive/ResolveNet_runs/
```
or download directly:
```python
from google.colab import files
files.download('/content/runs/civic_issues_yolov8n_v2_gpu_t4/weights/best.pt')
```

Place the result locally at a **new** path, e.g.:
```
ai-engine/runs/civic_issues_yolov8n_v2_gpu_t4/weights/best.pt
```
This sits alongside (never overwrites) `civic_issues_yolov8n_5ep/` and
`civic_issues_yolov8n_5ep_resume5/`. The existing `best.pt` used elsewhere
in the project (e.g. by the backend, if referenced) is untouched unless you
explicitly choose to point something at the new file later — that swap is
a separate decision, not part of this preparation step.
