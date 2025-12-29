# Module 1: Real-Time Traffic Detection (Vision Engine)

## Overview
This module serves as the "Eyes" of the Smart Traffic Optimization System. It utilizes **YOLOv8** for high-speed object detection and **OpenCV** for geometric lane analysis. It transforms raw video streams into structured telemetry (vehicle counts, density, and signal states).

## Key Features
- **Vehicle Classification:** Detects cars, trucks, buses, and motorcycles with high precision.
- **Lane-Level Analytics:** Uses custom polygon masks to calculate density per lane.
- **Signal State Detection:** Employs HSV color-space masking to "read" existing traffic lights.
- **Automated Pipeline:** Programmatic execution for batch processing of junction videos.

## Installation
```bash
pip install -r requirements.txt
python scripts/download_model_weights.py --variant m
```

## Usage
### Manual Detection
```bash
python app/detect.py --source sample_videos/traffic_junction.mp4
```

### Multi-Direction Processing
```bash
python app/multi_detect.py --junction-type 4-way --observations-dir observation_videos
```

## Technical Specifications
- **Model:** YOLOv8m (Medium) for optimal balance between speed and accuracy.
- **Inference:** Optimized for CPU/GPU execution via Ultralytics.
- **Output:** Structured JSON telemetry and annotated frame snapshots.


```python
from module_1_traffic_detection.app.config.settings import load_settings
from module_1_traffic_detection.app.detect import run_detection_pipeline

settings = load_settings(
  snapshot_dir="/tmp/snapshots",
  data_dir="/tmp/results",
  display=False,
  no_video_output=True,
)

result = run_detection_pipeline(
  settings,
  source="/path/to/video.mp4",
  metadata={"run_id": "demo"},
)

print(result.results_path)
print(result.snapshot_dir)
print(result.processed_frames)
```

The new API returns a `DetectionRunResult` containing resolved paths and counts. Module 2’s upload orchestrator relies on this helper to process user-submitted footage and immediately refresh downstream telemetry.

## Testing
```bash
pytest -q
```
Tests cover lane aggregation logic and output persistence, using temporary directories.

## Project Layout
```
app/
  detect.py               # Single-source CLI entry point
  multi_detect.py         # Multi-direction upload workflow
  config/settings.py      # Configuration layer
  services/               # Detector, lane mapper, output manager
  utils/                  # Geometry + video helpers
  cache/pending/          # Deferred payload storage
scripts/                  # Utility executables
sample_videos/            # Place CCTV footage here
observation_videos/       # Drop direction-named footage for automatic loading
output_frames/            # Annotated frame exports
  <direction>/            # Direction-specific folders (north/, south/, ...)
    classes/              # Per-class snapshots for that approach
data/uploads/custom/      # Processed uploads written by the orchestrator
```

## Troubleshooting
- **Missing dependencies**: ensure `pip install -r requirements.txt` succeeded.
- **Model path errors**: run the download script or adjust `--model` CLI flag.
- **OpenCV window not showing**: disable macOS app nap or run `--no-display` for headless.
- **Backend unavailable**: run without `--push-api` or inspect cached payloads under `app/cache/pending/`.
- **Lane counts remain zero**: adjust polygons in `app/config/lane_regions.yaml` to fit your camera view, run with `--full-frame-lanes` to treat each camera as the full frame, or use `multi_detect.py --no-prompts` so unmatched directions fall back to the full-frame mapper.
