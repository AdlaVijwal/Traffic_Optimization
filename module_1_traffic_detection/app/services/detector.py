"""YOLOv8 detection service wrapper."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, List

import numpy as np

try:  # pragma: no cover - import guarded for environments without ultralytics
    from ultralytics import YOLO
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "ultralytics package is required for Module 1 detection. Install dependencies via "
        "`pip install -r requirements.txt` before running detect.py."
    ) from exc

from ..models import Detection

LOGGER = logging.getLogger(__name__)


class YOLODetector:
    """Encapsulates YOLOv8 inference for traffic detection."""

    TARGET_CLASSES = {
        "person",
        "bicycle",
        "car",
        "motorcycle",
        "bus",
        "truck",
        "traffic light",
    }

    def __init__(self, model_path: Path, confidence: float, iou: float) -> None:
        self.model_path = model_path
        self.confidence = confidence
        self.iou = iou
        LOGGER.info("Loading YOLO model from %s", model_path)
        self._model = YOLO(str(model_path))
        self._class_map = self._model.names

    def predict(self, frame: np.ndarray) -> List[Detection]:
        """Run inference on a frame and return filtered detections."""

        results = self._model(
            frame,
            verbose=False,
            iou=self.iou,
            conf=self.confidence,
        )
        detections: List[Detection] = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(box.cls.item())
                class_name = self._class_map.get(class_id, str(class_id))
                if class_name not in self.TARGET_CLASSES:
                    continue
                confidence = float(box.conf.item())
                bbox = box.xyxy.cpu().numpy().flatten().tolist()
                detections.append(Detection(bbox=bbox, confidence=confidence, class_id=class_id, class_name=class_name))
        LOGGER.debug("Detected %d objects", len(detections))
        return detections

    @staticmethod
    def warm_up(model: "YOLODetector", frames: Iterable[np.ndarray], limit: int = 2) -> None:
        """Optionally warm up the model with a couple of frames to reduce latency spikes."""

        for idx, frame in enumerate(frames):
            if idx >= limit:
                break
            LOGGER.debug("Warming up model with frame %d", idx)
            _ = model.predict(frame)
