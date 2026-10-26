"""
Dataset validation for the ResolveNet YOLOv8 civic-issues dataset.

Checks, per split (train/valid/test):
  - every image has a matching label file (and vice versa)
  - every label file is well-formed YOLO format (5+ whitespace-separated
    floats per line, class_id first)
  - every class_id is within [0, nc)
  - every bbox coordinate is within [0, 1]
  - images actually open and are non-zero size

Does NOT modify anything under dataset/. Read-only.
"""

import os
import sys
import yaml
from PIL import Image

AI_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_ROOT = os.path.join(AI_ENGINE_DIR, "dataset", "Civic-issues.v1i.yolov8")
DATA_YAML = os.path.join(DATASET_ROOT, "data.yaml")


def load_data_yaml():
    with open(DATA_YAML, "r") as f:
        return yaml.safe_load(f)


def resolve_split_dir(split_rel_path):
    # NOTE: data.yaml declares paths like "../train/images", which would normally
    # mean "sibling of the folder containing data.yaml". But in this extracted
    # dataset, train/valid/test actually live INSIDE the Civic-issues.v1i.yolov8
    # folder alongside data.yaml, not beside it. The "../" in data.yaml is stale
    # from how Roboflow structures exports before extraction. We resolve against
    # the real on-disk layout here (read-only check); the actual fix is a
    # corrected training-time data yaml, not an edit to the original file.
    basename = os.path.basename(os.path.normpath(split_rel_path))  # "images"
    split_folder = os.path.basename(os.path.dirname(os.path.normpath(split_rel_path)))  # "train" / "valid" / "test"
    return os.path.join(DATASET_ROOT, split_folder, basename)


def validate_split(name, images_dir, nc):
    problems = []
    if not os.path.isdir(images_dir):
        problems.append(f"[{name}] images dir does not exist: {images_dir}")
        return problems, 0, 0

    labels_dir = os.path.join(os.path.dirname(images_dir), "labels")
    if not os.path.isdir(labels_dir):
        problems.append(f"[{name}] labels dir does not exist: {labels_dir}")
        return problems, 0, 0

    image_files = sorted(f for f in os.listdir(images_dir) if not f.startswith("."))
    label_files = sorted(f for f in os.listdir(labels_dir) if f.endswith(".txt"))

    image_stems = {os.path.splitext(f)[0] for f in image_files}
    label_stems = {os.path.splitext(f)[0] for f in label_files}

    missing_labels = image_stems - label_stems
    orphan_labels = label_stems - image_stems

    if missing_labels:
        problems.append(f"[{name}] {len(missing_labels)} images missing label files, e.g. {list(missing_labels)[:5]}")
    if orphan_labels:
        problems.append(f"[{name}] {len(orphan_labels)} label files with no matching image, e.g. {list(orphan_labels)[:5]}")

    total_boxes = 0
    bad_images = 0
    for img_name in image_files:
        img_path = os.path.join(images_dir, img_name)
        try:
            with Image.open(img_path) as im:
                im.verify()
        except Exception as e:
            problems.append(f"[{name}] unreadable/corrupt image: {img_name} ({e})")
            bad_images += 1

        stem = os.path.splitext(img_name)[0]
        label_path = os.path.join(labels_dir, stem + ".txt")
        if not os.path.exists(label_path):
            continue

        with open(label_path, "r") as f:
            lines = [ln.strip() for ln in f if ln.strip()]

        for i, line in enumerate(lines):
            parts = line.split()
            if len(parts) != 5:
                problems.append(f"[{name}] {stem}.txt line {i+1}: expected 5 fields, got {len(parts)}: '{line}'")
                continue
            try:
                cls_id = int(float(parts[0]))
                coords = [float(p) for p in parts[1:]]
            except ValueError:
                problems.append(f"[{name}] {stem}.txt line {i+1}: non-numeric field: '{line}'")
                continue

            if cls_id < 0 or cls_id >= nc:
                problems.append(f"[{name}] {stem}.txt line {i+1}: class_id {cls_id} out of range [0,{nc})")

            for c in coords:
                if c < 0.0 or c > 1.0:
                    problems.append(f"[{name}] {stem}.txt line {i+1}: coordinate {c} out of range [0,1]")
                    break

            total_boxes += 1

    return problems, len(image_files), total_boxes


def main():
    data = load_data_yaml()
    nc = data["nc"]
    names = data["names"]
    print(f"data.yaml: nc={nc} names={names}")

    all_problems = []
    summary = {}
    for split_key, split_name in [("train", "train"), ("val", "valid"), ("test", "test")]:
        rel_path = data.get(split_key)
        if not rel_path:
            continue
        images_dir = resolve_split_dir(rel_path)
        problems, n_images, n_boxes = validate_split(split_name, images_dir, nc)
        all_problems.extend(problems)
        summary[split_name] = {"images": n_images, "boxes": n_boxes}

    print("\n=== Summary ===")
    for split, s in summary.items():
        print(f"{split}: {s['images']} images, {s['boxes']} bounding boxes")

    print(f"\n=== Problems found: {len(all_problems)} ===")
    for p in all_problems[:100]:
        print(" -", p)
    if len(all_problems) > 100:
        print(f"... and {len(all_problems) - 100} more")

    if all_problems:
        sys.exit(1)
    else:
        print("\nDataset validation PASSED: no missing files, no invalid class IDs, no out-of-range coordinates, no corrupt images.")
        sys.exit(0)


if __name__ == "__main__":
    main()
