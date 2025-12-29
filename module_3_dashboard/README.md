- `VITE_FRAMES_BASE_URL` — HTTP location for Module 1 `output_frames` (e.g. `http://127.0.0.1:9000/output_frames`).
- Quick host: from `module_1_traffic_detection`, run `python -m http.server 9000` and ensure the server exposes the `output_frames` directory.

## Parallel Run Quickstart
1. Activate the shared virtual environment and launch Module 2 (FastAPI):

	```bash
	cd /Users/vijwaladla/Documents/Projects/Traffic_Optimization
	source .venv/bin/activate
	uvicorn module_2_signal_logic.app.main:app --reload --port 8000
	```

2. In a new terminal, start Module 1 using the packaged observation videos (skip `--push-api`; Module 2 reads the results file directly):

	```bash
	cd /Users/vijwaladla/Documents/Projects/Traffic_Optimization
	source .venv/bin/activate
	python -m module_1_traffic_detection.app.multi_detect --no-prompts --observations-dir module_1_traffic_detection/observation_videos
	```

3. Host the YOLO frames so the dashboard can display them:

	```bash
	cd /Users/vijwaladla/Documents/Projects/Traffic_Optimization
	source .venv/bin/activate
	cd module_1_traffic_detection/output_frames
	python -m http.server 9000
	```

4. Copy `.env.example` to `.env` inside `module_3_dashboard` and adjust the URLs if needed, then run the dashboard:

	```bash
	cd /Users/vijwaladla/Documents/Projects/Traffic_Optimization
	cp module_3_dashboard/.env.example module_3_dashboard/.env
	npm --prefix module_3_dashboard run dev
	```

With all three terminals running, visit `http://localhost:5173/` to see live counts, decisions, and YOLO stills.
# Module 3: Command Dashboard (The Interface)

## Overview
A high-end, 3D holographic dashboard built with **React** and **Vite**. It provides real-time visualization of the traffic junction, including live telemetry, signal countdowns, and AI-annotated video frames.

## Key Features
- **3D Navigation:** Holographic header with live telemetry chips.
- **Real-Time Monitoring:** Live updates of lane density and signal states via FastAPI hooks.
- **Video Upload Center:** Drag-and-drop interface to process new traffic recordings.
- **Explainable AI:** Panels that show *why* the system made a specific signal decision.
- **Responsive Design:** Fully optimized for control-room displays and mobile monitoring.

## Installation
```bash
npm install
```

## Development
```bash
npm run dev
```
*The dashboard will be available at [http://localhost:5173](http://localhost:5173).*

## Tech Stack
- **Frontend:** React 18, TypeScript.
- **Styling:** Tailwind CSS with custom glassmorphism effects.
- **Build Tool:** Vite for ultra-fast development.
- **Icons:** Lucide-React for a modern UI aesthetic.

## Environment Configuration
Create a `.env` file in this directory:
```env
VITE_API_BASE_URL=http://localhost:8000
```

## Data & APIs
- `GET /signal/status`, `/signal/next`, `/signal/history`, `/metrics` drive the dashboard widgets.
- `GET /media/manifest` surfaces the latest annotated frames.
- `POST /ingest/uploads` and `GET /ingest/uploads` underpin the upload workflow.

## Project Scripts
- `npm run dev` – Vite dev server (automatically used by `run_stack.py`)
- `npm run build` – type-check and build for production
- `npm run preview` – serve the production build locally
- `npm run lint` – ESLint across the codebase

## Tech Stack
- React 18 + TypeScript + Vite
- React Router 6 for navigation
- Tailwind CSS theming
- TanStack Query for data fetching/caching
- Axios for HTTP interactions
- Framer Motion for micro-animations

## Interaction Flow
1. Upload a junction recording from the **Video Uploads** page. Module 1 runs headless, stores results, and refreshes Module 2 automatically.
2. Switch to **Dashboard** to inspect the countdown billboard, lane cards, and new snapshots.
3. When sensors come online, the **Live Access** page will transition from guidance to real-time monitoring without further code changes.

Happy monitoring!
