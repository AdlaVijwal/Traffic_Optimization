from datetime import datetime, timezone

from module_2_signal_logic.core.models import LaneSnapshot
from module_2_signal_logic.core.priority_engine import PriorityEngine


def test_priority_scores_computed() -> None:
    engine = PriorityEngine(density_weight=1.0, wait_weight=0.3, cooldown_penalty=0.5)
    snapshot = LaneSnapshot(
        frame_id=1,
        timestamp=datetime.now(timezone.utc),
        lane_counts={"north": 5, "east": 1, "south": 0, "west": 7},
        totals={"north": 5, "east": 1, "south": 0, "west": 7},
    )
    waiting = {"north": 10.0, "east": 2.0, "south": 5.0, "west": 5.0}
    cooldowns = {"north": 0.0, "east": 6.0, "south": 0.0, "west": 1.0}

    gaps = {"north": 2.0, "east": 8.0, "south": 4.0, "west": 1.0}
    breakdowns = engine.score_lanes(["north", "east", "south", "west"], snapshot, waiting, cooldowns, gaps)

    ordered_lanes = [item.lane for item in breakdowns]
    assert ordered_lanes[0] == "west"  # tighter gap + comparable load nudges west above north now
    assert ordered_lanes[-1] == "east"  # heavy cooldown penalty pushes east to the bottom

    top_score = breakdowns[0].score
    east_breakdown = next(item for item in breakdowns if item.lane == "east")
    assert top_score > east_breakdown.score
    assert east_breakdown.vehicle_gap == gaps["east"]
