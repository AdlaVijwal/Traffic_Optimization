# Smart Traffic Optimization System (STOS)

An AI-driven, proactive traffic management system that uses Computer Vision to optimize signal timings in real-time. Unlike traditional sensor-based systems, STOS classifies vehicles, calculates pixel-level density, and applies a weighted priority algorithm to reduce congestion and wait times.

## 🚀 Project Architecture

The system is divided into three specialized modules:

1.  **[Module 1: Traffic Detection](./module_1_traffic_detection)**
    *   **Tech:** YOLOv8, OpenCV, Python.
    *   **Role:** The "Eyes" of the system. Processes video feeds to detect vehicles, classify types, and calculate lane density.
2.  **[Module 2: Signal Logic](./module_2_signal_logic)**
    *   **Tech:** FastAPI, Python, JSON Persistence.
    *   **Role:** The "Brain" of the system. Implements the Priority Engine to decide signal states based on real-time telemetry.
3.  **[Module 3: Command Dashboard](./module_3_dashboard)**
    *   **Tech:** React, TypeScript, Vite, Tailwind CSS.
    *   **Role:** The "Interface". A 3D holographic dashboard for real-time monitoring, analytics, and manual overrides.

---

## 🛠️ Quick Start Guide

### Prerequisites
*   Python 3.9+
*   Node.js 18+
*   CCTV or Sample Video Feeds (MP4/MOV)

### 1. Environment Setup
We recommend using a shared virtual environment at the root:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r module_1_traffic_detection/requirements.txt
pip install -r module_2_signal_logic/requirements.txt
```

### 2. Download AI Models
```bash
cd module_1_traffic_detection
python scripts/download_model_weights.py --variant m
cd ..
```

### 3. Launch the Stack
You can run the entire system using the provided launcher:
```bash
python scripts/run_stack.py
```
*   **Backend:** [http://localhost:8000](http://localhost:8000)
*   **Dashboard:** [http://localhost:5173](http://localhost:5173)

---

## 🧠 Core Algorithms

### 1. Priority Scoring Formula
The system calculates a "Urgency Score" for every lane:
$$Score = (Density \times 0.6) + (WaitTime \times 0.4) - (Cooldown \times 0.2)$$
*   **Density:** Percentage of lane occupancy.
*   **WaitTime:** Seconds since the last green light.
*   **Cooldown:** Penalty to prevent rapid signal flickering.

### 2. Adaptive Green Duration
Green light time is not fixed; it scales with demand:
$$Duration = BaseTime + (Density \times ScalingFactor)$$

---

## 📈 Future Roadmap
*   **Edge AI:** Deployment on NVIDIA Jetson for zero-latency processing.
*   **V2X Integration:** Communicating directly with autonomous vehicles.
*   **Emergency Preemption:** Automatic "Green Wave" for ambulances and fire trucks.

---

## 📄 License
This project is developed for academic and research purposes in traffic flow optimization.
