from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class LaneSnapshot(BaseModel):
    frame_id: Optional[int] = None
    timestamp: datetime
    lane_counts: Dict[str, int]
    totals: Dict[str, int] = Field(default_factory=dict)
    latency_ms: Optional[float] = None
    direction: Optional[str] = None
    signal_states: Dict[str, str] = Field(default_factory=dict)
    junction_type: Optional[str] = None


class PriorityBreakdown(BaseModel):
    lane: str
    vehicle_count: int
    waiting_time: float
    cooldown_penalty: float
    vehicle_gap: float = 0.0
    forecast_count: float = 0.0
    score: float


class CycleDecision(BaseModel):
    cycle_id: int
    decided_at: datetime
    green_lane: str
    green_duration: float
    priorities: List[PriorityBreakdown]
    effective_from: datetime
    effective_until: datetime
