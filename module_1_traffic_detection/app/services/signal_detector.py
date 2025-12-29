"""Signal light color detection utilities."""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Optional, Tuple

import cv2
import numpy as np


ColorRatioMap = Dict[str, float]
ROI = Tuple[int, int, int, int]


class SignalLightDetector:
    """Infer traffic signal color from configured regions of interest."""

    DEFAULT_THRESHOLD = 0.05

    def __init__(self, regions: Mapping[str, ROI]) -> None:
        self._regions: Dict[str, ROI] = {direction: self._sanitize_roi(bounds) for direction, bounds in regions.items()}

    @staticmethod
    def _sanitize_roi(bounds: ROI) -> ROI:
        x1, y1, x2, y2 = bounds
        if x2 < x1 or y2 < y1:
            raise ValueError(f"Invalid ROI bounds: {bounds}")
        return int(x1), int(y1), int(x2), int(y2)

    def directions(self) -> Iterable[str]:
        return self._regions.keys()

    def has_region(self, direction: str) -> bool:
        return direction in self._regions

    def detect(self, direction: str, frame: np.ndarray, detections: Optional[Iterable[object]] = None) -> str:
        """
        Detect signal color.
        
        If 'detections' (list of Detection objects) is provided, it attempts to find a 'traffic light' object
        and analyze its color. If no traffic light object is found (or detections is None), it falls back
        to the configured ROI (Region of Interest) for that direction.
        """
        # 1. Try Auto-Detection from YOLO results first (if available)
        if detections:
            # Filter for traffic lights with high confidence
            lights = [d for d in detections if d.class_name == "traffic light"]
            if lights:
                # Heuristic: Pick the largest traffic light (closest to camera)
                # bbox is [x1, y1, x2, y2]
                best_light = max(lights, key=lambda d: (d.bbox[2] - d.bbox[0]) * (d.bbox[3] - d.bbox[1]))
                x1, y1, x2, y2 = map(int, best_light.bbox)
                return self._analyze_patch(frame, (x1, y1, x2, y2))

        # 2. Fallback to Fixed ROI
        roi = self._regions.get(direction)
        if not roi:
            return "unknown"
        return self._analyze_patch(frame, roi)

    def _analyze_patch(self, frame: np.ndarray, roi: ROI) -> str:
        x1, y1, x2, y2 = roi
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return "unknown"
        patch = frame[y1:y2, x1:x2]
        if patch.size == 0:
            return "unknown"

        hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
        ratios = self._compute_color_ratios(hsv)
        label, confidence = max(ratios.items(), key=lambda item: item[1])
        if confidence < self.DEFAULT_THRESHOLD:
            return "unknown"
        return label

    def _compute_color_ratios(self, hsv_frame: np.ndarray) -> ColorRatioMap:
        green_mask = cv2.inRange(hsv_frame, (35, 60, 60), (90, 255, 255))
        yellow_mask = cv2.inRange(hsv_frame, (20, 80, 120), (35, 255, 255))
        red_mask_lower = cv2.inRange(hsv_frame, (0, 70, 50), (10, 255, 255))
        red_mask_upper = cv2.inRange(hsv_frame, (160, 70, 50), (180, 255, 255))
        red_mask = cv2.bitwise_or(red_mask_lower, red_mask_upper)

        total_pixels = float(hsv_frame.shape[0] * hsv_frame.shape[1])
        if total_pixels == 0:
            return {"red": 0.0, "yellow": 0.0, "green": 0.0}

        ratios: ColorRatioMap = {
            "green": float(cv2.countNonZero(green_mask)) / total_pixels,
            "yellow": float(cv2.countNonZero(yellow_mask)) / total_pixels,
            "red": float(cv2.countNonZero(red_mask)) / total_pixels,
        }
        return ratios