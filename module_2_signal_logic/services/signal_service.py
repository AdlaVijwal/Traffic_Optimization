import logging
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean
from typing import Dict, List, Optional

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor
from module_2_signal_logic.adapters.persistence import JsonPersistence
from module_2_signal_logic.core.models import CycleDecision, LaneSnapshot, PriorityBreakdown
from module_2_signal_logic.core.priority_engine import PriorityEngine
from module_2_signal_logic.core.scheduler import SignalScheduler
from module_2_signal_logic.core.state_store import StateStore


logger = logging.getLogger(__name__)


class SignalService:
    """Coordinate ingestion, priority computation, scheduling, and persistence."""

    def __init__(
        self,
        ingestor: ResultsFileIngestor,
        priority_engine: PriorityEngine,
        scheduler: SignalScheduler,
        state_store: StateStore,
        persistence: JsonPersistence,
        telemetry_stale_after: float = 0.0,
        forecast_horizon: float = 0.0,
        forecast_smoothing: float = 0.5,
    ) -> None:
        self.ingestor = ingestor
        self.priority_engine = priority_engine
        self.scheduler = scheduler
        self.state_store = state_store
        self.persistence = persistence
        self.telemetry_stale_after = max(telemetry_stale_after, 0.0)
        self.forecast_horizon = max(forecast_horizon, 0.0)
        self.forecast_smoothing = min(max(forecast_smoothing, 0.0), 1.0)
        self._history: List[CycleDecision] = []
        self._last_tick_at: Optional[datetime] = None
        self._active_decision: Optional[CycleDecision] = None
        self._last_priorities: List[PriorityBreakdown] = []
        self._last_snapshot: Optional[LaneSnapshot] = None
        self._lane_totals: Dict[str, int] = {}
        self._lane_last_activity: Dict[str, datetime] = {}
        self._lane_gaps: Dict[str, float] = {}
        self._lane_total_timestamp: Dict[str, datetime] = {}
        self._lane_arrival_rate: Dict[str, float] = {}
        self._lane_forecast: Dict[str, float] = {}
        self._stale_incidents: int = 0

    def _apply_tick(self, now: datetime) -> None:
        if self._last_tick_at is None:
            self._last_tick_at = now
            return
        delta_seconds = (now - self._last_tick_at).total_seconds()
        if delta_seconds > 0:
            self.state_store.tick(delta_seconds)
        self._last_tick_at = now

    def _latest_snapshot(self) -> LaneSnapshot:
        snapshots = self.ingestor.load_recent()
        if not snapshots:
            raise RuntimeError("No telemetry snapshots available from Module 1")
        self._last_snapshot = snapshots[-1]
        self.state_store.ensure_lanes(self._last_snapshot.lane_counts.keys())
        self._update_lane_activity(self._last_snapshot)
        return self._last_snapshot

    def _update_lane_activity(self, snapshot: LaneSnapshot) -> None:
        lanes = {lane for lane in self.state_store.lanes()}
        lanes.update(snapshot.lane_counts.keys())
        lanes.update(snapshot.totals.keys())
        for lane in lanes:
            if lane is None:
                continue
            previous_total = self._lane_totals.get(lane, 0)
            current_total = max(snapshot.totals.get(lane, previous_total), 0)
            previous_timestamp = self._lane_total_timestamp.get(lane, snapshot.timestamp)
            delta_seconds = max((snapshot.timestamp - previous_timestamp).total_seconds(), 0.0)
            delta_total = max(current_total - previous_total, 0)
            last_activity = self._lane_last_activity.get(lane)
            if last_activity is None:
                last_activity = snapshot.timestamp
            if current_total < previous_total:
                last_activity = snapshot.timestamp
                gap_seconds = 0.0
            elif current_total > previous_total:
                last_activity = snapshot.timestamp
                gap_seconds = 0.0
            else:
                gap_seconds = max(0.0, (snapshot.timestamp - last_activity).total_seconds())
            self._lane_totals[lane] = current_total
            self._lane_last_activity[lane] = last_activity
            self._lane_gaps[lane] = gap_seconds
            if self.forecast_horizon > 0 and delta_seconds > 0:
                observed_rate = delta_total / delta_seconds if delta_seconds else 0.0
                prior_rate = self._lane_arrival_rate.get(lane, observed_rate)
                alpha = self.forecast_smoothing
                blended_rate = alpha * observed_rate + (1.0 - alpha) * prior_rate
                self._lane_arrival_rate[lane] = blended_rate
                self._lane_forecast[lane] = blended_rate * self.forecast_horizon
            elif lane not in self._lane_forecast:
                self._lane_forecast[lane] = 0.0
            self._lane_total_timestamp[lane] = snapshot.timestamp

    def _resolve_mode(self) -> str:
        lane_count = len(self.state_store.lanes())
        if lane_count <= 1:
            return "single_flow"
        if lane_count == 2:
            return "opposite_road"
        return "crossroad"

    def evaluate_cycle(self, now: datetime, *, apply_tick: bool = True) -> CycleDecision:
        if apply_tick:
            self._apply_tick(now)
        snapshot = self._latest_snapshot()
        self._assert_snapshot_fresh(snapshot, now)
        active_lanes = self.state_store.lanes()
        breakdowns = self.priority_engine.score_lanes(
            active_lanes,
            snapshot,
            self.state_store.waiting_times(),
            self.state_store.cooldowns(),
            vehicle_gaps=self._lane_gaps,
            forecasts=self._lane_forecast,
        )
        priorities = {item.lane: item for item in breakdowns}
        decision = self.scheduler.next_cycle(priorities, now)
        self.state_store.mark_green(decision.green_lane, now)
        self._active_decision = decision
        self._last_priorities = breakdowns
        self._history.append(decision)
        self.persistence.append_history([decision])
        self.persistence.save_state(self.snapshot(now))
        return decision

    def step(self, now: datetime) -> Optional[CycleDecision]:
        self._apply_tick(now)
        if self._active_decision and now < self._active_decision.effective_until:
            self.persistence.save_state(self.snapshot(now))
            return None
        return self.evaluate_cycle(now, apply_tick=False)

    def snapshot(self, now: Optional[datetime] = None, *, hydrate: bool = True) -> dict:
        reference_time = now or datetime.now(timezone.utc)
        if self._last_snapshot is None and hydrate:
            try:
                self._latest_snapshot()
            except RuntimeError:
                pass
        remaining = 0.0
        if self._active_decision:
            remaining = max(
                0.0,
                (self._active_decision.effective_until - reference_time).total_seconds(),
            )
        lane_counts = self._last_snapshot.lane_counts if self._last_snapshot else {}
        signal_states = self._last_snapshot.signal_states if self._last_snapshot else {}
        metadata_attr = getattr(self.ingestor, "metadata", {})
        metadata = metadata_attr() if callable(metadata_attr) else metadata_attr or {}
        junction_type = (
            self._last_snapshot.junction_type
            if self._last_snapshot
            else metadata.get("junction_type")
        )
        return {
            "current_green": self._active_decision.green_lane if self._active_decision else None,
            "remaining_seconds": remaining,
            "cycle_id": self._active_decision.cycle_id if self._active_decision else None,
            "cycle_started_at": self.state_store.current_green_started_at,
            "last_updated": reference_time,
            "lane_counts": lane_counts,
            "lane_totals": dict(self._lane_totals),
            "lane_wait_times": self.state_store.waiting_times(),
            "lane_gaps": dict(self._lane_gaps),
            "lane_forecasts": dict(self._lane_forecast),
            "signal_states": signal_states,
            "junction_type": junction_type,
            "directions": self.state_store.lanes(),
            "mode": self._resolve_mode(),
        }

    def predict_next(self) -> Optional[PriorityBreakdown]:
        if not self._last_priorities:
            return None
        ordered = sorted(
            self._last_priorities,
            key=lambda item: (item.score, item.waiting_time, item.vehicle_count),
            reverse=True,
        )
        current_lane = self._active_decision.green_lane if self._active_decision else None
        for item in ordered:
            if item.lane != current_lane:
                return item
        return ordered[0]

    def history(self, limit: Optional[int] = None) -> List[CycleDecision]:
        items = list(self._history)
        if limit is not None:
            return items[-limit:]
        return items

    def reset(self) -> None:
        self.state_store.reset()
        self._last_tick_at = None
        self._active_decision = None
        self._last_priorities = []
        self._last_snapshot = None
        self._history.clear()
        self._lane_totals.clear()
        self._lane_last_activity.clear()
        self._lane_gaps.clear()
        self._lane_total_timestamp.clear()
        self._lane_arrival_rate.clear()
        self._lane_forecast.clear()
        self._stale_incidents = 0
        self.persistence.clear_history()
        self.persistence.save_state(self.snapshot(hydrate=False))

    def current_decision(self) -> Optional[CycleDecision]:
        return self._active_decision

    def last_priorities(self) -> List[PriorityBreakdown]:
        return list(self._last_priorities)

    def _assert_snapshot_fresh(self, snapshot: LaneSnapshot, now: datetime) -> None:
        if self.telemetry_stale_after <= 0:
            return
        age_seconds = (now - snapshot.timestamp).total_seconds()
        if age_seconds > self.telemetry_stale_after:
            logger.warning(
                "Telemetry snapshot is stale (age=%.1fs, limit=%.1fs)",
                age_seconds,
                self.telemetry_stale_after,
            )
            self._stale_incidents += 1
            raise RuntimeError("Telemetry snapshot is stale")

    def metrics(self) -> dict:
        wait_totals: Dict[str, float] = defaultdict(float)
        wait_counts: Dict[str, int] = defaultdict(int)
        for decision in self._history:
            for entry in decision.priorities:
                wait_totals[entry.lane] += entry.waiting_time
                wait_counts[entry.lane] += 1
        average_wait = {
            lane: (wait_totals[lane] / wait_counts[lane]) if wait_counts[lane] else 0.0
            for lane in wait_totals
        }
        average_green = (
            mean(decision.green_duration for decision in self._history)
            if self._history
            else 0.0
        )
        status = self.snapshot(hydrate=False)
        return {
            "cycles_executed": len(self._history),
            "average_green_duration": average_green,
            "average_wait_by_lane": average_wait,
            "current_wait_by_lane": status.get("lane_wait_times", {}),
            "lane_forecasts": dict(self._lane_forecast),
            "stale_incidents": self._stale_incidents,
            "forecast_horizon": self.forecast_horizon,
            "telemetry_stale_after": self.telemetry_stale_after,
            "last_updated": status.get("last_updated"),
        }
