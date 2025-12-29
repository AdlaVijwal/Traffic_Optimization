import json
import sys
from pathlib import Path

from module_1_traffic_detection.app import multi_detect
from module_1_traffic_detection.app.config.settings import AppSettings
from module_1_traffic_detection.app.services.lane_mapper import (
    LaneConfig,
    LaneDefinition,
    SignalRegion,
)


def test_load_observation_videos_allows_partial_matches(tmp_path: Path) -> None:
    video_path = tmp_path / "north.mp4"
    video_path.write_text("stub")
    mapping = multi_detect._load_observation_videos(tmp_path, ["north", "east"])
    assert list(mapping.keys()) == ["north"]
    assert mapping["north"] == video_path


def test_resolve_lane_config_synthesizes_full_frame_lane() -> None:
    base_config = LaneConfig(
        junction_id="junction",
        junction_type="four_way",
        frame_width=640,
        frame_height=480,
        lanes=[],
        signal_regions={
            "north": SignalRegion(direction="north", roi=[0, 0, 10, 10])
        },
    )
    resolved = multi_detect._resolve_lane_config(base_config, "north")
    assert len(resolved.lanes) == 1
    lane = resolved.lanes[0]
    assert lane.name == "north"
    assert lane.polygon[0] == [0, 0]
    assert lane.polygon[2] == [640, 480]
    assert "north" in resolved.signal_regions


def test_resolve_lane_config_preserves_existing_lane() -> None:
    lane = LaneDefinition(name="north", polygon=[[0, 0], [1, 0], [1, 1], [0, 1]])
    base_config = LaneConfig(
        junction_id="junction",
        junction_type="four_way",
        frame_width=640,
        frame_height=480,
        lanes=[lane],
    )
    resolved = multi_detect._resolve_lane_config(base_config, "north")
    assert len(resolved.lanes) == 1
    assert resolved.lanes[0].name == "north"
    assert resolved.lanes[0].polygon == lane.polygon


def test_resolve_lane_config_force_full_frame() -> None:
    lane = LaneDefinition(name="north", polygon=[[0, 0], [10, 0], [10, 10], [0, 10]])
    base_config = LaneConfig(
        junction_id="junction",
        junction_type="four_way",
        frame_width=640,
        frame_height=480,
        lanes=[lane],
    )
    resolved = multi_detect._resolve_lane_config(base_config, "north", force_full_frame=True)
    assert len(resolved.lanes) == 1
    polygon = resolved.lanes[0].polygon
    assert polygon[0] == [0, 0]
    assert polygon[1] == [640, 0]
    assert polygon[2] == [640, 480]
    assert polygon[3] == [0, 480]


def test_main_observation_smoke(tmp_path: Path, monkeypatch) -> None:
    observation_dir = tmp_path / "observation_videos"
    observation_dir.mkdir()
    (observation_dir / "north.mp4").write_text("stub")
    (observation_dir / "south-camera.mp4").write_text("stub")

    lane_config_path = tmp_path / "lane_regions.yaml"
    lane_config_path.write_text(
        """
junction_id: smoke_junction
junction_type: four_way
frame_width: 800
frame_height: 600
lanes: {}
signal_regions: {}
"""
    )

    def fake_load_settings(**overrides: object) -> AppSettings:
        base_kwargs = {
            "model_path": tmp_path / "model.pt",
            "display": False,
            "lane_config_path": lane_config_path,
            "snapshot_dir": tmp_path / "snapshots",
            "data_dir": tmp_path / "data",
            "cache_dir": tmp_path / "cache",
            "results_filename": "results.json",
            "push_api": False,
            "save_unsent_payloads": False,
            "no_video_output": True,
            "flush_every_n_frames": 1,
            "process_every_n_frames": 1,
            "save_every_n_frames": 9999,
        }
        base_kwargs.update(overrides)
        settings = AppSettings(**base_kwargs)
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.snapshot_dir.mkdir(parents=True, exist_ok=True)
        settings.cache_dir.mkdir(parents=True, exist_ok=True)
        return settings

    class DummyDetector:
        def __init__(self, model_path, confidence_threshold, iou_threshold) -> None:
            self.params = (model_path, confidence_threshold, iou_threshold)

        def predict(self, frame):  # pragma: no cover - unused in smoke stub
            return []

    class DummyOutputManager:
        def __init__(self, _settings, metadata=None, session=None) -> None:
            self.records = []
            self.metadata = metadata or {}

        def append_record(self, record) -> None:  # pragma: no cover - unused in smoke stub
            self.records.append(record)

        def save_frame_bundle(self, *args, **kwargs) -> None:  # pragma: no cover - unused in smoke stub
            return None

        def close(self) -> None:
            return None

    captured = []

    def fake_process_video_stream(
        source, settings, lane_mapper, detector, output_manager, *, direction: str, **_kwargs
    ) -> None:
        polygon = [list(point) for point in lane_mapper.config.lanes[0].polygon]
        captured.append((direction, polygon))
        lane_mapper._running_totals[direction] = 5

    monkeypatch.setattr(multi_detect, "load_settings", fake_load_settings)
    monkeypatch.setattr(multi_detect, "YOLODetector", DummyDetector)
    monkeypatch.setattr(multi_detect, "OutputManager", DummyOutputManager)
    monkeypatch.setattr(multi_detect, "process_video_stream", fake_process_video_stream)

    argv = [
        "multi_detect",
        "--junction-type",
        "4-way",
        "--observations-dir",
        str(observation_dir),
        "--no-prompts",
        "--full-frame-lanes",
    ]
    monkeypatch.setattr(sys, "argv", argv)
    multi_detect.main()

    directions = sorted(direction for direction, _ in captured)
    assert directions == ["north", "south"]
    assert all(polygon == [[0, 0], [800, 0], [800, 600], [0, 600]] for _, polygon in captured)

    profile_path = tmp_path / "data" / "junction_profile.json"
    payload = json.loads(profile_path.read_text())
    assert "summary" in payload
    assert payload["summary"]["direction_totals"]["north"] == {"north": 5}
    assert payload["summary"]["direction_totals"]["south"] == {"south": 5}
    assert payload["summary"]["records_written"] == 0
