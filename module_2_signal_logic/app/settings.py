import json
from pathlib import Path
from typing import List, Optional

from pydantic import BaseSettings, Field, root_validator


class AppSettings(BaseSettings):
    module_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1])
    results_source: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "module_1_traffic_detection" / "data" / "results.json")
    history_path: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1] / "storage" / "signal_history.json")
    state_snapshot_path: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1] / "storage" / "state_snapshot.json")
    junction_profile_path: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "module_1_traffic_detection" / "data" / "junction_profile.json")
    poll_interval_seconds: float = 2.0
    window_size: int = 20
    lanes: List[str] = Field(default_factory=lambda: ["north", "east", "south", "west"])
    cooldown_duration: float = 10.0
    base_green_seconds: float = 20.0
    min_green_seconds: float = 10.0
    max_green_seconds: float = 60.0
    scaling_factor: float = 20.0
    density_weight: float = 0.6
    wait_weight: float = 0.4
    cooldown_penalty_weight: float = 0.2
    gap_weight: float = 0.3
    telemetry_stale_after_seconds: float = 30.0
    forecast_weight: float = 0.2
    forecast_horizon_seconds: float = 12.0
    forecast_smoothing_factor: float = 0.5
    enable_background_worker: bool = True
    junction_type: Optional[str] = None

    class Config:
        env_prefix = "TRAFFIC_"
        env_file = ".env"
        env_file_encoding = "utf-8"

    @root_validator(pre=False)
    def _apply_profile(cls, values: dict) -> dict:
        profile_path: Path = values.get("junction_profile_path")
        lanes: List[str] = values.get("lanes") or []
        junction_type: Optional[str] = values.get("junction_type")
        if profile_path and profile_path.exists():
            try:
                profile = json.loads(profile_path.read_text())
            except (json.JSONDecodeError, OSError):
                profile = {}
            directions = profile.get("directions")
            if isinstance(directions, list) and directions:
                lanes = [str(direction).lower() for direction in directions if str(direction).strip()]
            profile_junction_type = profile.get("junction_type")
            if isinstance(profile_junction_type, str) and profile_junction_type:
                junction_type = profile_junction_type
        if not lanes:
            lanes = ["north", "east", "south", "west"]
        values["lanes"] = lanes
        values["junction_type"] = junction_type
        return values


def get_settings() -> AppSettings:
    return AppSettings()
