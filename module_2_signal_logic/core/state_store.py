from collections import defaultdict
from datetime import datetime
from typing import DefaultDict, Dict, Iterable, List, Optional


class StateStore:
    """Track current signal state, waiting times, and cooldown penalties."""

    def __init__(self, lanes: Iterable[str], cooldown_duration: float = 10.0) -> None:
        self._lanes: List[str] = []
        for lane in lanes:
            if lane is None:
                continue
            if lane not in self._lanes:
                self._lanes.append(lane)
        self.cooldown_duration = max(cooldown_duration, 0.0)
        self.current_green: Optional[str] = None
        self.current_green_started_at: Optional[datetime] = None
        self._waiting_times: DefaultDict[str, float] = defaultdict(float)
        self._cooldowns: DefaultDict[str, float] = defaultdict(float)
        self.reset()

    def ensure_lanes(self, lanes: Iterable[str]) -> None:
        for lane in lanes:
            if lane is None:
                continue
            if lane not in self._lanes:
                self._lanes.append(lane)
            # initialize dictionaries to avoid KeyError
            _ = self._waiting_times[lane]
            _ = self._cooldowns[lane]

    def tick(self, delta_seconds: float) -> None:
        if delta_seconds <= 0:
            return
        for lane in self._lanes:
            if lane != self.current_green:
                self._waiting_times[lane] += delta_seconds
            else:
                self._waiting_times[lane] = 0.0
            current_cooldown = self._cooldowns[lane]
            if current_cooldown > 0:
                self._cooldowns[lane] = max(0.0, current_cooldown - delta_seconds)

    def mark_green(self, lane: str, timestamp: datetime) -> None:
        if lane not in self._lanes:
            raise ValueError(f"Unknown lane '{lane}'")
        self.current_green = lane
        self.current_green_started_at = timestamp
        for tracked_lane in self._lanes:
            if tracked_lane == lane:
                self._waiting_times[tracked_lane] = 0.0
                self._cooldowns[tracked_lane] = self.cooldown_duration
            else:
                # ensure the lane exists in dictionaries even if untouched before
                self._waiting_times[tracked_lane] = self._waiting_times[tracked_lane]
                self._cooldowns[tracked_lane] = self._cooldowns[tracked_lane]

    def waiting_times(self) -> Dict[str, float]:
        return dict(self._waiting_times)

    def cooldowns(self) -> Dict[str, float]:
        return dict(self._cooldowns)

    def lanes(self) -> List[str]:
        return list(self._lanes)

    def reset(self) -> None:
        self.current_green = None
        self.current_green_started_at = None
        for lane in self._lanes:
            self._waiting_times[lane] = 0.0
            self._cooldowns[lane] = 0.0
