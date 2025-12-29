# Module 1: Real-Time Traffic Detection System (YOLO + OpenCV)

## 1. Purpose and Scope
- Deliver the computer-vision pipeline that ingests live or recorded roadway footage, detects vehicles, aggregates traffic counts, and provides lane-level density metrics for downstream modules.
- Acts as the authoritative raw-data producer for the Smart Traffic Optimization System; no UI included, only CLI execution, JSON outputs, and optional API pushes.

## 2. Goals and Success Criteria
- Detect vehicles and relevant road users every frame using YOLOv8 (Ultralytics) models on top of OpenCV video capture.
- Maintain rolling counts per defined lane zones (North, East, West, South) with consistent timestamps.
- Persist structured telemetry (`results.json`) and optionally POST the same payloads to Module 2 backend endpoint `/update_traffic`.
- Provide human-verifiable evidence of detection accuracy via saved annotated frames in `output_frames/`.

## 3. Key Assumptions
- Python 3.10 or newer is available.
- GPU acceleration is optional; default implementation must run on CPU with acceptable performance on 720p footage (baseline 15 FPS on modern laptop).
- Video input is provided as MP4 files in `sample_videos/` or through webcam index `0`.
- Lane segmentation uses static polygon regions configured per junction and stored in `config/lane_regions.yaml`.

## 4. Functional Requirements
1. **Video Source Handling**
   - Support CLI flag `--source` accepting file path or webcam index.
   - Validate file existence and format; fail fast with clear error.
2. **Object Detection**
   - Load YOLOv8 model weights (`yolov8m.pt` default) using Ultralytics API.
   - Filter detections to classes: `car`, `bus`, `truck`, `motorcycle`, `bicycle`, `person`, `traffic light`.
   - Allow configurable confidence threshold (default 0.35) and IoU threshold (0.45).
3. **Lane Region Segmentation**
   - Read polygon definitions from config; assign each detection to first matching polygon.
   - Maintain per-lane counts per frame and rolling totals since start.
4. **Data Aggregation and Persistence**
   - Construct frame-level record containing frame id, per-lane counts, total count, timestamp ISO 8601, processing latency.
   - Append to in-memory list and flush to `results.json` every N frames (default 30) and on graceful shutdown.
5. **Backend Communication**
   - If `--push-api` flag provided, POST each record (or batch) to `http://localhost:8000/update_traffic` with retries and exponential backoff.
   - Log failures without blocking core processing; store unsent payloads in `cache/pending/` for replay.
6. **Visualization and Debugging**
   - Render window titled `Module 1 - Traffic Detection` with bounding boxes, lane labels, and per-lane counters overlay.
   - Save every Mth frame (default 60) with annotations into `output_frames/`, plus per-class snapshots under `output_frames/classes/` for quick inspection of individual categories.
7. **Operational Controls**
   - Provide keyboard shortcuts: `q` for quit, `p` for pause/resume, `s` to snapshot current frame.
   - Emit structured logs via `logging` module at INFO level.

## 5. Non-Functional Requirements
- Modular code organization (`detect.py` orchestrator, `utils.py` helpers, `config.py` for settings, `lanes.py` for polygons).
- Installation scripts must work via `python -m venv .venv && pip install -r requirements.txt`.
- Code documented with concise inline comments for complex logic; docstrings for public functions.
- Provide type hints across the codebase.
- Ensure graceful resource cleanup (release video capture, destroy OpenCV windows, flush files) even on exceptions.

## 6. Component Breakdown
- **Entry Point (`detect.py`)**: parses arguments, initializes model, runs processing loop, coordinates output writers.
- **Detection Service (`services/detector.py`)**: wraps YOLO inference, returns filtered detections per frame.
- **Lane Mapper (`services/lane_mapper.py`)**: loads polygons, assigns detections, maintains counts.
- **Output Manager (`services/output_writer.py`)**: handles JSON persistence, API pushes, frame exports.
- **Configuration Layer (`config/settings.py`)**: loads environment variables, defaults, and lane config.
- **Utilities (`utils/video.py`, `utils/geometry.py`)**: shared helpers for resizing, coordinate transforms.

## 7. Data Contracts
### 7.1 Input Payload
- Video frame (OpenCV BGR `numpy.ndarray`).
- Lane configuration YAML format:
  ```yaml
  junction_id: junction_01
  frame_width: 1280
  frame_height: 720
  lanes:
    north:
      - [x1, y1]
      - [x2, y2]
      - [x3, y3]
      - [x4, y4]
    east: [...]
  ```

### 7.2 Output JSON Record
```json
{
  "frame_id": 120,
  "timestamp": "2025-11-04T12:45:30.123Z",
  "junction_id": "junction_01",
  "counts": {
    "north": 23,
    "east": 10,
    "west": 18,
    "south": 8
  },
   "totals": {
      "north": 23,
      "east": 10,
      "west": 18,
      "south": 8
   },
  "latency_ms": 42.5
}
```

### 7.3 API Contract (POST `/update_traffic`)
- Headers: `Content-Type: application/json`.
- Body: batch of latest records (`List[TrafficRecord]`).
- Expected response: `202 Accepted` with body `{ "status": "queued" }`.
- Retry policy: up to 5 retries, 2^n seconds backoff, drop after persistent failure with local persistence.

## 8. Configuration and Environment
- `.env.example` specifying `MODEL_PATH`, `CONF_THRESHOLD`, `IOU_THRESHOLD`, `LANE_CONFIG`, `API_ENDPOINT`, `SAVE_EVERY_N_FRAMES`.
- Provide `config/settings.py` reading environment variables with defaults.
- Support CLI overrides for critical parameters.

## 9. Folder Structure
```
traffic_optimization_system/
└── module_1_traffic_detection/
    ├── app/
    │   ├── detect.py
    │   ├── __init__.py
    │   ├── config/
    │   │   ├── __init__.py
    │   │   ├── settings.py
    │   │   └── lane_regions.yaml
    │   ├── services/
    │   │   ├── detector.py
    │   │   ├── lane_mapper.py
    │   │   └── output_writer.py
    │   ├── utils/
    │   │   ├── geometry.py
    │   │   └── video.py
    │   └── cache/
    │       └── pending/
   ├── output_frames/
   │   └── classes/
    ├── sample_videos/
    │   └── traffic_junction.mp4 (placeholder)
    ├── data/
    │   └── results.json (generated)
    ├── scripts/
    │   ├── download_model_weights.py
    │   └── replay_from_results.py
    ├── tests/
    │   ├── __init__.py
    │   ├── test_lane_mapper.py
    │   └── test_output_writer.py
    ├── requirements.txt
    ├── README.md
    └── Makefile
```

## 10. Dependencies and Tooling
- YOLOv8 via `ultralytics` package.
- OpenCV (`opencv-python`), `numpy`, `pydantic`, `requests`, `pyyaml`, `rich` for logging, `pytest` for tests.
- Provide `Makefile` targets: `make install`, `make run`, `make test`, `make lint` (flake8 or ruff).
- Optional GPU support via `torch` with CUDA wheels documented in README.

## 11. Runbook (Developer Experience)
1. `python -m venv .venv`
2. `source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. `python app/detect.py --source sample_videos/traffic_junction.mp4 --junction junction_01`
5. Optional flags:
   - `--push-api` to enable backend POST.
   - `--save-every 30` to adjust annotated frame exporting.
   - `--no-display` for headless runs (still writes JSON and logs).

## 12. Testing Strategy
- Unit tests for lane assignment geometry, JSON serialization, API retry logic.
- Integration test using short sample video to ensure end-to-end processing over 50 frames.
- Mock backend server to validate POST payloads and retry handling.
- Performance smoke test measuring average latency over 500 frames.
- Regression tests verifying consistent output schema when lane config changes.

## 13. Monitoring and Logging
- Use `logging` with JSON formatter option when `LOG_FORMAT=json` env var set.
- Provide metrics counters (frames_processed, detections_total, api_failures) exposed via stdout or optional Prometheus client.
- Capture exceptions and write to `logs/module_1_errors.log` with stack trace.

## 14. Risks and Mitigations
- **Model Performance**: YOLOv8m balances accuracy and speed; permit downgrading to lighter variants (e.g., `yolov8n.pt`) if hardware struggles, or upgrading further for challenging scenes.
- **Frame Rate Drops**: Implement frame skipping configuration (`--process-every M` frames) for low-power devices.
- **Lane Mapping Accuracy**: Provide calibration script to adjust polygons using interactive tool.
- **API Downtime**: Local caching ensures no data loss when backend offline.
- **Latency Spikes**: Warm up model and reuse single instance; avoid per-frame model loads.

## 15. Handoff Checklist
- [ ] `requirements.txt` validated and documented.
- [ ] Sample video placeholder or download instructions provided.
- [ ] README includes setup, run commands, troubleshooting tips.
- [ ] Tests scripted and included in CI instructions.
- [ ] Integration contract with Module 2 signed off (data schema confirmed).
- [ ] Module verified on sample clip with saved annotated frames.

## 16. Implementation Notes for Coding Agent
- Prefer asynchronous processing only if necessary; start with synchronous loop for clarity.
- Encapsulate YOLO model initialization outside frame loop to minimize overhead.
- Use dataclasses or Pydantic models (`TrafficRecord`) to ensure schema consistency.
- Keep detection filtering logic configurable for future class additions (helmet detection, traffic police).
- Document any assumptions or deviations in `docs/change_log.md` for traceability.
