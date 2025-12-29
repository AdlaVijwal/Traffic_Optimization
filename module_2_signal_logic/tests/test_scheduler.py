from datetime import datetime, timezone

from module_2_signal_logic.core.models import PriorityBreakdown
from module_2_signal_logic.core.scheduler import SchedulerConfig, SignalScheduler


def test_scheduler_respects_bounds() -> None:
    config = SchedulerConfig(base_green=20.0, min_green=12.0, max_green=40.0, scaling_factor=10.0)
    scheduler = SignalScheduler(config)
    priorities = {
        "north": PriorityBreakdown(lane="north", vehicle_count=5, waiting_time=12.0, cooldown_penalty=0.0, score=9.0),
        "west": PriorityBreakdown(lane="west", vehicle_count=12, waiting_time=4.0, cooldown_penalty=0.0, score=9.5),
        "east": PriorityBreakdown(lane="east", vehicle_count=0, waiting_time=20.0, cooldown_penalty=0.0, score=5.0),
    }

    decision = scheduler.next_cycle(priorities, datetime.now(timezone.utc))

    assert decision.green_lane == "west"
    assert config.min_green <= decision.green_duration <= config.max_green
    # 40 total vehicles -> ratio 12/17 ≈ 0.705 => expected around base+(ratio*scaling)
    expected_duration = config.base_green + (priorities["west"].vehicle_count / sum(
        item.vehicle_count for item in priorities.values()
    )) * config.scaling_factor
    clamped_expected = max(config.min_green, min(config.max_green, expected_duration))
    assert abs(decision.green_duration - clamped_expected) < 0.01
