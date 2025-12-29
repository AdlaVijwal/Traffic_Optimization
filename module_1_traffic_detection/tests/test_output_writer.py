from __future__ import annotations

from pathlib import Path
from typing import Dict, List
from unittest.mock import MagicMock

import pytest
import numpy as np

from module_1_traffic_detection.app.config.settings import AppSettings
from module_1_traffic_detection.app.services.output_writer import (
    OutputManager,
    TrafficRecord,
    reset_output_state,
)


@pytest.fixture()
def settings(tmp_path: Path) -> AppSettings:
    return AppSettings(
        snapshot_dir=tmp_path / "frames",
        data_dir=tmp_path / "data",
        cache_dir=tmp_path / "cache",
        results_filename="results.json",
        push_api=False,
    )


def build_record(frame_id: int) -> TrafficRecord:
    return TrafficRecord(
        frame_id=frame_id,
        timestamp="2025-11-04T12:00:00.000Z",
        junction_id="test",
        counts={"north": 1},
        totals={"north": frame_id},
        latency_ms=12.3,
        vehicle_buckets={"vehicles": 1, "two_wheelers": 0, "heavy": 0, "signals": 0},
    )


def test_output_manager_flush(settings: AppSettings) -> None:
    manager = OutputManager(settings)
    manager.append_record(build_record(1))
    manager.flush(force=True)

    stored = (settings.data_dir / settings.results_filename).read_text(encoding="utf-8")
    assert "\"frame_id\": 1" in stored


def test_output_manager_retry(settings: AppSettings, tmp_path: Path) -> None:
    settings.push_api = True
    settings.api_endpoint = "http://localhost:9999/update_traffic"

    session = MagicMock()
    session.post.side_effect = [Exception("boom")] * 6

    manager = OutputManager(settings, session=session)
    manager.append_record(build_record(1))

    cached_files: List[Path] = list(settings.cache_dir.glob("payload_*.json"))
    assert cached_files, "Expected payload to be cached after repeated failures"


def test_output_manager_frame_bundle(settings: AppSettings) -> None:
    manager = OutputManager(settings)
    annotated = np.zeros((20, 20, 3), dtype=np.uint8)
    class_frames: Dict[str, np.ndarray] = {
        "car": annotated.copy(),
        "traffic light": annotated.copy(),
    }

    manager.save_frame_bundle(annotated, class_frames, frame_id=5)

    base = settings.snapshot_dir / "frame_00005.jpg"
    car = settings.snapshot_dir / "classes" / "car" / "frame_00005.jpg"
    signal = settings.snapshot_dir / "classes" / "traffic_light" / "frame_00005.jpg"

    assert base.exists()
    assert car.exists()
    assert signal.exists()


def test_output_manager_frame_bundle_with_direction(settings: AppSettings) -> None:
    manager = OutputManager(settings)
    annotated = np.zeros((20, 20, 3), dtype=np.uint8)
    class_frames: Dict[str, np.ndarray] = {"car": annotated.copy()}

    manager.save_frame_bundle(annotated, class_frames, frame_id=7, direction="north")

    base = settings.snapshot_dir / "north" / "frame_00007.jpg"
    car = settings.snapshot_dir / "north" / "classes" / "car" / "frame_00007.jpg"

    assert base.exists()
    assert car.exists()


def test_reset_output_state_includes_cache(settings: AppSettings) -> None:
    payload = settings.cache_dir / "payload_123.json"
    payload.parent.mkdir(parents=True, exist_ok=True)
    payload.write_text("{}", encoding="utf-8")
    snapshot = settings.snapshot_dir / "frame_00001.jpg"
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text("stub", encoding="utf-8")
    results = settings.data_dir / settings.results_filename
    results.parent.mkdir(parents=True, exist_ok=True)
    results.write_text("[]", encoding="utf-8")

    reset_output_state(settings, include_cache=True)

    assert not payload.exists()
    assert not snapshot.exists()
    assert not results.exists()
