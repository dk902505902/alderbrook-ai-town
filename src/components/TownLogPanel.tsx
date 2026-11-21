import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { LOCATION_LABELS, type TownLogItem } from '../types/town.ts';

interface TownLogPanelProps {
  logs: TownLogItem[];
}

type LogFilter = 'all' | 'remote' | 'decrees' | 'weather' | 'rank1' | 'rank2' | 'rank3';

export function TownLogPanel({ logs }: TownLogPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (filter === 'remote' && entry.agentId !== 'remote_command') return false;
      if (filter === 'decrees' && entry.agentId !== 'god_decree') return false;
      if (filter === 'weather' && entry.agentId !== 'weather_shift') return false;
      if (filter === 'rank1' && entry.rank !== 1) return false;
      if (filter === 'rank2' && entry.rank !== 2) return false;
      if (filter === 'rank3' && entry.rank !== 3) return false;
      if (!q) return true;
      return (
        entry.agentName.toLowerCase().includes(q) ||
        entry.dialogue.toLowerCase().includes(q) ||
        entry.thought.toLowerCase().includes(q) ||
        entry.location.toLowerCase().includes(q)
      );
    });
  }, [logs, filter, searchQuery]);

  const handleExportChronicle = () => {
    const lines = [
      '# Alderbrook AI Town Chronicle',
      `Exported: ${new Date().toISOString()}`,
      '',
      ...logs
        .slice()
        .reverse()
        .map((entry) => {
          const loc = LOCATION_LABELS[entry.location] || entry.location;
          const target = entry.targetAgent ? ` -> ${entry.targetAgent}` : '';
          return `### Turn ${entry.turnNumber} — ${entry.agentName} (${loc}${target})\n- **Dialogue:** "${entry.dialogue}"\n- **Thought:** ${entry.thought}\n- **Task:** ${entry.newTask}\n`;
        }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alderbrook-chronicle-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filterButtons: Array<{ id: LogFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'remote', label: 'Remote' },
    { id: 'decrees', label: 'Decrees' },
    { id: 'weather', label: 'Weather' },
    { id: 'rank1', label: 'Mayor' },
    { id: 'rank2', label: 'Managers' },
    { id: 'rank3', label: 'Workers' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Search + Filter + Export Bar */}
      <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter logs..."
              aria-label="Search town logs"
              className="min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 py-1.5 pr-3 pl-9 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleExportChronicle}
            title="Export Town Chronicle (.md)"
            aria-label="Export Town Chronicle"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition-colors hover:border-white/25 hover:bg-slate-800 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilter(btn.id)}
              className={`min-h-[36px] shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === btn.id
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Entries */}
      {filteredLogs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
          {logs.length === 0
            ? 'No town activity recorded yet. Press Next Turn or Play to start the council.'
            : 'No log entries match your current filter.'}
        </div>
      ) : (
        <div className="hud-scroll flex-1 space-y-2.5 overflow-y-auto p-3.5">
          {filteredLogs.map((entry) => {
            const isRemote = entry.agentId === 'remote_command';
            const isWeatherShift = entry.agentId === 'weather_shift';
            const isDecree = entry.rank === 0 && !isWeatherShift && !isRemote;
            return (
              <div
                key={entry.id}
                className={`rounded-xl border p-3 ${
                  isRemote
                    ? 'border-emerald-400/40 bg-emerald-500/10'
                    : isWeatherShift
                      ? 'border-sky-400/35 bg-sky-500/10'
                      : isDecree
                        ? 'border-amber-400/40 bg-amber-500/10'
                        : 'border-white/10 bg-slate-900/75'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-display font-semibold ${
                      isRemote ? 'text-emerald-200' : 'text-white'
                    }`}
                  >
                    {entry.agentName}
                  </span>
                  <span className="font-mono-tabular text-slate-400">
                    Turn {entry.turnNumber}
                  </span>
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                  <span>{LOCATION_LABELS[entry.location] || entry.location}</span>
                  {entry.targetAgent && (
                    <>
                      <span aria-hidden="true">→</span>
                      <span className="text-slate-300">{entry.targetAgent}</span>
                    </>
                  )}
                </div>

                <p className="mt-2 text-sm leading-snug text-slate-100">
                  {isWeatherShift || isRemote ? entry.dialogue : `“${entry.dialogue}”`}
                </p>

                {!isDecree && entry.thought && (
                  <p
                    className={`mt-1.5 text-xs leading-relaxed ${
                      isRemote
                        ? 'text-emerald-200/80'
                        : isWeatherShift
                          ? 'text-sky-200/80'
                          : 'text-slate-400'
                    }`}
                  >
                    {entry.thought}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
