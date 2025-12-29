from __future__ import annotations

from pathlib import Path

from module_1_traffic_detection.app.models import Detection
from module_1_traffic_detection.app.services.lane_mapper import LaneConfig, LaneMapper


def build_config(tmp_path: Path) -> LaneConfig:
    payload = {
        "junction_id": "test_junction",
        "frame_width": 400,
        "frame_height": 300,
        "lanes": {
            "north": [[0, 0], [200, 0], [200, 150], [0, 150]],
            "south": [[0, 150], [200, 150], [200, 300], [0, 300]],
        },
    }
    config_path = tmp_path / "lane.yaml"
    config_path.write_text(
        "\n".join(
            [
                "junction_id: test_junction",
                "frame_width: 400",
                "frame_height: 300",
                "lanes:",
                "  north:",
                "    - [0, 0]",
                "    - [200, 0]",
                "    - [200, 150]",
                "    - [0, 150]",
                "  south:",
                "    - [0, 150]",
                "    - [200, 150]",
                "    - [200, 300]",
                "    - [0, 300]",
            ]
        )
    )
    return LaneConfig.from_yaml(config_path)


def test_lane_mapper_counts(tmp_path: Path) -> None:
    config = build_config(tmp_path)
    mapper = LaneMapper(config)
    detections = [
        Detection(bbox=[10, 10, 20, 20], confidence=0.9, class_id=2, class_name="car"),
        Detection(bbox=[10, 200, 20, 220], confidence=0.8, class_id=3, class_name="motorcycle"),
        Detection(bbox=[30, 30, 60, 80], confidence=0.95, class_id=9, class_name="traffic light"),
    ]

    counts = mapper.aggregate(detections)

    assert counts.frame_counts == {"north": 2, "south": 1}
    assert counts.totals == {"north": 2, "south": 1}
    assert counts.vehicle_buckets["vehicles"] == 2
    assert counts.vehicle_buckets["two_wheelers"] == 1
    assert counts.vehicle_buckets["signals"] == 1


def test_lane_mapper_reset(tmp_path: Path) -> None:
    config = build_config(tmp_path)
    mapper = LaneMapper(config)
    detections = [
        Detection(bbox=[10, 10, 20, 20], confidence=0.9, class_id=2, class_name="car"),
    ]
    mapper.aggregate(detections)
    mapper.reset_totals()
    assert mapper.snapshot_totals() == {"north": 0, "south": 0}
