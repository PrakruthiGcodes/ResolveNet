"""
Run YOLOv8 object-detection inference with the trained ResolveNet civic-issues model.

Usage:
    .venv/Scripts/python.exe inference.py <image_path> [--weights model/best.pt] [--conf 0.25]

Prints a JSON object to stdout:
{
  "image": "<path>",
  "model": "<weights path>",
  "detections": [
    {
      "class_id": 2,
      "class_name": "pothole",
      "confidence": 0.87,
      "bbox_xyxy": [x1, y1, x2, y2]
    },
    ...
  ]
}

Supports multiple detections per image. If no weights are found, or the
image cannot be loaded, an error is reported in the JSON output rather
than a fabricated result.
"""

import argparse
import json
import os
import sys

AI_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_WEIGHTS = os.path.join(AI_ENGINE_DIR, "model", "best.pt")


def run_inference(image_path, weights_path, conf_threshold):
    if not os.path.exists(weights_path):
        return {"error": f"Model weights not found at {weights_path}. Train the model first (train.py)."}

    if not os.path.exists(image_path):
        return {"error": f"Image not found at {image_path}"}

    from ultralytics import YOLO

    model = YOLO(weights_path)
    results = model.predict(source=image_path, conf=conf_threshold, verbose=False)

    detections = []
    for result in results:
        names = result.names
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls.item())
            conf = float(box.conf.item())
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            detections.append({
                "class_id": cls_id,
                "class_name": names[cls_id],
                "confidence": round(conf, 4),
                "bbox_xyxy": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            })

    return {
        "image": image_path,
        "model": weights_path,
        "detections": detections,
    }


def main():
    parser = argparse.ArgumentParser(description="YOLOv8 civic-issue inference")
    parser.add_argument("image", type=str, help="Path to an image file")
    parser.add_argument("--weights", type=str, default=DEFAULT_WEIGHTS, help="Path to trained weights (best.pt)")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    result = run_inference(args.image, args.weights, args.conf)
    print(json.dumps(result, indent=2))

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
