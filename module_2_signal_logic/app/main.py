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
from typing import Optional, List, Dict, Any

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
    return jsonable_encoder(service.snapshot(now))


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


def clear_output_frames_on_disk() -> None:
    workspace_root = Path(__file__).resolve().parent.parent.parent
    outputs_root = workspace_root / "module_1_traffic_detection" / "output_frames"
    if not outputs_root.exists():
        return
    for direction_dir in outputs_root.iterdir():
        if direction_dir.is_dir():
            clear_output_directory(direction_dir)


def run_module_1_processing(run_id: str, junction_type: str, video_paths: dict[str, str]):
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
        "--videos"
    ]
    
    for direction, path in video_paths.items():
        cmd.append(f"{direction}={path}")
        
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


@app.get("/ingest/uploads")
async def list_uploads() -> list[dict]:
    """
    Returns a list of recent uploads.
    """
    return load_upload_history()


@app.post("/ingest/uploads")
async def ingest_uploads(
    background_tasks: BackgroundTasks,
    junction_type: str = Form(...),
    north: Optional[UploadFile] = File(None),
    south: Optional[UploadFile] = File(None),
    east: Optional[UploadFile] = File(None),
    west: Optional[UploadFile] = File(None),
):
    """
    Accepts video uploads for specific directions and triggers processing.
    """
    # Resolve workspace root relative to this file
    workspace_root = Path(__file__).resolve().parent.parent.parent
    
    # Save to observation_videos as requested
    upload_dir = workspace_root / "module_1_traffic_detection" / "observation_videos"
    
    # Clear previous observation videos to ensure relevance
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
    record = {
        "id": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "processing",
        "junctionId": "local-1",
        "analysisType": junction_type,
        "notes": f"Processing {len(saved_paths)} videos"
    }
    add_upload_record(record)

    # Trigger background processing
    background_tasks.add_task(run_module_1_processing, run_id, junction_type, saved_paths)
    
    return {
        "status": "processing_started",
        "run_id": run_id,
        "junction_type": junction_type,
        "files_received": list(saved_paths.keys())
    }


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
    directions = ["north", "east", "south", "west"]

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "groups": []
    }

    def build_frame_entry(
        file_path: Path,
        *,
        direction: str,
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
            "category": category,
            "annotation": annotation,
        }

    for direction in directions:
        direction_dir = output_root / direction
        if not direction_dir.exists() or not direction_dir.is_dir():
            continue

        frames: List[Dict[str, Any]] = []

        latest_path = direction_dir / "latest.jpg"
        if latest_path.exists():
            frames.append(
                build_frame_entry(
                    latest_path,
                    direction=direction,
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
            "label": direction.title(),
            "frames": frames
        }
        manifest["groups"].append(group)

    return manifest


@app.post("/media/clear", status_code=204)
async def media_clear() -> None:
    clear_output_frames_on_disk()
    logger.info("Cleared Module 1 output frames on disk")
