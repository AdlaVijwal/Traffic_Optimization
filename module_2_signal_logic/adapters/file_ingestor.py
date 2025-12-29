import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from module_2_signal_logic.core.models import LaneSnapshot


class ResultsFileIngestor:
    """Load lane telemetry snapshots from Module 1 results JSON file."""

    def __init__(self, source_path: Path, window_size: int = 20) -> None:
        self.source_path = source_path
        self.window_size = max(window_size, 1)
        self._metadata: Dict[str, Any] = {}

    def load_recent(self) -> List[LaneSnapshot]:
        if not self.source_path.exists():
            return []

        try:
            payload = json.loads(self.source_path.read_text())
        except (json.JSONDecodeError, OSError):
            return []

        records, metadata = self._extract(payload)
        self._metadata = metadata
        if not records:
            return []

        snapshots: List[LaneSnapshot] = []
        current_counts: Dict[str, int] = {}
        current_totals: Dict[str, int] = {}
        current_signals: Dict[str, str] = {}

        for raw in records:
            timestamp = self._parse_timestamp(raw.get("timestamp"))
            if timestamp is None:
                continue

            direction = self._normalize_direction(raw.get("direction"))
            counts = self._coerce_int_map(raw.get("counts", {}))
            totals = self._coerce_int_map(raw.get("totals", {}))
            if direction:
                if counts:
                    if direction in counts:
                        current_counts[direction] = counts[direction]
                    elif len(counts) == 1:
                        current_counts[direction] = next(iter(counts.values()))
                value = raw.get("vehicle_count")
                if direction not in current_counts and value is not None:
                    try:
                        current_counts[direction] = int(value)
                    except (TypeError, ValueError):
                        pass

                if totals:
                    if direction in totals:
                        current_totals[direction] = totals[direction]
                    elif len(totals) == 1:
                        current_totals[direction] = next(iter(totals.values()))
                total_value = raw.get("total")
                if direction not in current_totals and total_value is not None:
                    try:
                        current_totals[direction] = int(total_value)
                    except (TypeError, ValueError):
                        pass

                signal_state = raw.get("signal_state")
                if isinstance(signal_state, str):
                    current_signals[direction] = signal_state.lower()

            # Merge full-lane counts when available so snapshots stay populated
            if counts:
                for lane, value in counts.items():
                    current_counts[lane] = value

            if totals:
                for lane, value in totals.items():
                    current_totals[lane] = value

            frame_id = self._coerce_optional_int(raw.get("frame_id"))
            latency = self._coerce_optional_float(raw.get("latency_ms"))
            snapshot = LaneSnapshot(
                frame_id=frame_id,
                timestamp=timestamp,
                lane_counts=dict(current_counts),
                totals=dict(current_totals),
                latency_ms=latency,
                direction=direction,
                signal_states=dict(current_signals),
                junction_type=self._metadata.get("junction_type"),
            )
            snapshots.append(snapshot)

        return snapshots[-self.window_size :]

    @staticmethod
    def _coerce_int_map(payload: object) -> dict[str, int]:
        if not isinstance(payload, dict):
            return {}
        result: dict[str, int] = {}
        for key, value in payload.items():
            try:
                result[str(key)] = int(value)
            except (TypeError, ValueError):
                continue
        return result

    @staticmethod
    def _coerce_optional_int(value: object) -> Optional[int]:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _coerce_optional_float(value: object) -> Optional[float]:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_direction(value: object) -> Optional[str]:
        if not isinstance(value, str):
            return None
        trimmed = value.strip()
        return trimmed.lower() if trimmed else None

    @staticmethod
    def _parse_timestamp(value: object) -> Optional[datetime]:
        if not isinstance(value, str):
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    def _extract(self, payload: object) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        if isinstance(payload, dict):
            records = payload.get("records", [])
            metadata = payload.get("metadata", {})
            records_list = [item for item in records if isinstance(item, dict)] if isinstance(records, list) else []
            metadata_dict = metadata if isinstance(metadata, dict) else {}
            return records_list, metadata_dict
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)], {}
        return [], {}

    @property
    def metadata(self) -> Dict[str, Any]:
        return dict(self._metadata)
