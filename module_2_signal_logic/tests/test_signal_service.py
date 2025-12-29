import json
from datetime import datetime, timedelta, timezone

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor
from module_2_signal_logic.adapters.persistence import JsonPersistence
from module_2_signal_logic.core.priority_engine import PriorityEngine
from module_2_signal_logic.core.scheduler import SignalScheduler
from module_2_signal_logic.core.state_store import StateStore
from module_2_signal_logic.services.signal_service import SignalService


def test_signal_service_generates_cycle(tmp_path) -> None:
    results_path = tmp_path / "results.json"
    history_path = tmp_path / "history.json"
    snapshot_path = tmp_path / "snapshot.json"

    timestamps = [datetime(2025, 11, 4, 16, 18, tzinfo=timezone.utc) + timedelta(seconds=i) for i in range(3)]
    records = []
    for idx, ts in enumerate(timestamps):
        frame_id = idx + 1
        records.append(
            {
                "frame_id": frame_id,
                "timestamp": ts.isoformat(),
                "direction": "north",
                "counts": {"north": 5 + idx},
                "totals": {"north": 5 + idx},
                "signal_state": "green",
            }
        )
        records.append(
            {
                "frame_id": frame_id,
                "timestamp": (ts + timedelta(milliseconds=400)).isoformat(),
                "direction": "west",
                "counts": {"west": 2 + idx},
                "totals": {"west": 2 + idx},
                "signal_state": "red",
            }
        )

    payload = {
        "schema_version": 2,
        "metadata": {"junction_type": "two_way", "directions": ["north", "west"]},
        "records": records,
    }
    results_path.write_text(json.dumps(payload))

    history_path.write_text("[]")
    state_store = StateStore(["north", "west"], cooldown_duration=5.0)
    ingestor = ResultsFileIngestor(results_path, window_size=3)
    persistence = JsonPersistence(history_path, snapshot_path)
    service = SignalService(ingestor, PriorityEngine(), SignalScheduler(), state_store, persistence)

    now = datetime.now(timezone.utc)
    decision = service.step(now)
    assert decision is not None
    assert decision.green_lane in {"north", "west"}

    history_entries = json.loads(history_path.read_text())
    assert len(history_entries) == 1
    assert history_entries[0]["cycle_id"] == decision.cycle_id

    snapshot = json.loads(snapshot_path.read_text())
    assert snapshot["current_green"] == decision.green_lane
    assert snapshot["remaining_seconds"] >= 0
    assert snapshot["mode"] == "opposite_road"
    assert snapshot["lane_totals"]["north"] >= 5
    assert snapshot["lane_totals"]["west"] >= 2
    assert set(snapshot["lane_gaps"].keys()) == {"north", "west"}


def test_signal_service_reset_persists_cleared_state(tmp_path) -> None:
    results_path = tmp_path / "results.json"
    history_path = tmp_path / "history.json"
    snapshot_path = tmp_path / "snapshot.json"

    timestamp = datetime(2025, 11, 4, 16, 18, tzinfo=timezone.utc)
    payload = {
        "records": [
            {
                "frame_id": 1,
                "timestamp": timestamp.isoformat(),
                "direction": "north",
                "counts": {"north": 5},
                "totals": {"north": 5},
            },
            {
                "frame_id": 1,
                "timestamp": (timestamp + timedelta(milliseconds=400)).isoformat(),
                "direction": "west",
                "counts": {"west": 3},
                "totals": {"west": 3},
            },
        ]
    }
    results_path.write_text(json.dumps(payload))

    history_path.write_text("[]")
    state_store = StateStore(["north", "west"], cooldown_duration=5.0)
    ingestor = ResultsFileIngestor(results_path, window_size=3)
    persistence = JsonPersistence(history_path, snapshot_path)
    service = SignalService(ingestor, PriorityEngine(), SignalScheduler(), state_store, persistence)

    now = datetime.now(timezone.utc)
    service.step(now)
    pre_reset_snapshot = json.loads(snapshot_path.read_text())
    assert pre_reset_snapshot["lane_totals"]

    service.reset()

    post_reset_snapshot = json.loads(snapshot_path.read_text())
    assert post_reset_snapshot["current_green"] is None
    assert post_reset_snapshot["lane_totals"] == {}
    assert post_reset_snapshot["lane_counts"] == {}
    assert post_reset_snapshot["lane_gaps"] == {}
    assert json.loads(history_path.read_text()) == []


def test_signal_service_metrics_reports_history(tmp_path) -> None:
    results_path = tmp_path / "results.json"
    history_path = tmp_path / "history.json"
    snapshot_path = tmp_path / "snapshot.json"

    now = datetime.now(timezone.utc)
    payload = {
        "records": [
            {
                "frame_id": 1,
                "timestamp": now.isoformat(),
                "direction": "north",
                "counts": {"north": 6},
                "totals": {"north": 6},
            },
            {
                "frame_id": 1,
                "timestamp": now.isoformat(),
                "direction": "west",
                "counts": {"west": 3},
                "totals": {"west": 3},
            },
        ]
    }
    results_path.write_text(json.dumps(payload))
    history_path.write_text("[]")

    state_store = StateStore(["north", "west"], cooldown_duration=5.0)
    ingestor = ResultsFileIngestor(results_path, window_size=3)
    persistence = JsonPersistence(history_path, snapshot_path)
    service = SignalService(ingestor, PriorityEngine(), SignalScheduler(), state_store, persistence)

    service.step(now)
    metrics = service.metrics()

    assert metrics["cycles_executed"] >= 1
    assert metrics["stale_incidents"] == 0
    assert metrics["average_wait_by_lane"]
