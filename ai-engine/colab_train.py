"""
GPU/Colab continuation training for the ResolveNet YOLOv8n civic-issues detector.

This script is meant to run on Google Colab (or any CUDA machine), NOT locally.
It loads the existing CPU-trained checkpoint (best.pt, 7 epochs completed) as the
starting weights and continues training for additional epochs on GPU.

Note: best.pt from a normally-completed Ultralytics run has its optimizer/EMA
state stripped (this was confirmed by inspecting the checkpoint). Loading it here
starts a fresh optimizer and LR schedule from these weights - it is a continuation
fine-tune, not a state-preserving resume.

Usage (in a Colab cell, after uploading/mounting the dataset and best.pt):
    !python colab_train.py \
        --weights /content/best.pt \
        --data /content/data.yaml \
        --epochs 15 \
        --project /content/runs \
        --name civic_issues_yolov8n_gpu_add15

Results (weights, results.csv, plots) are written under:
    <project>/<name>/weights/best.pt
    <project>/<name>/weights/last.pt

`exist_ok=False` (the default) means Ultralytics will never overwrite an existing
run directory - if <name> already exists it auto-increments (e.g. name2, name3),
so previous runs are always preserved.
"""

import argparse
import subprocess
import sys


def ensure_ultralytics(version: str = "8.4.143") -> None:
    """Install the exact Ultralytics version used for the CPU baseline, if missing."""
    try:
        import ultralytics

        if ultralytics.__version__ != version:
            print(
                f"WARNING: installed ultralytics=={ultralytics.__version__} "
                f"differs from the CPU baseline version {version}. "
                f"Run: pip install ultralytics=={version}"
            )
    except ImportError:
        print(f"ultralytics not found, installing =={version} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", f"ultralytics=={version}"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Continue ResolveNet YOLOv8n training on GPU (Colab)")
    parser.add_argument("--weights", type=str, required=True,
                         help="Path to the starting checkpoint, e.g. /content/best.pt "
                              "(the CPU-trained 7-epoch model)")
    parser.add_argument("--data", type=str, required=True,
                         help="Path to data.yaml on this machine, e.g. /content/data.yaml "
                              "(must point at the uploaded dataset's train/valid/test/images dirs)")
    parser.add_argument("--epochs", type=int, default=15,
                         help="Additional epochs to train (default: 15)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size (matches CPU baseline: 640)")
    parser.add_argument("--batch", type=int, default=8,
                         help="Batch size (CPU baseline used 8; raise this on GPU, e.g. 16-32, if VRAM allows)")
    parser.add_argument("--workers", type=int, default=8,
                         help="Dataloader workers (CPU run was forced to 0; Colab can use more)")
    parser.add_argument("--project", type=str, default="/content/runs",
                         help="Directory under which the new run folder is created")
    parser.add_argument("--name", type=str, default="civic_issues_yolov8n_gpu_add15",
                         help="New run name - must not collide with any existing local run name")
    parser.add_argument("--patience", type=int, default=50, help="Early-stopping patience (baseline: 50)")
    args = parser.parse_args()

    ensure_ultralytics()

    import torch
    from ultralytics import YOLO

    if torch.cuda.is_available():
        device = 0
        print(f"CUDA GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        device = "cpu"
        print("WARNING: no CUDA GPU detected - falling back to CPU. "
              "In Colab, set Runtime > Change runtime type > GPU.")

    print(f"Loading starting weights: {args.weights}")
    model = YOLO(args.weights)

    print(f"Training {args.epochs} additional epochs on device={device}")
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        workers=args.workers,
        project=args.project,
        name=args.name,
        exist_ok=False,   # never overwrite an existing run directory
        patience=args.patience,
        verbose=True,
        plots=True,
    )

    run_dir = model.trainer.save_dir
    best_path = run_dir / "weights" / "best.pt"
    print(f"\nTraining complete. New run directory: {run_dir}")
    print(f"New best.pt: {best_path}")

    print("\nRunning post-training validation...")
    trained = YOLO(str(best_path))
    for split in ["val", "test"]:
        print(f"\n=== {split.upper()} SPLIT ===")
        metrics = trained.val(data=args.data, split=split, device=device, verbose=False)
        print(f"Precision: {metrics.box.mp:.4f}")
        print(f"Recall:    {metrics.box.mr:.4f}")
        print(f"mAP50:     {metrics.box.map50:.4f}")
        print(f"mAP50-95:  {metrics.box.map:.4f}")

    print(f"\nFinal model to download: {best_path}")


if __name__ == "__main__":
    main()
