"""Lane segmentation and counting service."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence

import yaml

from ..models import Detection
from ..utils.geometry import bbox_center, polygon_contains_point

LOGGER = logging.getLogger(__name__)


@dataclass
class LaneDefinition:
    name: str
    polygon: Sequence[Sequence[float]]


@dataclass
class SignalRegion:
    direction: str
    roi: Sequence[int]

    def bounds(self) -> tuple[int, int, int, int]:
        x1, y1, x2, y2 = self.roi
        return int(x1), int(y1), int(x2), int(y2)


@dataclass
class LaneConfig:
    junction_id: str
    junction_type: str
    frame_width: int
    frame_height: int
    lanes: List[LaneDefinition]
    signal_regions: Dict[str, SignalRegion] = field(default_factory=dict)

    @classmethod
    def from_yaml(cls, path: Path) -> "LaneConfig":
        with path.open("r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)
        lanes = [
            LaneDefinition(name=name, polygon=points)
            for name, points in payload.get("lanes", {}).items()
        ]
        signal_regions: Dict[str, SignalRegion] = {}
        raw_regions = payload.get("signal_regions", {}) or {}
        for direction, region_values in raw_regions.items():
            if isinstance(region_values, dict):
                roi = region_values.get("roi")
            else:
                roi = region_values
            if not isinstance(roi, (list, tuple)) or len(roi) != 4:
                continue
            signal_regions[str(direction)] = SignalRegion(direction=str(direction), roi=[int(v) for v in roi])

        return cls(
            junction_id=payload.get("junction_id", "junction_01"),
            junction_type=str(payload.get("junction_type", "unknown")),
            frame_width=int(payload.get("frame_width", 1280)),
            frame_height=int(payload.get("frame_height", 720)),
            lanes=lanes,
            signal_regions=signal_regions,
        )

    def for_directions(self, directions: Iterable[str]) -> "LaneConfig":
        direction_set = {direction for direction in directions}
        filtered_lanes = [lane for lane in self.lanes if lane.name in direction_set]
        filtered_regions = {
            name: region
            for name, region in self.signal_regions.items()
            if name in direction_set
        }
        return LaneConfig(
            junction_id=self.junction_id,
            junction_type=self.junction_type,
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            lanes=filtered_lanes,
            signal_regions=filtered_regions,
        )

    def signal_roi(self, direction: str) -> Optional[tuple[int, int, int, int]]:
        region = self.signal_regions.get(direction)
        if not region:
            return None
        return region.bounds()


@dataclass
class LaneAssignment:
    detection: Detection
    lane: str


@dataclass
class LaneCounts:
    frame_counts: Dict[str, int] = field(default_factory=dict)
    totals: Dict[str, int] = field(default_factory=dict)
    vehicle_buckets: Dict[str, int] = field(default_factory=dict)
    assignments: List[LaneAssignment] = field(default_factory=list)


class LaneMapper:
    """Assigns detections to configured lane polygons and maintains counts."""

    HEAVY_CLASSES = {"bus", "truck"}
    TWO_WHEELER_CLASSES = {"motorcycle", "bicycle"}
    SIGNAL_CLASSES = {"traffic light"}

    def __init__(self, config: LaneConfig) -> None:
        self.config = config
        self._lane_polygons: Dict[str, Sequence[Sequence[float]]] = {
            lane.name: lane.polygon for lane in config.lanes
        }
        self._running_totals: MutableMapping[str, int] = {lane.name: 0 for lane in config.lanes}
        LOGGER.info("Lane mapper initialized for junction %s", config.junction_id)

    def assign(self, detection: Detection) -> str | None:
        """Return the name of the lane containing the detection center."""

        point = bbox_center(detection.bbox)
        for lane_name, polygon in self._lane_polygons.items():
            if polygon_contains_point(polygon, point):
                return lane_name
        return None

    def aggregate(self, detections: Iterable[Detection]) -> LaneCounts:
        """Compute counts for current frame and update running totals."""

        frame_counts: Dict[str, int] = {lane: 0 for lane in self._lane_polygons}
        vehicle_buckets: Dict[str, int] = {
            "vehicles": 0,
            "two_wheelers": 0,
            "heavy": 0,
            "signals": 0,
        }
        assignments: List[LaneAssignment] = []

        for detection in detections:
            lane_name = self.assign(detection)
            if lane_name is None:
                continue
            frame_counts[lane_name] += 1
            if detection.class_name in self.SIGNAL_CLASSES:
                vehicle_buckets["signals"] += 1
            else:
                vehicle_buckets["vehicles"] += 1
                if detection.class_name in self.HEAVY_CLASSES:
                    vehicle_buckets["heavy"] += 1
                if detection.class_name in self.TWO_WHEELER_CLASSES:
                    vehicle_buckets["two_wheelers"] += 1
            assignments.append(LaneAssignment(detection=detection, lane=lane_name))

        for lane, count in frame_counts.items():
            self._running_totals[lane] += count

        totals = dict(self._running_totals)
        return LaneCounts(
            frame_counts=frame_counts,
            totals=totals,
            vehicle_buckets=vehicle_buckets,
            assignments=assignments,
        )

    def snapshot_totals(self) -> Mapping[str, int]:
        """Return a copy of the running total counts."""

        return dict(self._running_totals)

    def reset_totals(self) -> None:
        """Reset running totals to zero (mainly for testing)."""

        for key in self._running_totals:
            self._running_totals[key] = 0
