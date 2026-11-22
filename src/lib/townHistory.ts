export interface HistorySample {
  turn: number;
  ts: number;
  timber: number;
  stone: number;
  food: number;
  gold: number;
  prosperity: number;
  population: number;
  buildings: number;
}

const HISTORY_PREFIX = 'alderbrook_history_v1_';
const MAX_SAMPLES = 120;

function historyKey(townId: string): string {
  return `${HISTORY_PREFIX}${townId}`;
}

export function loadHistory(townId: string): HistorySample[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(historyKey(townId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistorySample[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (sample) =>
        sample &&
        typeof sample.turn === 'number' &&
        typeof sample.prosperity === 'number' &&
        typeof sample.population === 'number',
    );
  } catch {
    return [];
  }
}

/** Appends a sample, replacing the entry for the same turn so re-renders never duplicate. */
export function recordHistory(townId: string, sample: HistorySample): HistorySample[] {
  const existing = loadHistory(townId);
  const withoutTurn = existing.filter((entry) => entry.turn !== sample.turn);
  const next = [...withoutTurn, sample]
    .sort((a, b) => a.turn - b.turn)
    .slice(-MAX_SAMPLES);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(historyKey(townId), JSON.stringify(next));
    } catch {
      // History is optional telemetry; never block the town on quota errors
    }
  }
  return next;
}

export function clearHistory(townId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(historyKey(townId));
  } catch {
    // Ignore
  }
}
