"""Entry point for Module 1 real-time traffic detection."""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
from typing import Dict, Iterable, List, Optional

import cv2
import numpy as np

from .config.settings import AppSettings, load_settings
from .models import Detection
from .services.detector import YOLODetector
from .services.lane_mapper import LaneAssignment, LaneConfig, LaneCounts, LaneMapper
from .services.output_writer import OutputManager, TrafficRecord
from .services.signal_detector import SignalLightDetector
from .utils.video import iter_frames, managed_capture

LOGGER = logging.getLogger(__name__)

LANE_COLORS: Dict[str, tuple[int, int, int]] = {
    "north": (0, 255, 255),
    "east": (255, 0, 255),
    "south": (0, 255, 0),
    "west": (255, 255, 0),
}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Module 1 - Real-Time Traffic Detection")
    parser.add_argument("--source", type=str, default="sample_videos/traffic_junction.mp4", help="Video source path or device index")
    parser.add_argument("--junction", type=str, default=None, help="Override junction id")
    parser.add_argument("--lane-config", type=str, default=None, help="Lane configuration YAML file")
    parser.add_argument("--model", type=str, default=None, help="Path to YOLO weights file")
    parser.add_argument("--conf", type=float, default=None, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=None, help="IoU threshold")
    parser.add_argument("--push-api", action="store_true", help="Send payloads to backend API endpoint")
    parser.add_argument("--api-endpoint", type=str, default=None, help="Backend API endpoint URL")
    parser.add_argument("--save-every", type=int, default=None, help="Save annotated frames every N frames")
    parser.add_argument("--no-display", action="store_true", help="Disable OpenCV window display")
    parser.add_argument("--process-every", type=int, default=None, help="Process only every Nth frame")
    parser.add_argument("--log-format", choices=["text", "json"], default=None, help="Logging format")
    parser.add_argument("--warmup", type=int, default=0, help="Number of warm-up frames")
    return parser


def setup_logging(settings: AppSettings) -> None:
    log_level = logging.INFO
    if settings.log_format == "json":
        formatter = logging.Formatter('{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}')
    else:
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    logging.basicConfig(level=log_level, handlers=[handler])


def resolve_settings(args: argparse.Namespace) -> AppSettings:
    overrides = {}
    if args.model:
        overrides["model_path"] = Path(args.model)
    if args.conf is not None:
        overrides["confidence_threshold"] = args.conf
    if args.iou is not None:
        overrides["iou_threshold"] = args.iou
    if args.lane_config:
        overrides["lane_config_path"] = Path(args.lane_config)
    if args.api_endpoint:
        overrides["api_endpoint"] = args.api_endpoint
    if args.save_every:
        overrides["save_every_n_frames"] = args.save_every
    if args.no_display:
        overrides["display"] = False
    if args.process_every:
        overrides["process_every_n_frames"] = args.process_every
    if args.log_format:
        overrides["log_format"] = args.log_format
    if args.push_api:
        overrides["push_api"] = True
    if args.junction:
        overrides["junction_id"] = args.junction

    settings = load_settings(**overrides)
    return settings


def warm_up_detector(detector: YOLODetector, capture_frames: Iterable[np.ndarray], count: int) -> None:
    if count <= 0:
        return
    LOGGER.info("Warming up detector with %d frames", count)
    YOLODetector.warm_up(detector, capture_frames, limit=count)


def _draw_assignments(
    frame: np.ndarray,
    assignments: Iterable[LaneAssignment],
    settings: AppSettings,
) -> np.ndarray:
    output = frame.copy()
    color_default = (0, 255, 0)
    for assignment in assignments:
        detection = assignment.detection
        lane_color = LANE_COLORS.get(assignment.lane, color_default)
        x1, y1, x2, y2 = map(int, detection.bbox)
        cv2.rectangle(output, (x1, y1), (x2, y2), lane_color, 2)
        label = f"{assignment.lane}:{detection.class_name}"
        cv2.putText(
            output,
            label,
            (x1, max(0, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            settings.overlay_font_scale,
            lane_color,
            2,
            lineType=cv2.LINE_AA,
        )

    return output


def annotate_frame(frame: np.ndarray, counts: LaneCounts, settings: AppSettings) -> np.ndarray:
    output = _draw_assignments(frame, counts.assignments, settings)
    overlay_lines = [
        f"Frame counts: {counts.frame_counts}",
        f"Totals: {counts.totals}",
        f"Buckets: {counts.vehicle_buckets}",
    ]
    y_offset = 30
    for line in overlay_lines:
        cv2.putText(
            output,
            line,
            (10, y_offset),
            cv2.FONT_HERSHEY_SIMPLEX,
            settings.overlay_font_scale,
            settings.overlay_color_bgr,
            2,
            lineType=cv2.LINE_AA,
        )
        y_offset += 25
    return output


def render_class_variants(
    frame: np.ndarray,
    assignments: Iterable[LaneAssignment],
    settings: AppSettings,
) -> Dict[str, np.ndarray]:
    grouped: Dict[str, List[LaneAssignment]] = defaultdict(list)
    for assignment in assignments:
        grouped[assignment.detection.class_name].append(assignment)

    variants: Dict[str, np.ndarray] = {}
    for class_name, items in grouped.items():
        image = _draw_assignments(frame, items, settings)
        cv2.putText(
            image,
            f"{class_name} only",
            (10, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            settings.overlay_font_scale,
            (255, 255, 255),
            2,
            lineType=cv2.LINE_AA,
        )
        variants[class_name] = image

    return variants


def build_record(
    frame_id: int,
    counts: LaneCounts,
    latency_ms: float,
    settings: AppSettings,
    *,
    direction: Optional[str] = None,
    signal_state: Optional[str] = None,
    source_id: Optional[str] = None,
) -> TrafficRecord:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    return TrafficRecord(
        frame_id=frame_id,
        timestamp=timestamp,
        junction_id=settings.junction_id,
        counts=counts.frame_counts,
        totals=counts.totals,
        latency_ms=latency_ms,
        vehicle_buckets=counts.vehicle_buckets,
        direction=direction,
        signal_state=signal_state,
        source_id=source_id,
    )


def process_video_stream(
    video_source: str | int,
    settings: AppSettings,
    lane_mapper: LaneMapper,
    detector: YOLODetector,
    output_manager: OutputManager,
    *,
    signal_detector: Optional[SignalLightDetector] = None,
    direction: Optional[str] = None,
    source_label: Optional[str] = None,
    warmup_frames: int = 0,
) -> None:
    with managed_capture(video_source) as capture:
        if warmup_frames:
            frames = (frame.data for frame in iter_frames(capture, process_every=1))
            warm_up_detector(detector, frames, warmup_frames)
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)

        for frame in iter_frames(capture, process_every=settings.process_every_n_frames):
            loop_start = time.perf_counter()
            detections = detector.predict(frame.data)
            counts = lane_mapper.aggregate(detections)
            latency_ms = (time.perf_counter() - loop_start) * 1000
            signal_state = None
            if signal_detector and direction:
                # Pass detections to allow auto-finding the traffic light
                signal_state = signal_detector.detect(direction, frame.data, detections=detections)
            record = build_record(
                frame.index,
                counts,
                latency_ms,
                settings,
                direction=direction,
                signal_state=signal_state,
                source_id=source_label,
            )
            output_manager.append_record(record)
            LOGGER.info(
                "Frame %d | counts=%s | totals=%s | latency_ms=%.2f",
                frame.index,
                counts.frame_counts,
                counts.totals,
                latency_ms,
            )

            annotated = annotate_frame(frame.data, counts, settings)
            class_variants = render_class_variants(frame.data, counts.assignments, settings)

            if settings.display and not settings.no_video_output:
                cv2.imshow("Module 1 - Traffic Detection", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    LOGGER.info("Quit signal received from keyboard")
                    break
                if key == ord("p"):
                    LOGGER.info("Paused. Press any key to resume.")
                    cv2.waitKey(0)
                if key == ord("s"):
                    output_manager.save_frame_bundle(annotated, class_variants, frame.index, direction=direction)

            if frame.index % settings.save_every_n_frames == 0:
                output_manager.save_frame_bundle(annotated, class_variants, frame.index, direction=direction)


def run_detection(args: argparse.Namespace) -> int:
    settings = resolve_settings(args)
    setup_logging(settings)

    LOGGER.info("Starting Module 1 detection pipeline")

    lane_config = LaneConfig.from_yaml(settings.lane_config_path)
    lane_mapper = LaneMapper(lane_config)
    detector = YOLODetector(settings.model_path, settings.confidence_threshold, settings.iou_threshold)
    output_manager = OutputManager(settings)

    source = args.source
    try:
        source_int = int(source)
        video_source: str | int = source_int
    except ValueError:
        video_source = source

    process_video_stream(
        video_source,
        settings,
        lane_mapper,
        detector,
        output_manager,
        signal_detector=None,
        direction=None,
        source_label=str(source),
        warmup_frames=args.warmup,
    )

    output_manager.close()
    cv2.destroyAllWindows()
    LOGGER.info("Module 1 detection completed")
    return 0


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    def handle_interrupt(signum: int, frame: Optional[object]) -> None:  # pragma: no cover - signal handling
        LOGGER.warning("Received interrupt signal (%d), shutting down", signum)
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_interrupt)
    sys.exit(run_detection(args))


if __name__ == "__main__":  # pragma: no cover
    main()
