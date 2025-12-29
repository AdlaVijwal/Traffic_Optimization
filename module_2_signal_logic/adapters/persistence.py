import json
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

from module_2_signal_logic.core.models import CycleDecision


class JsonPersistence:
    """Persist cycle decisions and state snapshots as JSON artifacts."""

    def __init__(self, history_path: Path, state_snapshot_path: Path) -> None:
        self.history_path = history_path
        self.state_snapshot_path = state_snapshot_path
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_snapshot_path.parent.mkdir(parents=True, exist_ok=True)

    def append_history(self, decisions: Iterable[CycleDecision]) -> None:
        serialized: List[dict] = []
        for decision in decisions:
            serialized.append(json.loads(decision.json()))
        if not serialized:
            return

        existing: List[dict] = []
        if self.history_path.exists():
            try:
                existing = json.loads(self.history_path.read_text())
            except (json.JSONDecodeError, OSError):
                existing = []
        existing.extend(serialized)
        self.history_path.write_text(json.dumps(existing, indent=2))

    def save_state(self, state: dict) -> None:
        sanitized = self._sanitize(state)
        self.state_snapshot_path.write_text(json.dumps(sanitized, indent=2))

    def clear_history(self) -> None:
        self.history_path.write_text("[]\n")

    def _sanitize(self, payload: object) -> object:
        if isinstance(payload, dict):
            return {str(k): self._sanitize(v) for k, v in payload.items()}
        if isinstance(payload, list):
            return [self._sanitize(item) for item in payload]
        if isinstance(payload, datetime):
            return payload.isoformat()
        return payload
