import importlib
import json
import sys
from datetime import datetime, timezone

from fastapi.testclient import TestClient


def _reload_main():
    module_name = "module_2_signal_logic.app.main"
    if module_name in sys.modules:
        return importlib.reload(sys.modules[module_name])
    return importlib.import_module(module_name)


def test_api_status_endpoint(monkeypatch, tmp_path) -> None:
    results_path = tmp_path / "results.json"
    history_path = tmp_path / "history.json"
    snapshot_path = tmp_path / "snapshot.json"
    profile_path = tmp_path / "profile.json"

    now = datetime.now(timezone.utc)
    payload = {
        "schema_version": 2,
        "metadata": {"junction_type": "two_way", "directions": ["north", "west"]},
        "records": [
            {
                "frame_id": 1,
                "timestamp": now.isoformat(),
                "direction": "north",
                "counts": {"north": 10},
                "totals": {"north": 10},
                "signal_state": "green",
            },
            {
                "frame_id": 1,
                "timestamp": now.isoformat(),
                "direction": "west",
                "counts": {"west": 4},
                "totals": {"west": 4},
                "signal_state": "red",
            },
        ],
    }
    results_path.write_text(json.dumps(payload))
    profile_path.write_text(
        json.dumps(
            {
                "junction_type": "two_way",
                "directions": ["north", "west"],
                "generated_at": now.isoformat(),
            }
        )
    )

    monkeypatch.setenv("TRAFFIC_ENABLE_BACKGROUND_WORKER", "0")
    monkeypatch.setenv("TRAFFIC_RESULTS_SOURCE", str(results_path))
    monkeypatch.setenv("TRAFFIC_HISTORY_PATH", str(history_path))
    monkeypatch.setenv("TRAFFIC_STATE_SNAPSHOT_PATH", str(snapshot_path))
    monkeypatch.setenv("TRAFFIC_JUNCTION_PROFILE_PATH", str(profile_path))

    main = _reload_main()
    app = main.app

    with TestClient(app) as client:
        status_response = client.get("/signal/status")
        assert status_response.status_code == 200
        body = status_response.json()
        assert body["current_green"] in {"north", "west"}
        assert "remaining_seconds" in body
        assert body["signal_states"]["west"] == "red"
        assert body["mode"] == "opposite_road"
        assert body["lane_totals"]["north"] == 10

        next_response = client.get("/signal/next")
        assert next_response.status_code == 200
        assert next_response.json()["lane"] in {"north", "west"}

        history_response = client.get("/signal/history")
        assert history_response.status_code == 200
        assert len(history_response.json()) >= 1

        metrics_response = client.get("/metrics")
        assert metrics_response.status_code == 200
        metrics_body = metrics_response.json()
        assert "cycles_executed" in metrics_body
        assert "stale_incidents" in metrics_body
        assert isinstance(metrics_body["average_wait_by_lane"], dict)

        reset_response = client.post("/signal/reset")
        assert reset_response.status_code == 204
