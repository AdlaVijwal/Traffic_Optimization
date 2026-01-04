from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional

from module_2_signal_logic.core.models import CycleDecision, PriorityBreakdown


@dataclass
class SchedulerConfig:
    base_green: float = 20.0
    min_green: float = 10.0
    max_green: float = 60.0
    scaling_factor: float = 20.0


class SignalScheduler:
    """Determine the next green lane and duration based on priorities."""

    def __init__(self, config: Optional[SchedulerConfig] = None) -> None:
        self.config = config or SchedulerConfig()
        self._cycle_counter = 0
        self._last_green_lane: Optional[str] = None  # Track last green lane

    def next_cycle(
        self,
        priorities: Dict[str, PriorityBreakdown],
        decided_at: datetime,
    ) -> CycleDecision:
        if not priorities:
            raise ValueError("Cannot schedule cycle without priorities")

        def _sorting_key(item: PriorityBreakdown) -> tuple:
            return (item.score, item.waiting_time, item.vehicle_count)

        # Sort all lanes by priority
        ordered_priorities = sorted(priorities.values(), key=_sorting_key, reverse=True)
        
        # STRICT ALTERNATION RULE: Never allow same lane twice in a row
        # This ensures realistic traffic light behavior
        top_breakdown = ordered_priorities[0]
        
        # If the top priority lane is the same as last green, skip to next lane
        if self._last_green_lane and top_breakdown.lane == self._last_green_lane and len(ordered_priorities) > 1:
            top_breakdown = ordered_priorities[1]  # Use second-highest priority
        
        # Update last green lane tracker
        self._last_green_lane = top_breakdown.lane
        
        total_vehicles = sum(max(b.vehicle_count, 0) for b in priorities.values())
        ratio = (top_breakdown.vehicle_count / total_vehicles) if total_vehicles else 0.0

        proposed_green = self.config.base_green + ratio * self.config.scaling_factor
        green_duration = max(self.config.min_green, min(self.config.max_green, proposed_green))

        self._cycle_counter += 1
        effective_from = decided_at
        effective_until = decided_at + timedelta(seconds=green_duration)
        return CycleDecision(
            cycle_id=self._cycle_counter,
            decided_at=decided_at,
            green_lane=top_breakdown.lane,
            green_duration=green_duration,
            priorities=ordered_priorities,
            effective_from=effective_from,
            effective_until=effective_until,
        )
