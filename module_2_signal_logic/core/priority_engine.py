from typing import Dict, Iterable, List, Optional

from module_2_signal_logic.core.models import LaneSnapshot, PriorityBreakdown


class PriorityEngine:
    """Compute lane priorities using density, wait time, and fairness penalties."""

    def __init__(
        self,
        density_weight: float = 0.6,
        wait_weight: float = 0.4,
        cooldown_penalty: float = 0.2,
        gap_weight: float = 0.3,
        forecast_weight: float = 0.0,
    ) -> None:
        self.density_weight = density_weight
        self.wait_weight = wait_weight
        self.cooldown_penalty = cooldown_penalty
        self.gap_weight = gap_weight
        self.forecast_weight = forecast_weight

    def score_lanes(
        self,
        lanes: Iterable[str],
        snapshot: LaneSnapshot,
        waiting_times: Dict[str, float],
        recent_cooldowns: Dict[str, float],
        vehicle_gaps: Optional[Dict[str, float]] = None,
        forecasts: Optional[Dict[str, float]] = None,
    ) -> List[PriorityBreakdown]:
        breakdowns: List[PriorityBreakdown] = []
        vehicle_gaps = vehicle_gaps or {}
        forecasts = forecasts or {}
        for lane in lanes:
            vehicle_count = max(snapshot.lane_counts.get(lane, 0), 0)
            waiting_time = max(waiting_times.get(lane, 0.0), 0.0)
            penalty_seconds = max(recent_cooldowns.get(lane, 0.0), 0.0)
            gap_seconds = max(vehicle_gaps.get(lane, 0.0), 0.0)
            gap_component = self.gap_weight / (1.0 + gap_seconds)
            forecast_count = max(forecasts.get(lane, 0.0), 0.0)
            score = (
                vehicle_count * self.density_weight
                + waiting_time * self.wait_weight
                + gap_component
                + forecast_count * self.forecast_weight
                - penalty_seconds * self.cooldown_penalty
            )
            breakdowns.append(
                PriorityBreakdown(
                    lane=lane,
                    vehicle_count=vehicle_count,
                    waiting_time=waiting_time,
                    cooldown_penalty=penalty_seconds,
                    vehicle_gap=gap_seconds,
                    forecast_count=forecast_count,
                    score=score,
                )
            )
        breakdowns.sort(
            key=lambda item: (item.score, item.waiting_time, item.vehicle_count),
            reverse=True,
        )
        return breakdowns
