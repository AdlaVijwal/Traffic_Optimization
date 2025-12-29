"""Shared data models for Module 1."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass
class Detection:
    """Represents a single detected object."""

    bbox: Sequence[float]
    confidence: float
    class_id: int
    class_name: str
