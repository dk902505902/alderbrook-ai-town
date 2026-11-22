import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

export interface PaletteAction {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  actions: PaletteAction[];
  onClose: () => void;
}

function scoreMatch(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 5;
  if (t.startsWith(q)) return 4;
  if (t.includes(q)) return 3;
  // Subsequence match keeps "bld" → "Build structure" discoverable
  let cursor = 0;
  for (const char of t) {
    if (char === q[cursor]) cursor += 1;
    if (cursor === q.length) return 1;
  }
  return 0;
}

export function CommandPalette({ isOpen, actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const results = useMemo(() => {
    const scored = actions
      .map((action) => {
        const haystack = `${action.label} ${action.group} ${action.hint ?? ''} ${action.keywords ?? ''}`;
        return { action, score: scoreMatch(query, haystack) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((entry) => entry.action);
  }, [actions, query]);

  useEffect(() => {
    setActiveIndex((prev) => (prev >= results.length ? 0 : prev));
  }, [results.length]);

  if (!isOpen) return null;

  const runActive = (index: number) => {
    const action = results[index];
    if (!action) return;
    onClose();
    action.run();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/70 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((prev) =>
                  results.length ? (prev - 1 + results.length) % results.length : 0,
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runActive(activeIndex);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search actions, villagers, buildings…"
            aria-label="Search town actions"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="hud-scroll max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-slate-500">
              Nothing matches “{query}”. Try “build”, “quality” or a villager name.
            </p>
          )}
          {results.map((action, index) => {
            const previous = results[index - 1];
            const showGroup = !previous || previous.group !== action.group;
            return (
              <div key={action.id}>
                {showGroup && (
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                    {action.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runActive(index)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs transition-colors ${
                    index === activeIndex
                      ? 'bg-amber-500/15 text-amber-100'
                      : 'text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{action.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {action.hint && <span className="text-[10px] text-slate-500">{action.hint}</span>}
                    {index === activeIndex && <CornerDownLeft className="h-3 w-3 text-amber-300" />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          <span>↑↓ navigate · ⏎ run</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
