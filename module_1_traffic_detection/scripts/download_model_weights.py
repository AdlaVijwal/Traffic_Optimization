#!/usr/bin/env python3
"""Download YOLOv8 weights required for Module 1."""
from __future__ import annotations

import argparse
from pathlib import Path

import requests

MODEL_URLS = {
    "n": "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt",
    "s": "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.pt",
    "m": "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt",
    "l": "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8l.pt",
    "x": "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8x.pt",
}


def download_weights(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    target.write_bytes(response.content)
    print(f"Model weights downloaded to {target}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download YOLOv8 weights")
    parser.add_argument("--variant", choices=MODEL_URLS.keys(), default="m", help="YOLOv8 variant to download")
    parser.add_argument("--url", type=str, default=None, help="Model weights URL override")
    parser.add_argument("--output", type=Path, default=None, help="Destination path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    url = args.url or MODEL_URLS[args.variant]
    target = args.output or Path("module_1_traffic_detection/models") / Path(url).name
    download_weights(url, target)


if __name__ == "__main__":
    main()
    