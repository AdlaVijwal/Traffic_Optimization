"""Interactive workflow for multi-direction traffic video processing."""

from __future__ import annotations

import argparse
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .config.settings import load_settings
from .detect import process_video_stream, setup_logging
from .services.detector import YOLODetector
from .services.lane_mapper import LaneConfig, LaneDefinition, LaneMapper
from .services.output_writer import OutputManager, reset_output_state
from .services.signal_detector import SignalLightDetector

LOGGER = logging.getLogger(__name__)

TWO_WAY_DEFAULTS = ["north", "south"]
FOUR_WAY_DEFAULTS = ["north", "east", "south", "west"]
PROFILE_FILENAME = "junction_profile.json"


def _normalize_junction_type(raw: str) -> str:
    value = raw.strip().lower().replace("-", "").replace("_", "")
    if value in {"2", "2way", "twoway", "two"}:
        return "two_way"
    if value in {"4", "4way", "fourway", "four"}:
        return "four_way"
    raise ValueError(f"Unsupported junction type: {raw}")


def _prompt_junction_type() -> str:
    while True:
        selection = input("Select junction type (2-way or 4-way): ").strip()
        try:
            return _normalize_junction_type(selection)
        except ValueError:
            print("Please enter either '2-way' or '4-way'.")


def _prompt_directions(junction_type: str) -> List[str]:
    if junction_type == "four_way":
        return FOUR_WAY_DEFAULTS
    raw = input(
        "Enter the two opposing directions separated by space (default: north south): "
    ).strip()
    if not raw:
        return TWO_WAY_DEFAULTS
    parts = [item.strip().lower() for item in raw.split() if item.strip()]
    if len(parts) != 2:
        print("Expected two direction names; using north/south.")
        return TWO_WAY_DEFAULTS
    return parts


def _prompt_video(direction: str) -> Path:
    while True:
        raw = input(f"Upload/enter path for '{direction}' video: ").strip()
        path = Path(raw).expanduser()
        if path.exists():
            return path
        print(f"File not found at {path}. Please try again.")


def _parse_video_args(arguments: Iterable[str] | None) -> Dict[str, Path]:
    result: Dict[str, Path] = {}
    if not arguments:
        return result
    auto_index = 1
    for item in arguments:
        if not item:
            continue
        if "=" in item:
            direction, raw_path = item.split("=", 1)
            direction_key = direction.strip().lower()
            path_str = raw_path
        else:
            direction_key = f"stream_{auto_index}"
            path_str = item
            auto_index += 1
        path = Path(path_str.strip()).expanduser()
        if not direction_key:
            direction_key = f"stream_{auto_index}"
            auto_index += 1
        result[direction_key] = path
    return result


def _collect_videos(directions: Iterable[str], cli_overrides: Dict[str, Path]) -> Dict[str, Path]:
    mapping: Dict[str, Path] = {}
    leftovers = [(key, path) for key, path in cli_overrides.items() if key not in directions]
    consumed_leftovers: set[str] = set()
    for direction in directions:
        cli_path = cli_overrides.get(direction)
        if cli_path and cli_path.exists():
            mapping[direction] = cli_path
            continue
        while leftovers:
            candidate_key, candidate = leftovers.pop(0)
            if candidate.exists():
                LOGGER.info("Assigned CLI video %s to direction '%s'", str(candidate), direction)
                mapping[direction] = candidate
                consumed_leftovers.add(candidate_key)
                break
        if direction not in mapping:
            mapping[direction] = _prompt_video(direction)
    unused = [key for key in cli_overrides if key not in mapping and key not in consumed_leftovers]
    if unused:
        LOGGER.warning("Unused CLI video arguments for directions: %s", ", ".join(unused))
    return mapping


def _write_profile(data_dir: Path, payload: dict) -> Path:
    target = data_dir / PROFILE_FILENAME
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2))
    return target


def _load_observation_videos(directory: Path, directions: Iterable[str]) -> Dict[str, Path]:
    if not directory.exists():
        raise ValueError(f"Observation directory not found: {directory}")
    if not directory.is_dir():
        raise ValueError(f"Observation path is not a directory: {directory}")

    files = [path for path in directory.iterdir() if path.is_file()]
    if not files:
        raise ValueError(f"No videos found in observation directory: {directory}")

    def _matches_direction(stem: str, direction: str) -> bool:
        normalized = stem.lower()
        direction_key = direction.lower()
        if normalized == direction_key:
            return True
        tokens = [token for token in re.split(r"[^a-z0-9]+", normalized) if token]
        return direction_key in tokens

    available = {path.stem.lower(): path for path in files}
    used: set[str] = set()
    mapping: Dict[str, Path] = {}
    missing: List[str] = []

    for direction in directions:
        matched_path: Optional[Path] = None
        for stem, path in available.items():
            if stem in used:
                continue
            if _matches_direction(stem, direction):
                matched_path = path
                used.add(stem)
                break
        if matched_path:
            mapping[direction] = matched_path
        else:
            missing.append(direction)

    if not mapping:
        raise ValueError(
            "No observation videos matched expected direction names; found files: "
            + ", ".join(sorted(available.keys()))
        )

    if missing:
        LOGGER.warning(
            "Observation directory missing videos for directions: %s",
            ", ".join(missing),
        )

    extras = [stem for stem in available if stem not in used]
    if extras:
        LOGGER.info(
            "Ignoring observation videos that do not match configured directions: %s",
            ", ".join(sorted(extras)),
        )

    return mapping


def _synthesize_full_frame_lane(config: LaneConfig, direction: str) -> LaneConfig:
    polygon = [
        [0, 0],
        [config.frame_width, 0],
        [config.frame_width, config.frame_height],
        [0, config.frame_height],
    ]
    lane = LaneDefinition(name=direction, polygon=polygon)
    signal_regions = {}
    if direction in config.signal_regions:
        signal_regions[direction] = config.signal_regions[direction]
    return LaneConfig(
        junction_id=config.junction_id,
        junction_type=config.junction_type,
        frame_width=config.frame_width,
        frame_height=config.frame_height,
        lanes=[lane],
        signal_regions=signal_regions,
    )


def _resolve_lane_config(
    base_config: LaneConfig,
    direction: str,
    force_full_frame: bool = False,
) -> LaneConfig:
    if force_full_frame:
        return _synthesize_full_frame_lane(base_config, direction)
    filtered = base_config.for_directions([direction])
    if filtered.lanes:
        return filtered
    LOGGER.warning(
        "No lane polygons configured for '%s'; defaulting to full-frame coverage.",
        direction,
    )
    return _synthesize_full_frame_lane(base_config, direction)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Process multi-direction traffic videos for Module 1.")
    parser.add_argument(
        "--junction-type",
        choices=["2-way", "4-way", "two-way", "four-way"],
        help="Specify junction type to skip interactive prompt.",
    )
    parser.add_argument(
        "--videos",
        action="append",
        metavar="DIR=PATH",
        help="Pre-supply video path for a direction (can be used multiple times).",
    )
    parser.add_argument(
        "--display",
        action="store_true",
        help="Show annotated frames while processing uploads.",
    )
    parser.add_argument(
        "--no-prompts",
        action="store_true",
        help="Disable interactive prompts; use only CLI-supplied videos.",
    )
    parser.add_argument(
        "--warmup",
        type=int,
        default=0,
        help="Number of warm-up frames before processing each video.",
    )
    parser.add_argument(
        "--reset-output",
        action="store_true",
        help="Clear previous results, frame snapshots, and cached payloads, then exit.",
    )
    parser.add_argument(
        "--observations-dir",
        type=str,
        help="Automatically load direction-named videos from the specified folder (e.g., north.mp4).",
    )
    parser.add_argument(
        "--full-frame-lanes",
        action="store_true",
        help="Treat each supplied camera as covering the full frame, ignoring lane polygons.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    cli_videos = _parse_video_args(args.videos)
    settings_overrides = {"display": args.display}
    settings = load_settings(**settings_overrides)
    setup_logging(settings)

    # Check if previous data exists
    has_existing_data = (
        (settings.data_dir / settings.results_filename).exists() or
        any(settings.snapshot_dir.iterdir()) if settings.snapshot_dir.exists() else False
    )

    if has_existing_data:
        if args.no_prompts:
            # In headless mode, auto-clean without asking
            reset_output_state(settings, include_cache=True)
            LOGGER.info("Auto-cleaned previous Module 1 output artifacts (headless mode).")
        else:
            # Interactive mode: Ask user
            print(f"\n[!] Found existing output data in {settings.snapshot_dir} or {settings.data_dir}")
            confirm = input("    Do you want to DELETE old data and start fresh? [y/N]: ").strip().lower()
            if confirm in ("y", "yes"):
                reset_output_state(settings, include_cache=True)
                LOGGER.info("User confirmed cleanup. Previous artifacts removed.")
            else:
                LOGGER.info("Keeping existing data (new results will be appended/mixed).")

    if args.reset_output:
        # If the user ONLY wanted to reset (and not run), exit now.
        LOGGER.info("Reset complete. Exiting as requested.")
        return

    lane_config = LaneConfig.from_yaml(settings.lane_config_path)
    observation_dir = Path(args.observations_dir).expanduser() if args.observations_dir else None
    # User requested to always use full frame detection, ignoring specific lane polygons
    full_frame_override = True 

    junction_type = (
        _normalize_junction_type(args.junction_type)
        if args.junction_type
        else str(lane_config.junction_type or "custom")
    )

    if not args.no_prompts and not observation_dir and not cli_videos:
        junction_type = _prompt_junction_type()

    if junction_type == "two_way":
        default_directions = list(TWO_WAY_DEFAULTS)
    elif junction_type == "four_way":
        default_directions = list(FOUR_WAY_DEFAULTS)
    else:
        default_directions = []

    if args.no_prompts:
        if not cli_videos and not observation_dir:
            parser.error("--no-prompts requires --videos or --observations-dir")
        directions = list(cli_videos.keys()) if cli_videos else default_directions
    elif observation_dir:
        directions = default_directions
    else:
        junction_type = (
            _normalize_junction_type(args.junction_type)
            if args.junction_type
            else junction_type
        )
        directions = (
            _prompt_directions(junction_type)
            if junction_type == "two_way"
            else list(FOUR_WAY_DEFAULTS)
        )

    if observation_dir and not directions:
        parser.error("--observations-dir requires a junction type of 2-way or 4-way")

    if observation_dir:
        try:
            video_map = _load_observation_videos(observation_dir, directions)
        except ValueError as exc:
            parser.error(str(exc))
        directions = [direction for direction in directions if direction in video_map]
    elif args.no_prompts:
        video_map = cli_videos
        directions = list(video_map.keys())
    else:
        video_map = _collect_videos(directions, cli_videos)

    missing = [name for name, path in video_map.items() if not path.exists()]
    if missing:
        parser.error(f"Video file(s) not found for directions: {', '.join(missing)}")
    detector = YOLODetector(settings.model_path, settings.confidence_threshold, settings.iou_threshold)

    available_rois = {
        direction: lane_config.signal_roi(direction)
        for direction in directions
        if lane_config.signal_roi(direction)
    }
    signal_detector = SignalLightDetector(available_rois)

    metadata = {
        "junction_id": lane_config.junction_id,
        "junction_type": junction_type,
        "directions": directions,
        "video_sources": {direction: str(path) for direction, path in video_map.items()},
    }
    output_manager = OutputManager(settings, metadata=metadata)

    LOGGER.info("Processing %d directional streams", len(video_map))
    direction_summaries: Dict[str, Dict[str, int]] = {}
    for direction, path in video_map.items():
        LOGGER.info("Direction '%s' → %s", direction, path)
        filtered_config = _resolve_lane_config(lane_config, direction, force_full_frame=full_frame_override)
        lane_mapper = LaneMapper(filtered_config)
        process_video_stream(
            str(path),
            settings,
            lane_mapper,
            detector,
            output_manager,
            signal_detector=signal_detector,
            direction=direction,
            source_label=str(path),
            warmup_frames=args.warmup,
        )
        direction_totals = lane_mapper.snapshot_totals()
        direction_summaries[direction] = dict(direction_totals)
        LOGGER.info("Completed '%s' with totals=%s", direction, direction_totals)

    output_manager.close()
    profile_payload = {
        "junction_id": lane_config.junction_id,
        "junction_type": junction_type,
        "directions": directions,
        "video_sources": {direction: str(path) for direction, path in video_map.items()},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input_mode": "video_upload",
        "summary": {
            "direction_totals": direction_summaries,
            "records_written": len(getattr(output_manager, "records", []) or []),
        },
    }
    profile_path = _write_profile(settings.data_dir, profile_payload)
    LOGGER.info("Updated junction profile at %s", profile_path)


if __name__ == "__main__":  # pragma: no cover
    main()
