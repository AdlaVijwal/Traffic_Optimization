"""Video utilities for traffic detection module."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator, Iterable, Optional, Union

import cv2

LOGGER = logging.getLogger(__name__)


@dataclass
class Frame:
    index: int
    data: "np.ndarray"
    timestamp_ms: float


try:  # pragma: no cover - only imported when numpy available
    import numpy as np
except ImportError:  # pragma: no cover
    raise ImportError("numpy is required for the video utilities. Install via requirements.txt")


def open_video_source(source: Union[int, str]) -> cv2.VideoCapture:
    """Open a video capture object from an integer index or file path."""

    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open video source: {source}")
    LOGGER.info("Video source %s opened successfully", source)
    return capture


@contextmanager
def managed_capture(source: Union[int, str]) -> Generator[cv2.VideoCapture, None, None]:
    """Context manager ensuring capture release."""

    capture = open_video_source(source)
    try:
        yield capture
    finally:
        LOGGER.info("Releasing video source")
        capture.release()


def iter_frames(capture: cv2.VideoCapture, process_every: int = 1) -> Iterable[Frame]:
    """Yield frames from capture, optionally skipping frames for performance."""

    frame_idx = 0
    processed_idx = 0
    fps = capture.get(cv2.CAP_PROP_FPS) or 0
    while True:
        success, frame = capture.read()
        if not success:
            LOGGER.info("End of stream reached after %d frames", frame_idx)
            break
        frame_idx += 1
        if process_every > 1 and frame_idx % process_every != 0:
            continue
        processed_idx += 1
        timestamp_ms = (frame_idx / fps * 1000) if fps else 0.0
        yield Frame(index=processed_idx, data=frame, timestamp_ms=timestamp_ms)
