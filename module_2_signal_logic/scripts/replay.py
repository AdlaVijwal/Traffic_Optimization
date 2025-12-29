"""Replay historical telemetry through the signal service for offline evaluation."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Optional

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor
from module_2_signal_logic.adapters.persistence import JsonPersistence
from module_2_signal_logic.app.settings import get_settings
from module_2_signal_logic.core.models import LaneSnapshot
from module_2_signal_logic.core.priority_engine import PriorityEngine
from module_2_signal_logic.core.scheduler import SchedulerConfig, SignalScheduler
from module_2_signal_logic.core.state_store import StateStore
from module_2_signal_logic.services.signal_service import SignalService


class ReplayIngestor:
    """Simple ingestor that reveals snapshots incrementally during replay."""

    def __init__(self, snapshots: Iterable[LaneSnapshot], metadata: Optional[Dict]) -> None:
        self._snapshots: List[LaneSnapshot] = list(snapshots)
        self._metadata: Dict = dict(metadata or {})
        self._cursor: int = -1

    def advance(self) -> bool:
        if self._cursor + 1 >= len(self._snapshots):
            return False
        self._cursor += 1
        return True

    def load_recent(self) -> List[LaneSnapshot]:
        if self._cursor < 0:
            return []
        return self._snapshots[: self._cursor + 1]

    @property
    def metadata(self) -> Dict:
        return dict(self._metadata)


def _build_service(ingestor: ReplayIngestor, history_path: Path, snapshot_path: Path) -> SignalService:
    settings = get_settings()
    state_store = StateStore(settings.lanes, cooldown_duration=settings.cooldown_duration)
    scheduler = SignalScheduler(
        SchedulerConfig(
            base_green=settings.base_green_seconds,
            min_green=settings.min_green_seconds,
            max_green=settings.max_green_seconds,
            scaling_factor=settings.scaling_factor,
        )
    )
    priority_engine = PriorityEngine(
        density_weight=settings.density_weight,
        wait_weight=settings.wait_weight,
        cooldown_penalty=settings.cooldown_penalty_weight,
        gap_weight=settings.gap_weight,
        forecast_weight=settings.forecast_weight,
    )
    persistence = JsonPersistence(history_path, snapshot_path)
    return SignalService(
        ingestor,
        priority_engine,
        scheduler,
        state_store,
        persistence,
        telemetry_stale_after=settings.telemetry_stale_after_seconds,
        forecast_horizon=settings.forecast_horizon_seconds,
        forecast_smoothing=settings.forecast_smoothing_factor,
    )


def _load_snapshots(results_path: Path, window_size: int) -> tuple[List[LaneSnapshot], Dict]:
    ingestor = ResultsFileIngestor(results_path, window_size=window_size)
    snapshots = ingestor.load_recent()
    if not snapshots:
        raise RuntimeError(f"No telemetry records found in {results_path}")
    return snapshots, ingestor.metadata


def _compute_summary(
    cycle_durations: List[float],
    wait_samples: Dict[str, int],
    wait_totals: Dict[str, float],
    wait_max: Dict[str, float],
    latency_samples: int,
    latency_total: float,
    stale_incidents: int,
    final_status: Dict,
    total_steps: int,
) -> Dict:
    avg_wait = {
        lane: (wait_totals[lane] / wait_samples[lane]) if wait_samples[lane] else 0.0
        for lane in wait_totals
    }
    fairness_delta = 0.0
    if avg_wait:
        fairness_delta = max(avg_wait.values()) - min(avg_wait.values())
    summary = {
        "cycles": len(cycle_durations),
        "average_green_duration": mean(cycle_durations) if cycle_durations else 0.0,
        "average_wait_by_lane": avg_wait,
        "max_wait_by_lane": wait_max,
        "fairness_delta": fairness_delta,
        "average_latency_ms": (latency_total / latency_samples) if latency_samples else 0.0,
        "stale_incidents": stale_incidents,
        "final_lane_counts": final_status.get("lane_counts", {}),
        "final_lane_totals": final_status.get("lane_totals", {}),
        "final_lane_forecasts": final_status.get("lane_forecasts", {}),
        "steps_processed": total_steps,
    }
    return summary


def _setup_paths(output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    history_path = output_dir / "replay_history.json"
    snapshot_path = output_dir / "replay_snapshot.json"
    return history_path, snapshot_path


def run_replay(results_path: Path, window_size: int, output_dir: Path, output_json: Optional[Path]) -> Dict:
    snapshots, metadata = _load_snapshots(results_path, window_size)
    ingestor = ReplayIngestor(snapshots, metadata)
    history_path, snapshot_path = _setup_paths(output_dir)
    service = _build_service(ingestor, history_path, snapshot_path)

    wait_totals: Dict[str, float] = defaultdict(float)
    wait_samples: Dict[str, int] = defaultdict(int)
    wait_max: Dict[str, float] = defaultdict(float)
    cycle_durations: List[float] = []
    latency_total = 0.0
    latency_samples = 0
    stale_incidents = 0
    total_steps = 0

    for snapshot in snapshots:
        if not ingestor.advance():
            break
        total_steps += 1
        now = snapshot.timestamp
        try:
            decision = service.step(now)
        except RuntimeError:
            stale_incidents += 1
            continue

        status = service.snapshot(now, hydrate=False)
        for lane, wait in status.get("lane_wait_times", {}).items():
            wait_totals[lane] += wait
            wait_samples[lane] += 1
            if wait > wait_max[lane]:
                wait_max[lane] = wait
        if decision:
            cycle_durations.append(decision.green_duration)
        if snapshot.latency_ms is not None:
            latency_total += snapshot.latency_ms
            latency_samples += 1

    final_status = service.snapshot(snapshots[-1].timestamp, hydrate=False)
    summary = _compute_summary(
        cycle_durations,
        wait_samples,
        wait_totals,
        wait_max,
        latency_samples,
        latency_total,
        stale_incidents,
        final_status,
        total_steps,
    )

    if output_json is not None:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(summary, indent=2))

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay Module 1 telemetry through the signal service.")
    parser.add_argument(
        "--results-file",
        type=Path,
        help="Path to the Module 1 results.json file (defaults to settings path).",
    )
    parser.add_argument(
        "--window-size",
        type=int,
        default=100000,
        help="Maximum number of snapshots to retain from the results file.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./replay_artifacts"),
        help="Directory for replay artifacts (history and snapshot).",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        help="Optional path to write the summary metrics as JSON.",
    )
    args = parser.parse_args()

    settings = get_settings()
    results_path = args.results_file or settings.results_source
    summary = run_replay(results_path, max(1, args.window_size), args.output_dir, args.output_json)

    print("Replay complete. Summary metrics:")
    for key, value in summary.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
