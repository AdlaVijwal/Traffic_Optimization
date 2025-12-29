"""Geometry helper utilities for bounding boxes and polygons."""
from __future__ import annotations

from typing import Iterable, Sequence, Tuple

try:  # pragma: no cover - import guarded for optional dependency
    import cv2
    import numpy as np
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "opencv-python is required for geometry utilities. Install dependencies via "
        "`pip install -r requirements.txt`."
    ) from exc

BBox = Sequence[float]
Point = Tuple[float, float]


def bbox_center(bbox: BBox) -> Point:
    """Return the center point of a bounding box in xyxy format."""

    x1, y1, x2, y2 = bbox
    return (float((x1 + x2) / 2.0), float((y1 + y2) / 2.0))


def polygon_contains_point(polygon: Iterable[Point], point: Point) -> bool:
    """Return True if the point lies inside the polygon using OpenCV point test."""

    contour = np.array(list(polygon), dtype=np.float32)
    result = cv2.pointPolygonTest(contour, point, False)
    return result >= 0
