"""Handle persistence, API pushes, and frame exports."""
from __future__ import annotations

import json
import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from datetime import datetime, timezone

import cv2
import numpy as np
import requests

from ..config.settings import AppSettings

LOGGER = logging.getLogger(__name__)


@dataclass
class TrafficRecord:
    frame_id: int
    timestamp: str
    junction_id: str
    counts: Dict[str, int]
    totals: Dict[str, int]
    latency_ms: float
    vehicle_buckets: Dict[str, int]
    direction: Optional[str] = None
    signal_state: Optional[str] = None
    source_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "frame_id": self.frame_id,
            "timestamp": self.timestamp,
            "junction_id": self.junction_id,
            "counts": self.counts,
            "totals": self.totals,
            "latency_ms": self.latency_ms,
            "vehicle_buckets": self.vehicle_buckets,
            "direction": self.direction,
            "signal_state": self.signal_state,
            "source_id": self.source_id,
        }


def reset_output_state(settings: AppSettings, *, include_cache: bool = False) -> None:
    """Remove persisted artifacts so the next run starts clean."""

    results_path = settings.data_dir / settings.results_filename
    snapshot_dir = settings.snapshot_dir
    cache_dir = settings.cache_dir

    snapshot_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    try:
        if results_path.exists():
            results_path.unlink()
            LOGGER.debug("Removed stale results file %s", results_path)
    except OSError as exc:
        LOGGER.warning("Unable to remove results file %s: %s", results_path, exc)

    if snapshot_dir.exists():
        for artifact in snapshot_dir.iterdir():
            try:
                if artifact.is_dir():
                    shutil.rmtree(artifact, ignore_errors=True)
                else:
                    artifact.unlink()
            except OSError as exc:
                LOGGER.warning("Unable to remove snapshot artifact %s: %s", artifact, exc)
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    if include_cache:
        for payload in cache_dir.glob("*.json"):
            try:
                payload.unlink()
            except OSError as exc:
                LOGGER.warning("Unable to remove cached payload %s: %s", payload, exc)


class OutputManager:
    """Manage records persistence and backend integration."""

    def __init__(
        self,
        settings: AppSettings,
        session: Optional[requests.Session] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.settings = settings
        self.records: List[TrafficRecord] = []
        self._flush_counter = 0
        self._session = session or requests.Session()
        self.results_path = settings.data_dir / settings.results_filename
        self.results_path.parent.mkdir(parents=True, exist_ok=True)
        settings.snapshot_dir.mkdir(parents=True, exist_ok=True)
        settings.cache_dir.mkdir(parents=True, exist_ok=True)
        self._reset_outputs()
        self.metadata: Dict[str, Any] = metadata or {}
        if self.metadata and "input_mode" not in self.metadata:
            self.metadata["input_mode"] = "video_upload"

    def append_record(self, record: TrafficRecord) -> None:
        """Add record to in-memory buffer and flush periodically."""

        self.records.append(record)
        self._flush_counter += 1
        if self._flush_counter >= self.settings.flush_every_n_frames:
            self.flush()

        if self.settings.push_api and self.settings.api_endpoint:
            self._post_with_retry(record.to_dict())

    def flush(self, force: bool = False) -> None:
        """Write buffered records to results file."""

        if not self.records and not force:
            return
        serialized = [record.to_dict() for record in self.records]
        payload: Any
        if self.metadata:
            payload = {
                "schema_version": 2,
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "metadata": self.metadata,
                "records": serialized,
            }
        else:
            payload = serialized
        with self.results_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        LOGGER.info("Flushed %d records to %s", len(self.records), self.results_path)
        self._flush_counter = 0

    def close(self) -> None:
        """Flush outstanding records on shutdown."""

        LOGGER.debug("Closing output manager, forcing flush")
        self.flush(force=True)
        self._session.close()

    def save_annotated_frame(self, frame: np.ndarray, frame_id: int, direction: Optional[str] = None) -> Path:
        """Persist annotated frame to disk."""

        target_dir = self._snapshot_base_dir(direction)
        target = target_dir / f"frame_{frame_id:05d}.jpg"
        cv2.imwrite(str(target), frame)
        self._write_latest_snapshot(target_dir, frame)
        LOGGER.debug("Saved annotated frame %s", target)
        return target

    def save_frame_bundle(
        self,
        annotated: np.ndarray,
        class_frames: Dict[str, np.ndarray],
        frame_id: int,
        direction: Optional[str] = None,
    ) -> None:
        """Persist annotated frame along with class-specific variants."""

        base_dir = self._snapshot_base_dir(direction)
        target = base_dir / f"frame_{frame_id:05d}.jpg"
        cv2.imwrite(str(target), annotated)
        self._write_latest_snapshot(base_dir, annotated)
        LOGGER.debug("Saved annotated frame %s", target)
        for class_name, image in class_frames.items():
            self._save_class_frame(base_dir, class_name, image, frame_id)

    def _post_with_retry(self, payload: Dict[str, Any]) -> None:
        if not self.settings.api_endpoint:
            return
        retries = 0
        max_retries = 5
        backoff = 1.0
        while retries <= max_retries:
            try:
                response = self._session.post(self.settings.api_endpoint, json=payload, timeout=5)
                if response.status_code >= 400:
                    raise requests.HTTPError(f"Received status {response.status_code}")
                LOGGER.debug("Payload delivered to backend")
                return
            except (requests.RequestException, Exception) as exc:
                LOGGER.warning("Failed to deliver payload (attempt %d/%d): %s", retries + 1, max_retries, exc)
                retries += 1
                if retries > max_retries:
                    self._handle_failed_payload(payload)
                    return
                time.sleep(backoff)
                backoff *= 2

    def _handle_failed_payload(self, payload: Dict[str, Any]) -> None:
        if not self.settings.save_unsent_payloads:
            return
        timestamp = int(time.time())
        target = self.settings.cache_dir / f"payload_{timestamp}.json"
        with target.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        LOGGER.error("Payload persisted to %s after repeated failures", target)

    def reset_outputs(self, include_cache: bool = False) -> None:
        """Expose artifact reset for callers that need a manual cleanup."""

        reset_output_state(self.settings, include_cache=include_cache)

    def _reset_outputs(self) -> None:
        """Clear stale output artifacts before a new run."""

        reset_output_state(self.settings)

    def _snapshot_base_dir(self, direction: Optional[str]) -> Path:
        if direction:
            safe_name = direction.lower().replace(" ", "_")
            target_dir = self.settings.snapshot_dir / safe_name
        else:
            target_dir = self.settings.snapshot_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir

    def _save_class_frame(self, base_dir: Path, class_name: str, image: np.ndarray, frame_id: int) -> None:
        safe_name = class_name.lower().replace(" ", "_") or "unknown"
        target_dir = base_dir / "classes" / safe_name
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"frame_{frame_id:05d}.jpg"
        cv2.imwrite(str(target), image)
        self._write_latest_snapshot(target_dir, image)
        LOGGER.debug("Saved %s snapshot %s", class_name, target)

    def _write_latest_snapshot(self, directory: Path, image: np.ndarray) -> None:
        latest_path = directory / "latest.jpg"
        temp_path = directory / "latest.tmp.jpg"
        cv2.imwrite(str(temp_path), image)
        temp_path.replace(latest_path)
