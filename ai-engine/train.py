"""
Train a YOLOv8 object-detection model on the ResolveNet civic-issues dataset.

Dataset: ai-engine/dataset/Civic-issues.v1i.yolov8 (Roboflow export, YOLOv8 format)
Classes (unchanged from the original dataset, 5 classes):
    0 fallen_tree
    1 garbage
    2 pothole
    3 streetlight
    4 water_leak

Usage:
    .venv/Scripts/python.exe train.py [--epochs 50] [--imgsz 640] [--batch 16]

Results are written under ai-engine/runs/detect/<name>/, including
weights/best.pt and weights/last.pt.
"""

import argparse
import os

import torch
from ultralytics import YOLO

AI_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_YAML = os.path.join(AI_ENGINE_DIR, "data.yaml")
RUNS_DIR = os.path.join(AI_ENGINE_DIR, "runs")


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 on the ResolveNet civic-issues dataset")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=None, help="Batch size; auto-chosen from hardware if omitted")
    parser.add_argument("--fraction", type=float, default=1.0, help="Fraction of training data to use (for quick benchmarks)")
    parser.add_argument("--name", type=str, default="civic_issues_yolov8n", help="Run name under runs/detect/")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base model weights")
    parser.add_argument("--resume", action="store_true", help="Resume the most recent interrupted run")
    args = parser.parse_args()

    device = 0 if torch.cuda.is_available() else "cpu"

    if args.batch is None:
        if device == 0:
            batch = 16
        else:
            # CPU-only box: keep batch modest to bound RAM use and per-step latency.
            batch = 8
    else:
        batch = args.batch

    print(f"Device: {'GPU (cuda:0)' if device == 0 else 'CPU'}")
    print(f"Batch size: {batch}")
    print(f"Epochs: {args.epochs}, imgsz: {args.imgsz}, fraction: {args.fraction}")
    print(f"Data config: {DATA_YAML}")

    model = YOLO(args.model)

    model.train(
        data=DATA_YAML,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=batch,
        device=device,
        fraction=args.fraction,
        project=RUNS_DIR,
        name=args.name,
        resume=args.resume,
        workers=min(8, os.cpu_count() or 4),
        patience=50,  # no early stopping within the 50-epoch budget
        verbose=True,
    )


if __name__ == "__main__":
    main()
