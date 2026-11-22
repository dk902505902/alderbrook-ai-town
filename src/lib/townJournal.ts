const JOURNAL_PREFIX = 'alderbrook_journal_v1_';

function journalKey(townId: string): string {
  return `${JOURNAL_PREFIX}${townId}`;
}

export function loadJournal(townId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(journalKey(townId)) ?? '';
  } catch {
    return '';
  }
}

export function saveJournal(townId: string, text: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(journalKey(townId), text.slice(0, 8000));
  } catch {
    // Journal is optional; never block the town on storage limits
  }
}
