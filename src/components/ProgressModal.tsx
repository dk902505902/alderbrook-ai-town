import { useRef, useState } from 'react';
import {
  Award,
  Check,
  Download,
  Flame,
  LineChart,
  Lock,
  Save,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { RESOURCE_META, RESOURCE_IDS, formatResourcesShort } from '../lib/economy.ts';
import type { HistorySample } from '../lib/townHistory.ts';
import type { AchievementDef, ObjectiveRow } from '../lib/progression.ts';

type ProgressTab = 'objectives' | 'achievements' | 'analytics' | 'data';

interface ProgressModalProps {
  isOpen: boolean;
  townName: string;
  objectives: ObjectiveRow[];
  achievements: Array<{ def: AchievementDef; unlocked: boolean }>;
  history: HistorySample[];
  lastSavedAt: number | null;
  importBusy: boolean;
  importError: string | null;
  onClose: () => void;
  onSaveNow: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onClearHistory: () => void;
}

const TABS: Array<{ id: ProgressTab; label: string; Icon: typeof Target }> = [
  { id: 'objectives', label: 'Objectives', Icon: Target },
  { id: 'achievements', label: 'Achievements', Icon: Award },
  { id: 'analytics', label: 'Analytics', Icon: LineChart },
  { id: 'data', label: 'Save data', Icon: Save },
];

const TIER_COLORS: Record<AchievementDef['tier'], string> = {
  bronze: 'text-amber-400 border-amber-400/30 bg-amber-500/10',
  silver: 'text-slate-200 border-slate-300/30 bg-slate-300/10',
  gold: 'text-yellow-300 border-yellow-300/40 bg-yellow-400/10',
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div className="flex h-14 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-[10px] text-slate-500">
        Needs a couple of turns of data
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 92 - ((value - min) / span) * 84;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MetricRow({
  label,
  values,
  color,
  suffix = '',
}: {
  label: string;
  values: number[];
  color: string;
  suffix?: string;
}) {
  const first = values[0];
  const last = values[values.length - 1];
  const delta = values.length >= 2 && typeof first === 'number' ? last - first : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
          {label}
        </span>
        <span className="font-mono-tabular text-sm font-semibold text-white">
          {typeof last === 'number' ? Math.round(last) : '—'}
          {suffix}
          {values.length >= 2 && (
            <span
              className={`ml-1.5 text-[10px] font-medium ${
                delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {Math.round(delta)}
            </span>
          )}
        </span>
      </div>
      <Sparkline values={values} color={color} />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>turn {values.length >= 2 ? 'start' : '—'}</span>
        <span>{values.length} samples</span>
      </div>
    </div>
  );
}

export function ProgressModal({
  isOpen,
  townName,
  objectives,
  achievements,
  history,
  lastSavedAt,
  importBusy,
  importError,
  onClose,
  onSaveNow,
  onExport,
  onImportFile,
  onClearHistory,
}: ProgressModalProps) {
  const [tab, setTab] = useState<ProgressTab>('objectives');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const unlockedCount = achievements.filter((entry) => entry.unlocked).length;
  const completedObjectives = objectives.filter((row) => row.complete).length;
  const savedLabel = lastSavedAt
    ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not saved yet';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-3 py-6 backdrop-blur-sm md:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Mayor’s Desk</h2>
            <p className="text-xs text-slate-400">
              {townName} · {completedObjectives}/{objectives.length} objectives ·{' '}
              {unlockedCount}/{achievements.length} achievements · {savedLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Mayor's Desk"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="hud-scroll flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                tab === id
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'objectives' && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] text-slate-400">
                Three fresh objectives per local day. Rewards are paid straight into town stores.
              </p>
              {objectives.map((row) => {
                const pct = Math.round((row.progress / row.target) * 100);
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border p-3 ${
                      row.complete
                        ? 'border-emerald-400/30 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                          {row.complete && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                          {row.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{row.detail}</p>
                      </div>
                      <span className="shrink-0 font-mono-tabular text-[11px] text-slate-300">
                        {row.progress}/{row.target}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${
                          row.complete ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                        {RESOURCE_IDS.map((id) =>
                          row.reward[id] > 0 ? (
                            <span key={id} style={{ color: RESOURCE_META[id].color }}>
                              +{row.reward[id]} {RESOURCE_META[id].label}
                            </span>
                          ) : null,
                        )}
                      </span>
                      {row.complete && (
                        <span className="text-[10px] font-semibold text-emerald-300">Claimed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'achievements' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {achievements.map(({ def, unlocked }) => (
                <div
                  key={def.id}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                    unlocked
                      ? TIER_COLORS[def.tier]
                      : 'border-white/10 bg-slate-900/40 text-slate-400'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {unlocked ? <Award className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{def.title}</p>
                    <p className="text-[11px] text-slate-400">{def.detail}</p>
                    <p className="mt-1 text-[9px] tracking-wider uppercase opacity-70">
                      {def.tier}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'analytics' && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-slate-400">
                One sample per turn, kept locally for this town. Select a metric to compare recent
                turns.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <MetricRow
                  label="Prosperity"
                  values={history.map((sample) => sample.prosperity)}
                  color="#fbbf24"
                />
                <MetricRow
                  label="Population"
                  values={history.map((sample) => sample.population)}
                  color="#60a5fa"
                />
                <MetricRow
                  label="Buildings"
                  values={history.map((sample) => sample.buildings)}
                  color="#34d399"
                />
                <MetricRow
                  label="Gold"
                  values={history.map((sample) => sample.gold)}
                  color="#f472b6"
                />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Flame className="h-3.5 w-3.5 text-amber-300" />
                  {history.length > 0
                    ? `Tracking since turn ${history[0].turn}`
                    : 'No turns sampled yet'}
                </span>
                <button
                  type="button"
                  onClick={onClearHistory}
                  disabled={history.length === 0}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-40"
                >
                  Clear history
                </button>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <p className="text-xs font-semibold text-white">Autosave</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Every change is written to this browser’s save slot automatically. {savedLabel}.
                </p>
                <button
                  type="button"
                  onClick={onSaveNow}
                  className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                >
                  <Save className="h-3.5 w-3.5" /> Save now
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <p className="text-xs font-semibold text-white">Export save</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Download a JSON snapshot of this town (villagers, buildings, stores, logs).
                </p>
                <button
                  type="button"
                  onClick={onExport}
                  className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5"
                >
                  <Download className="h-3.5 w-3.5" /> Export JSON
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <p className="text-xs font-semibold text-white">Import save</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Replaces the current town in this browser slot. Only Alderbrook export files are
                  accepted.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportFile(file);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importBusy}
                  className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importBusy ? 'Reading…' : 'Choose save file'}
                </button>
                {importError && <p className="mt-2 text-[11px] text-rose-300">{importError}</p>}
              </div>

              <p className="text-[10px] text-slate-500">
                Exports include everything needed to restore this town, but never contain API keys
                or relay secrets. Cloud saves still require signing in.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          Stores: {formatResourcesShort(history[history.length - 1] ? resourcesFromSample(history[history.length - 1]) : { timber: 0, stone: 0, food: 0, gold: 0 })}
        </div>
      </div>
    </div>
  );
}

function resourcesFromSample(sample: HistorySample) {
  return { timber: sample.timber, stone: sample.stone, food: sample.food, gold: sample.gold };
}
