# Module 2: Adaptive Signal Logic (The Brain)

## Overview
This module is the decision-making core of the system. It consumes telemetry from Module 1 and uses a deterministic **Priority Engine** to calculate the optimal signal timings. It exposes a REST API for the dashboard and manages the state of the entire junction.

## Key Components
- **Priority Engine:** Weighted scoring algorithm for lane selection.
- **Scheduler:** Manages the lifecycle of green/yellow/red cycles.
- **State Store:** JSON-based persistence for zero-latency history tracking.
- **Upload Orchestrator:** Handles the end-to-end flow of user-uploaded videos.

## Installation
```bash
pip install -r requirements.txt
```

## API Endpoints
- `GET /signal/status`: Current junction state (Green lane, countdown).
- `GET /signal/history`: Historical cycle data for analytics.
- `POST /ingest/uploads`: Endpoint for processing new video recordings.
- `GET /media/manifest`: Serves the latest annotated frames to the UI.

## Running the Backend
```bash
uvicorn app.main:app --reload --port 8000
```

## Logic Breakdown
The system prevents "Starvation" (lanes waiting too long) by increasing the priority score of a lane the longer it stays red. It also uses "Cooldowns" to ensure traffic flow isn't disrupted by overly frequent signal changes.
- Copies the latest results into `TRAFFIC_RESULTS_SOURCE` for the signal engine to ingest immediately.
- Exposes progress, errors, and media URLs through the REST endpoints listed above.

The orchestrator shares state via `storage/upload_runs.json`. Removing the file resets the queue.
