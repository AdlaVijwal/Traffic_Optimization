import asyncio
import logging
import shutil
import subprocess
import sys
import json
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Optional, List, Dict, Any, Iterable, Union

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    File,
    Form,
    UploadFile,
    BackgroundTasks,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.staticfiles import StaticFiles

from module_2_signal_logic.adapters.file_ingestor import ResultsFileIngestor
from module_2_signal_logic.adapters.persistence import JsonPersistence
from module_2_signal_logic.app.settings import AppSettings, get_settings
from module_2_signal_logic.core.priority_engine import PriorityEngine
from module_2_signal_logic.core.scheduler import SchedulerConfig, SignalScheduler
from module_2_signal_logic.core.state_store import StateStore
from module_2_signal_logic.services.signal_service import SignalService


logger = logging.getLogger(__name__)
settings = get_settings()

state_store = StateStore(settings.lanes, cooldown_duration=settings.cooldown_duration)
ingestor = ResultsFileIngestor(settings.results_source, settings.window_size)
scheduler = SignalScheduler(
    SchedulerConfig(
        base_green=settings.base_green_seconds,
        min_green=settings.min_green_seconds,
        max_green=settings.max_green_seconds,
        scaling_factor=settings.scaling_factor,
    )
)
priority_engine = PriorityEngine(
    density_weight=settings.density_weight,
    wait_weight=settings.wait_weight,
    cooldown_penalty=settings.cooldown_penalty_weight,
    gap_weight=settings.gap_weight,
    forecast_weight=settings.forecast_weight,
)
persistence = JsonPersistence(settings.history_path, settings.state_snapshot_path)
signal_service = SignalService(
    ingestor,
    priority_engine,
    scheduler,
    state_store,
    persistence,
    telemetry_stale_after=settings.telemetry_stale_after_seconds,
        forecast_horizon=settings.forecast_horizon_seconds,
        forecast_smoothing=settings.forecast_smoothing_factor,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    persistence.save_state(signal_service.snapshot(datetime.now(timezone.utc)))
    cycle_task: Optional[asyncio.Task] = None
    if settings.enable_background_worker:
        cycle_task = asyncio.create_task(
            _cycle_worker(settings.poll_interval_seconds, signal_service)
        )
        app.state.cycle_task = cycle_task
    try:
        yield
    finally:
        task: Optional[asyncio.Task] = getattr(app.state, "cycle_task", cycle_task)
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="Module 2 Signal Logic", version="0.1.0", lifespan=lifespan)

OUTPUT_FRAMES_ROOT = (
    Path(__file__).resolve().parent.parent.parent
    / "module_1_traffic_detection"
    / "output_frames"
)

app.mount(
    "/media/files",
    StaticFiles(directory=OUTPUT_FRAMES_ROOT, check_dir=False),
    name="media-files",
)

# Allow the dashboard (Module 3) to call the API during local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_service() -> SignalService:
    return signal_service


async def _cycle_worker(poll_seconds: float, service: SignalService) -> None:
    while True:
        now = datetime.now(timezone.utc)
        try:
            decision = service.step(now)
            if decision:
                logger.info(
                    "[Cycle %02d] Green: %s | Duration: %.0fs",
                    decision.cycle_id,
                    decision.green_lane.upper(),
                    decision.green_duration,
                )
        except RuntimeError as exc:
            logger.warning("Cycle worker waiting for telemetry: %s", exc)
        except Exception:
            logger.exception("Cycle worker encountered an unexpected error")
        await asyncio.sleep(poll_seconds)


def _maybe_step(now: datetime, service: SignalService, cfg: AppSettings) -> None:
    if cfg.enable_background_worker:
        return
    try:
        service.step(now)
    except RuntimeError:
        # acceptable when telemetry is not yet available
        pass
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics")
async def signal_metrics(service: SignalService = Depends(get_service)) -> dict:
    now = datetime.now(timezone.utc)
    _maybe_step(now, service, settings)
    return jsonable_encoder(service.metrics())


@app.get("/signal/status")
async def signal_status(service: SignalService = Depends(get_service)) -> dict:
    now = datetime.now(timezone.utc)
    _maybe_step(now, service, settings)
    snapshot = service.snapshot(now)
    snapshot["context"] = build_operational_context(snapshot)
    return jsonable_encoder(snapshot)


@app.get("/signal/next")
async def signal_next(service: SignalService = Depends(get_service)) -> dict:
    prediction = service.predict_next()
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction available")
    return jsonable_encoder(prediction.dict())


@app.get("/signal/history")
async def signal_history(
    limit: Optional[int] = Query(default=None, ge=1),
    service: SignalService = Depends(get_service),
) -> list[dict]:
    history = service.history(limit)
    return jsonable_encoder([decision.dict() for decision in history])


@app.post("/signal/reset", status_code=204)
async def signal_reset(service: SignalService = Depends(get_service)) -> None:
    service.reset()


# --- Upload History Persistence ---
UPLOAD_HISTORY_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "upload_history.json"

def load_upload_history() -> List[Dict[str, Any]]:
    if not UPLOAD_HISTORY_FILE.exists():
        return []
    try:
        with open(UPLOAD_HISTORY_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_upload_history(history: List[Dict[str, Any]]):
    UPLOAD_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(UPLOAD_HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)

def add_upload_record(record: Dict[str, Any]):
    history = load_upload_history()
    history.insert(0, record) # Prepend
    save_upload_history(history)

def update_upload_status(run_id: str, status: str, notes: str = None):
    history = load_upload_history()
    for record in history:
        if record["id"] == run_id:
            record["status"] = status
            if notes:
                record["notes"] = notes
            break
    save_upload_history(history)


def delete_upload_records(upload_ids: List[str]) -> int:
    """Delete upload records by IDs. Returns count of deleted records."""
    history = load_upload_history()
    original_count = len(history)
    filtered_history = [record for record in history if record["id"] not in upload_ids]
    save_upload_history(filtered_history)
    return original_count - len(filtered_history)


def resolve_active_upload() -> Optional[Dict[str, Any]]:
    history = load_upload_history()
    if not history:
        return None
    for record in history:
        if record.get("status") in {"processing", "pending"}:
            return record
    return history[0]


def _normalize_lane_id(value: object) -> Optional[str]:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            return candidate
    return None


def _resolve_lane_sequence(
    upload_record: Optional[Dict[str, Any]],
    status_snapshot: Dict[str, Any],
    metadata: Dict[str, Any],
) -> List[str]:
    ordered: List[str] = []
    seen: set[str] = set()

    def _extend(items: Union[Iterable[object], object, None]) -> None:
        if items is None:
            return
        if isinstance(items, (list, tuple, set)):
            iterable = items
        elif isinstance(items, dict):
            iterable = items.keys()
        else:
            iterable = [items]
        for item in iterable:
            lane_id = _normalize_lane_id(item)
            if not lane_id or lane_id in seen:
                continue
            ordered.append(lane_id)
            seen.add(lane_id)

    upload_directions = (
        upload_record.get("directions")
        if upload_record and isinstance(upload_record.get("directions"), (list, tuple))
        else None
    )
    _extend(upload_directions)
    _extend(status_snapshot.get("directions"))
    _extend(metadata.get("directions"))
    lane_counts = status_snapshot.get("lane_counts") or status_snapshot.get("laneCounts")
    if isinstance(lane_counts, dict):
        _extend(lane_counts.keys())

    return ordered


def _build_lane_metadata(direction_sequence: List[str]) -> Dict[str, Any]:
    lane_aliases: Dict[str, str] = {}
    lanes: List[Dict[str, Any]] = []
    for index, lane_id in enumerate(direction_sequence):
        alias = f"Lane {index + 1}"
        lane_aliases[lane_id] = alias
        lanes.append({
            "id": lane_id,
            "alias": alias,
            "order": index,
            "label": alias,
            "original": lane_id,
        })
    return {"laneAliases": lane_aliases, "lanes": lanes}


def build_operational_context(status_snapshot: dict) -> Dict[str, Any]:
    metadata = ingestor.metadata
    upload_record = resolve_active_upload()
    upload_directions: list[str] = []
    if upload_record:
        candidate_dirs = upload_record.get("directions")
        if isinstance(candidate_dirs, (list, tuple)):
            upload_directions = [str(item).lower() for item in candidate_dirs if isinstance(item, str) and item]

    direction_sequence = _resolve_lane_sequence(upload_record, status_snapshot, metadata)
    directions = direction_sequence
    lane_count = (
        len(upload_directions)
        if upload_directions
        else len(directions)
        if directions
        else len(status_snapshot.get("lane_counts", {}))
    )

    display_name = None
    description_parts: List[str] = []
    if upload_record:
        display_name = upload_record.get("displayName")
        if upload_record.get("siteLabel"):
            description_parts.append(upload_record["siteLabel"])
        if upload_record.get("locationLabel"):
            description_parts.append(upload_record["locationLabel"])
    if not display_name:
        junction_id = metadata.get("junction_id")
        junction_type = status_snapshot.get("junction_type") or metadata.get("junction_type")
        if junction_id and str(junction_id).upper() != "OFFLINE":
            display_name = f"Junction {junction_id}"
        elif junction_type:
            display_name = junction_type.replace("_", " ").title()
        elif junction_id:
            display_name = "Offline feed"
    if not display_name:
        display_name = "Traffic feed"

    if metadata.get("input_mode"):
        description_parts.append(metadata["input_mode"].replace("_", " "))

    lane_meta = _build_lane_metadata(directions)

    context = {
        "displayName": display_name,
        "laneCount": lane_count,
        "mode": status_snapshot.get("mode"),
        "junctionType": status_snapshot.get("junction_type") or metadata.get("junction_type"),
        "directions": directions,
        "source": {
            "junctionId": metadata.get("junction_id"),
            "inputMode": metadata.get("input_mode"),
            "videoSources": metadata.get("video_sources"),
        },
    }

    if description_parts:
        context["description"] = " · ".join(description_parts)

    if upload_record:
        context["upload"] = {
            "id": upload_record.get("id"),
            "status": upload_record.get("status"),
            "analysisType": upload_record.get("analysisType"),
            "siteLabel": upload_record.get("siteLabel"),
            "cameraLabel": upload_record.get("cameraLabel"),
            "locationLabel": upload_record.get("locationLabel"),
            "laneCount": upload_record.get("laneCount"),
            "createdAt": upload_record.get("createdAt"),
            "notes": upload_record.get("notes"),
            "displayName": upload_record.get("displayName"),
            "directions": upload_record.get("directions"),
        }

    context.update(lane_meta)

    return context


def clear_output_directory(target: Path) -> None:
    if not target.exists():
        return
    for item in target.iterdir():
        if item.is_dir():
            clear_output_directory(item)
        else:
            try:
                item.unlink()
            except FileNotFoundError:
                continue


def clear_module1_upload_artifacts() -> None:
    workspace_root = Path(__file__).resolve().parent.parent.parent
    legacy_paths = [
        workspace_root / "data" / "uploads" / "custom" / "pending",
        workspace_root / "data" / "uploads" / "custom" / "processed",
        workspace_root / "module_1_traffic_detection" / "data" / "uploads" / "custom" / "pending",
        workspace_root / "module_1_traffic_detection" / "data" / "uploads" / "custom" / "processed",
    ]
    for target in legacy_paths:
        if target.exists() and target.is_dir():
            clear_output_directory(target)


def clear_output_frames_on_disk() -> None:
    workspace_root = Path(__file__).resolve().parent.parent.parent
    outputs_root = workspace_root / "module_1_traffic_detection" / "output_frames"
    if not outputs_root.exists():
        return
    for direction_dir in outputs_root.iterdir():
        if direction_dir.is_dir():
            clear_output_directory(direction_dir)


def clear_module1_results_file() -> None:
    results_path = settings.results_source
    try:
        results_path.unlink(missing_ok=True)
    except Exception as exc:  # pragma: no cover - best effort cleanup
        logger.debug("Failed to remove Module 1 results file %s: %s", results_path, exc)
    else:
        logger.info("Removed Module 1 results payload at %s", results_path)
    # force ingestor cache refresh so downstream context clears immediately
    ingestor.load_recent()


def run_module_1_processing(
    run_id: str,
    junction_type: str,
    video_paths: dict[str, str],
    retain_uploads: bool = False,
):
    """
    Runs Module 1 processing on the uploaded videos.
    """
    logger.info(f"Starting Module 1 processing for {junction_type} with videos: {video_paths}")
    
    # Clean up output_frames to ensure fresh results
    output_frames_dir = Path(__file__).resolve().parent.parent.parent / "module_1_traffic_detection" / "output_frames"
    if output_frames_dir.exists():
        # We only want to delete the contents, not the directory itself if possible, 
        # but recreating it is safer to remove all subdirs.
        shutil.rmtree(output_frames_dir)
        output_frames_dir.mkdir()
        logger.info("Cleaned up output_frames directory.")

    # Convert junction_type to CLI format
    # single -> 2-way (Module 1 doesn't have explicit 'single', so we treat as 2-way with 1 video)
    # four_way -> 4-way
    # two_way -> 2-way
    
    if junction_type == "single":
        cli_junction_type = "2-way" # Fallback to 2-way logic which handles partial inputs
    else:
        cli_junction_type = junction_type.replace("_", "-").replace("four", "4").replace("two", "2")

    # Construct command
    # python -m module_1_traffic_detection.app.multi_detect --no-prompts --junction-type {type} --videos dir=path ...
    
    cmd = [
        sys.executable,
        "-m",
        "module_1_traffic_detection.app.multi_detect",
        "--no-prompts",
        "--junction-type",
        cli_junction_type,
    ]

    for direction, path in video_paths.items():
        cmd.extend(["--videos", f"{direction}={path}"])
        
    try:
        # Run from the workspace root (parent of module_2_signal_logic)
        cwd = Path(__file__).resolve().parent.parent.parent
        
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        logger.info("Module 1 processing complete.")
        logger.debug(result.stdout)
        update_upload_status(run_id, "completed")
    except subprocess.CalledProcessError as e:
        logger.error(f"Module 1 processing failed: {e}")
        logger.error(e.stderr)
        update_upload_status(run_id, "failed", str(e))
    except Exception as e:
        logger.exception(f"Unexpected error running Module 1: {e}")
        update_upload_status(run_id, "failed", str(e))
    finally:
        if not retain_uploads:
            for path_str in video_paths.values():
                try:
                    Path(path_str).unlink(missing_ok=True)
                except Exception as exc:  # pragma: no cover - best effort cleanup
                    logger.debug("Failed to remove uploaded file %s: %s", path_str, exc)
            try:
                upload_root = Path(next(iter(video_paths.values()))).parent
            except StopIteration:
                upload_root = None
            if upload_root and upload_root.exists():
                try:
                    for leftover in upload_root.iterdir():
                        break
                    else:
                        upload_root.rmdir()
                except Exception:
                    pass


@app.get("/ingest/uploads")
async def list_uploads() -> list[dict]:
    """
    Returns a list of recent uploads.
    """
    return load_upload_history()


@app.delete("/ingest/uploads")
async def delete_uploads(upload_ids: List[str]) -> dict:
    """
    Delete upload records by IDs.
    """
    deleted_count = delete_upload_records(upload_ids)
    return {
        "deleted": deleted_count,
        "ids": upload_ids
    }


@app.post("/ingest/uploads")
async def ingest_uploads(
    background_tasks: BackgroundTasks,
    junction_type: str = Form(...),
    north: Optional[UploadFile] = File(None),
    south: Optional[UploadFile] = File(None),
    east: Optional[UploadFile] = File(None),
    west: Optional[UploadFile] = File(None),
    site_label: Optional[str] = Form(None),
    camera_label: Optional[str] = Form(None),
    location_label: Optional[str] = Form(None),
    context_notes: Optional[str] = Form(None),
    retain_uploads: Optional[str] = Form("false"),
):
    """
    Accepts video uploads for specific directions and triggers processing.
    """
    # Resolve workspace root relative to this file
    workspace_root = Path(__file__).resolve().parent.parent.parent

    retain_flag = str(retain_uploads).lower() in {"true", "1", "yes", "on"}

    if not retain_flag:
        clear_module1_upload_artifacts()

    upload_dir = workspace_root / "module_1_traffic_detection" / "observation_videos"
    if upload_dir.exists():
        shutil.rmtree(upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    saved_paths = {}
    
    files_map = {
        "north": north,
        "south": south,
        "east": east,
        "west": west
    }
    
    for direction, file_obj in files_map.items():
        if file_obj:
            # Sanitize filename or just use direction prefix
            safe_filename = Path(file_obj.filename).name
            file_path = upload_dir / f"{direction}_{safe_filename}"
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file_obj.file, buffer)
            saved_paths[direction] = str(file_path)
            
    if not saved_paths:
        raise HTTPException(status_code=400, detail="No files uploaded")
        
    # Create upload record
    run_id = str(uuid.uuid4())[:8]
    lane_count = len(saved_paths)
    display_name = site_label or camera_label or f"{junction_type.replace('_', ' ').title()} feed"
    directions_uploaded = sorted(saved_paths.keys())

    record = {
        "id": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "processing",
        "junctionId": "local-1",
        "analysisType": junction_type,
        "notes": context_notes or f"Processing {lane_count} video{'s' if lane_count != 1 else ''}",
        "siteLabel": site_label,
        "cameraLabel": camera_label,
        "locationLabel": location_label,
        "laneCount": lane_count,
        "displayName": display_name,
        "directions": directions_uploaded,
    }
    add_upload_record(record)

    # Trigger background processing
    background_tasks.add_task(
        run_module_1_processing,
        run_id,
        junction_type,
        saved_paths,
        retain_flag,
    )


@app.get("/media/output")
async def media_output(request: Request) -> dict:
    """
    Serve a manifest of the latest processed frames from Module 1.
    This endpoint scans the 'output_frames' directory and returns URLs
    that the dashboard can use to display the images.
    """
    # Files are exposed via the FastAPI static mount at /media/files so the
    # dashboard can fetch images without relying on a separate dev server.
    
    output_root = OUTPUT_FRAMES_ROOT
    available_dirs = {
        path.name: path
        for path in output_root.iterdir()
        if path.is_dir()
    } if output_root.exists() else {}

    metadata = ingestor.metadata
    upload_record = resolve_active_upload()
    snapshot_hint = signal_service.snapshot(datetime.now(timezone.utc), hydrate=False)
    direction_sequence = _resolve_lane_sequence(upload_record, snapshot_hint or {}, metadata)
    for lane_name in available_dirs:
        if lane_name not in direction_sequence:
            direction_sequence.append(lane_name)
    if not direction_sequence:
        direction_sequence = sorted(available_dirs.keys())

    lane_meta = _build_lane_metadata(direction_sequence)
    lane_aliases: Dict[str, str] = lane_meta["laneAliases"]

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "groups": [],
        "laneAliases": lane_aliases,
        "lanes": lane_meta["lanes"],
    }

    def build_frame_entry(
        file_path: Path,
        *,
        direction: str,
        lane_label: str,
        category: str,
        label: str,
        annotation: Optional[str] = None,
        suffix: Optional[str] = None,
    ) -> dict:
        relative_path = file_path.relative_to(output_root)
        url = str(request.url_for("media-files", path=relative_path.as_posix()))
        captured = datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc).isoformat()
        identifier = f"{direction}-{suffix}" if suffix else f"{direction}-{file_path.stem}"
        return {
            "id": identifier,
            "url": url,
            "label": label,
            "capturedAt": captured,
            "lane": direction,
            "laneLabel": lane_label,
            "category": category,
            "annotation": annotation,
        }

    for direction in direction_sequence:
        direction_dir = available_dirs.get(direction) or (output_root / direction)
        if not direction_dir.exists() or not direction_dir.is_dir():
            continue

        frames: List[Dict[str, Any]] = []
        lane_label = lane_aliases.get(direction, direction.replace("_", " ").title())

        latest_path = direction_dir / "latest.jpg"
        if latest_path.exists():
            frames.append(
                build_frame_entry(
                    latest_path,
                    direction=direction,
                    lane_label=lane_label,
                    category="full",
                    label="Full Frame (Latest)",
                    suffix="latest",
                )
            )

        for frame_file in sorted(direction_dir.glob("frame_*.jpg")):
            frames.append(
                build_frame_entry(
                    frame_file,
                    direction=direction,
                    lane_label=lane_label,
                    category="full",
                    label=f"Frame {frame_file.stem.split('_')[-1]}",
                )
            )

        classes_dir = direction_dir / "classes"
        if classes_dir.exists() and classes_dir.is_dir():
            for class_dir in sorted(p for p in classes_dir.iterdir() if p.is_dir()):
                class_name = class_dir.name
                latest_class_path = class_dir / "latest.jpg"
                if latest_class_path.exists():
                    frames.append(
                        build_frame_entry(
                            latest_class_path,
                            direction=direction,
                            lane_label=lane_label,
                            category="class",
                            label=f"{class_name.title()} (Latest)",
                            annotation=class_name.title(),
                            suffix=f"{class_name}-latest",
                        )
                    )

                for class_frame in sorted(class_dir.glob("frame_*.jpg")):
                    frames.append(
                        build_frame_entry(
                            class_frame,
                            direction=direction,
                            lane_label=lane_label,
                            category="class",
                            label=f"{class_name.title()} {class_frame.stem.split('_')[-1]}",
                            annotation=class_name.title(),
                            suffix=f"{class_name}-{class_frame.stem}",
                        )
                    )

        if not frames:
            continue

        group = {
            "id": direction,
            "label": lane_label,
            "frames": frames
        }
        manifest["groups"].append(group)

    return manifest


@app.post("/media/clear", status_code=204)
async def media_clear() -> None:
    clear_output_frames_on_disk()
    clear_module1_results_file()
    signal_service.reset()
    logger.info("Cleared Module 1 outputs and reset signal service state")
