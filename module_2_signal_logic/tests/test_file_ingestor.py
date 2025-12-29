import json
from datetime import datetime, timedelta, timezone

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor


def test_file_ingestor_returns_window(tmp_path) -> None:
    source = tmp_path / "results.json"
    base_time = datetime(2025, 11, 4, tzinfo=timezone.utc)
    records = []
    for frame in range(1, 6):
        records.append(
            {
                "frame_id": frame,
                "timestamp": (base_time + timedelta(seconds=frame)).isoformat(),
                "direction": "north",
                "counts": {"north": frame},
                "totals": {"north": frame},
                "signal_state": "green" if frame % 2 == 0 else "red",
            }
        )
        records.append(
            {
                "frame_id": frame,
                "timestamp": (base_time + timedelta(seconds=frame, milliseconds=500)).isoformat(),
                "direction": "west",
                "counts": {"west": frame + 1},
                "totals": {"west": frame + 1},
                "signal_state": "red",
            }
        )
    payload = {"schema_version": 2, "metadata": {"junction_type": "four_way"}, "records": records}
    source.write_text(json.dumps(payload))

    ingestor = ResultsFileIngestor(source, window_size=3)
    snapshots = ingestor.load_recent()

    assert len(snapshots) == 3
    assert snapshots[0].frame_id == 4
    assert snapshots[-1].lane_counts["west"] == 6
    assert snapshots[-1].signal_states["west"] == "red"
