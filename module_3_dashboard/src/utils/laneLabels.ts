const TITLE_CASE_PATTERN = /\b\w/g;

export function formatLaneLabel(
  laneId: string | null | undefined,
  laneAliases?: Record<string, string>,
  fallback = "--"
): string {
  if (!laneId) {
    return fallback;
  }
  const trimmed = laneId.trim();
  if (!trimmed.length) {
    return fallback;
  }
  const alias = laneAliases?.[trimmed];
  if (alias) {
    return alias;
  }
  const normalized = trimmed.replace(/[_.-]+/g, " ").replace(/\s+/g, " ");
  return normalized.replace(TITLE_CASE_PATTERN, (char) => char.toUpperCase());
}
