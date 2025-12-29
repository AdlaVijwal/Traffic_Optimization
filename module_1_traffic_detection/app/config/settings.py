"""Configuration utilities for Module 1 traffic detection."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from pydantic import BaseSettings, Field, validator


class AppSettings(BaseSettings):
    """Application configuration sourced from environment variables or defaults."""

    model_path: Path = Field(default=Path("models/yolov8m.pt"), description="YOLO weights path")
    confidence_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    lane_config_path: Path = Field(
        default=Path(__file__).resolve().parent / "lane_regions.yaml",
        description="Polygon configuration for lane segmentation.",
    )
    api_endpoint: Optional[str] = Field(default=None, description="Backend endpoint for traffic data.")
    save_every_n_frames: int = Field(default=60, ge=1)
    flush_every_n_frames: int = Field(default=30, ge=1)
    display: bool = Field(default=True, description="Render OpenCV window when true.")
    push_api: bool = Field(default=False, description="Whether to send payloads to backend API.")
    no_video_output: bool = Field(default=False, description="Disable video playback even if display flag true.")
    log_format: str = Field(default="text")
    junction_id: str = Field(default="junction_01")
    snapshot_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "output_frames",
        description="Directory for annotated snapshot frames.",
    )
    data_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "data",
        description="Directory for JSON output.",
    )
    cache_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "app" / "cache" / "pending",
        description="Directory for pending API payloads.",
    )
    results_filename: str = Field(default="results.json")
    save_unsent_payloads: bool = Field(default=True)
    process_every_n_frames: int = Field(default=1, ge=1)
    metrics_window: int = Field(default=60, ge=1)
    overlay_font_scale: float = Field(default=0.7, gt=0.0)
    overlay_color_bgr: List[int] = Field(default_factory=lambda: [0, 255, 255])

    class Config:
        env_prefix = "TRAFFIC_"
        case_sensitive = False

    @validator("model_path", "lane_config_path", pre=True)
    def _expand_path(cls, value: str | Path) -> Path:
        return Path(value).expanduser()

    @validator("snapshot_dir", "data_dir", "cache_dir", pre=True)
    def _expand_dir(cls, value: str | Path) -> Path:
        return Path(value).expanduser()


def load_settings(**overrides: object) -> AppSettings:
    """Return application settings, applying optional overrides."""

    return AppSettings(**overrides)
