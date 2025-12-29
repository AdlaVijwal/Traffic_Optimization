#!/usr/bin/env python3
"""Replay stored detection results to the backend API."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Iterable, List

import requests

DEFAULT_API = "http://localhost:8000/update_traffic"


def load_results(path: Path) -> List[dict]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError("results.json must contain a list of records")
    return data


def replay(records: Iterable[dict], api_endpoint: str, delay: float) -> None:
    session = requests.Session()
    for record in records:
        response = session.post(api_endpoint, json=record, timeout=5)
        response.raise_for_status()
        print(f"Sent record {record.get('frame_id')} -> {response.status_code}")
        time.sleep(delay)
    session.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay cached traffic detection results")
    parser.add_argument("--results", type=Path, default=Path("module_1_traffic_detection/data/results.json"), help="Path to results JSON file")
    parser.add_argument("--endpoint", type=str, default=DEFAULT_API, help="Target API endpoint")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests in seconds")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = load_results(args.results)
    replay(records, args.endpoint, args.delay)


if __name__ == "__main__":
    main()
