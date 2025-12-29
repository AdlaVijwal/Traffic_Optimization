"""Convenience CLI for running the signal logic once and inspecting the outputs."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor
from module_2_signal_logic.adapters.persistence import JsonPersistence
from module_2_signal_logic.app.settings import get_settings
from module_2_signal_logic.core.priority_engine import PriorityEngine
from module_2_signal_logic.core.scheduler import SchedulerConfig, SignalScheduler
from module_2_signal_logic.core.state_store import StateStore
from module_2_signal_logic.services.signal_service import SignalService


def _build_service() -> SignalService:
    settings = get_settings()
    state_store = StateStore(settings.lanes, cooldown_duration=settings.cooldown_duration)
    ingestor = ResultsFileIngestor(settings.results_source, settings.window_size)
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
    persistence = JsonPersistence(settings.history_path, settings.state_snapshot_path)
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


def _dump(obj: object) -> str:
    return json.dumps(
        obj,
        indent=2,
        default=lambda value: value.isoformat() if hasattr(value, "isoformat") else value,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one evaluation cycle and print outputs.")
    parser.add_argument(
        "--history-limit",
        type=int,
        default=3,
        help="Number of most recent cycles to show from history (default: 3).",
    )
    parser.add_argument(
        "--skip-step",
        action="store_true",
        help="Only show the latest persisted state without generating a new decision.",
    )
    args = parser.parse_args()

    service = _build_service()
    now = datetime.now(timezone.utc)

    if not args.skip_step:
        decision = service.step(now)
        if decision:
            print(
                "[Cycle {cycle:02d}] Green: {lane} | Duration: {duration:.0f}s".format(
                    cycle=decision.cycle_id,
                    lane=decision.green_lane.upper(),
                    duration=decision.green_duration,
                )
            )
        else:
            print("No new decision generated; reusing current cycle.")

    status = service.snapshot(now)
    print(f"Detected mode: {status.get('mode')}")
    print("Current status:")
    print(_dump(status))

    prediction = service.predict_next()
    if prediction:
        print("Next lane prediction:")
        print(_dump(prediction.dict()))
    else:
        print("Next lane prediction: unavailable")

    history = service.history(limit=args.history_limit)
    print(f"History entries: {len(history)} (showing up to {args.history_limit})")
    for item in history:
        print(_dump(item.dict()))


if __name__ == "__main__":
    main()
