import { useState } from 'react';
import { CloudRain, Compass, Cpu, MapPin, Radio, Send, Snowflake, Sun, UserPlus } from 'lucide-react';
import { formatCompactModelName, resolveInferenceConfig } from '../lib/aiRouting.ts';
import {
  getWeatherSeasonEffect,
  LOCATION_LABELS,
  MAX_TOWN_AGENTS,
  PLOT_META,
  STRUCTURE_META,
  type AgentId,
  type AgentRecord,
  type AIProviderConfig,
  type LocationId,
  type PlotId,
  type TownMetrics,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';

interface HierarchyPanelProps {
  agents: AgentRecord[];
  structures: TownStructure[];
  metrics: TownMetrics;
  weather: WeatherMode;
  providerConfig: AIProviderConfig;
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
  isHiring: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onSendAgentNote: (agentId: AgentId, note: string) => void;
  onHireWorker: (prompt: string) => void;
  onFocusLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
  onResetCamera: () => void;
}

const RANK_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Rank 1 Leader',
  2: 'Rank 2 Manager',
  3: 'Rank 3 Worker',
};

const LANDMARK_BUTTONS: Array<{ id: LocationId; label: string }> = [
  { id: 'town_hall', label: 'Town Hall' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'market', label: 'Market' },
  { id: 'park', label: 'Park' },
];

const HIRE_SUGGESTIONS = [
  'Skilled farmer for the greenhouse',
  'Night watchman',
  '2 stone masons',
];

export function HierarchyPanel({
  agents,
  structures,
  metrics,
  weather,
  providerConfig,
  activeAgentId,
  selectedAgentId,
  isHiring,
  onSelectAgent,
  onSendAgentNote,
  onHireWorker,
  onFocusLocation,
  onSelectPlot,
  onSelectSignalRelay,
  onResetCamera,
}: HierarchyPanelProps) {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [hirePrompt, setHirePrompt] = useState('');

  const metricRows = [
    { label: 'Prosperity', value: metrics.prosperity, barClass: 'bg-amber-400' },
    { label: 'Order', value: metrics.orderLevel, barClass: 'bg-sky-400' },
    { label: 'Morale', value: metrics.morale, barClass: 'bg-emerald-400' },
  ];

  const completedCount = structures.filter((s) => s.status === 'complete').length;
  const activeSites = structures.filter((s) => s.status === 'building');
  const weatherEffect = getWeatherSeasonEffect(weather, structures);
  const WeatherIcon = weather === 'rain' ? CloudRain : weather === 'winter' ? Snowflake : Sun;
  const weatherBadgeClass =
    weatherEffect.tone === 'sky'
      ? 'border-sky-400/35 bg-sky-500/12 text-sky-200'
      : weatherEffect.tone === 'indigo'
        ? 'border-indigo-400/35 bg-indigo-500/12 text-indigo-200'
        : 'border-amber-400/35 bg-amber-500/12 text-amber-200';

  const atCapacity = agents.length >= MAX_TOWN_AGENTS;

  const handleHireSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = hirePrompt.trim();
    if (!cleaned || isHiring || atCapacity) return;
    onHireWorker(cleaned);
    setHirePrompt('');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Town Pulse Metrics Strip + Weather Effect Badge + Expansion Summary */}
      <div className="shrink-0 space-y-2 border-b border-white/10 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-400">Town Pulse</span>
          <span
            className={`inline-flex max-w-[205px] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${weatherBadgeClass}`}
            title={weatherEffect.shiftDetail}
          >
            <WeatherIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{weatherEffect.badgeText}</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {metricRows.map((m) => (
            <div key={m.label}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-400">{m.label}</span>
                <span className="font-mono-tabular font-semibold text-slate-200">{m.value}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${m.barClass}`}
                  style={{ width: `${m.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Town Growth: <span className="font-mono-tabular text-slate-200">{completedCount}/8</span> built
            {' · '}
            <span className="font-mono-tabular text-slate-200">{agents.length}/{MAX_TOWN_AGENTS}</span> villagers
          </span>
          {activeSites.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPlot(activeSites[0].plotId)}
              className="truncate font-medium text-amber-300 hover:underline"
            >
              Building {STRUCTURE_META[activeSites[0].structureType].label} ({activeSites[0].progress}%)
            </button>
          )}
        </div>
      </div>

      {/* Natural Language AI Worker Hiring Box */}
      <div className="shrink-0 space-y-2 border-b border-white/10 bg-slate-900/50 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="hire-worker-input" className="text-xs font-semibold text-slate-200">
            Hire AI Worker
          </label>
          <span className="font-mono-tabular text-[11px] text-slate-400">
            {atCapacity ? 'Town full (15/15)' : `${MAX_TOWN_AGENTS - agents.length} slots open`}
          </span>
        </div>

        <form onSubmit={handleHireSubmit} className="flex gap-1.5">
          <input
            id="hire-worker-input"
            type="text"
            maxLength={200}
            disabled={isHiring || atCapacity}
            value={hirePrompt}
            onChange={(e) => setHirePrompt(e.target.value)}
            placeholder={
              atCapacity
                ? '15 villager mobile limit reached'
                : 'e.g. Hire a greenhouse farmer...'
            }
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!hirePrompt.trim() || isHiring || atCapacity}
            aria-label="Hire AI Worker"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            <UserPlus className="h-4 w-4" />
            <span>{isHiring ? 'Hiring...' : 'Hire'}</span>
          </button>
        </form>

        {!atCapacity && (
          <div className="flex flex-wrap gap-1">
            {HIRE_SUGGESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={isHiring}
                onClick={() => onHireWorker(`Hire ${sample}`)}
                className="min-h-[28px] rounded-md border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-amber-400/50 hover:text-amber-200 disabled:opacity-40"
              >
                + {sample}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hierarchical Agents Stack */}
      <div className="hud-scroll flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgentId;
          const isTurn = agent.id === activeAgentId;
          const indentClass =
            agent.rank === 1 ? '' : agent.rank === 2 ? 'ml-3' : 'ml-6';
          const draft = noteDrafts[agent.id] ?? '';
          const placeLabel = agent.activePlotId
            ? `${PLOT_META[agent.activePlotId].shortLabel} Plot`
            : LOCATION_LABELS[agent.location];
          const shortName = agent.name.split(' ').slice(-1)[0] || agent.name;
          const resolvedModel = resolveInferenceConfig(providerConfig, agent.id);
          const compactModel = formatCompactModelName(resolvedModel.modelName);

          return (
            <div
              key={agent.id}
              className={`rounded-xl border transition-colors ${indentClass} ${
                isSelected
                  ? 'border-amber-400/70 bg-slate-800/95'
                  : isTurn
                    ? 'border-white/25 bg-slate-900/95'
                    : 'border-white/10 bg-slate-900/75 hover:border-white/20 hover:bg-slate-800/80'
              }`}
              style={{
                width:
                  agent.rank === 1
                    ? '100%'
                    : agent.rank === 2
                      ? 'calc(100% - 0.75rem)'
                      : 'calc(100% - 1.5rem)',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className="min-h-[44px] w-full p-3 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: agent.accentColor }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-display text-sm font-semibold text-white">
                      {agent.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-400">
                    {placeLabel}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                  <span>{agent.isHired ? 'Hired Specialist' : RANK_LABEL[agent.rank]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{agent.role}</span>
                  {agent.supervisor && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Reports to {agent.supervisor.split(' ').slice(-1)[0]}</span>
                    </>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-200">
                  {agent.currentTask}
                </p>

                {resolvedModel.isOverride && !isSelected && (
                  <div
                    className={`mt-1.5 inline-flex max-w-full items-center gap-1 font-mono text-[10px] ${
                      resolvedModel.isExternalCli ? 'text-cyan-300' : 'text-amber-300/90'
                    }`}
                    title={
                      resolvedModel.isExternalCli
                        ? 'Controlled by external CLI agent (0 API tokens)'
                        : `Custom AI override: ${resolvedModel.providerLabel} · ${resolvedModel.modelName}`
                    }
                  >
                    {resolvedModel.isExternalCli ? (
                      <Radio className="h-3 w-3 shrink-0" />
                    ) : (
                      <Cpu className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {resolvedModel.isExternalCli ? 'External CLI · 0 tokens' : compactModel}
                    </span>
                  </div>
                )}
              </button>

              {isSelected && (
                <div className="border-t border-white/10 px-3 pt-2.5 pb-3 text-xs leading-relaxed text-slate-300">
                  <div
                    className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"
                    title={
                      resolvedModel.isExternalCli
                        ? 'External CLI Agent mode — skips in-app LLM API calls (0 tokens)'
                        : `${resolvedModel.providerLabel}${
                            resolvedModel.keyCount > 1 ? ` (${resolvedModel.keyCount} keys)` : ''
                          } · ${resolvedModel.modelName}${
                            resolvedModel.isOverride ? ' (Per-character override)' : ' (Global default)'
                          }`
                    }
                  >
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      {resolvedModel.isExternalCli ? (
                        <Radio className="h-3 w-3 shrink-0 text-cyan-300" />
                      ) : (
                        <Cpu className="h-3 w-3 shrink-0 text-slate-400" />
                      )}
                      <span>Model</span>
                    </span>
                    <span
                      className={`truncate font-mono text-[11px] ${
                        resolvedModel.isExternalCli
                          ? 'text-cyan-300'
                          : resolvedModel.isOverride
                            ? 'text-amber-300'
                            : 'text-slate-300'
                      }`}
                    >
                      {resolvedModel.isExternalCli
                        ? 'External CLI · 0 tokens'
                        : `${compactModel}${
                            resolvedModel.isOverride ? ` · ${resolvedModel.providerLabel}` : ' · Default'
                          }`}
                    </span>
                  </div>
                  {agent.personality && (
                    <p className="mb-1 text-slate-400">
                      Trait: <span className="text-emerald-300">{agent.personality}</span>
                    </p>
                  )}
                  {agent.assignedPlotId && (
                    <p className="mb-1 text-slate-400">
                      Post: <span className="text-slate-200">{PLOT_META[agent.assignedPlotId].label}</span>
                    </p>
                  )}
                  <p className="text-slate-400">
                    Thought: <span className="text-slate-200">{agent.thought}</span>
                  </p>
                  {agent.dialogue && (
                    <p className="mt-1 text-amber-200">“{agent.dialogue}”</p>
                  )}
                  {agent.userNote && (
                    <p className="mt-1 text-sky-300">
                      Queued Whisper: “{agent.userNote}”
                    </p>
                  )}

                  {/* Direct Agent Whisper Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const cleaned = draft.trim();
                      if (!cleaned) return;
                      onSendAgentNote(agent.id, cleaned);
                      setNoteDrafts((prev) => ({ ...prev, [agent.id]: '' }));
                    }}
                    className="mt-2.5 flex gap-1.5"
                  >
                    <input
                      type="text"
                      maxLength={180}
                      value={draft}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [agent.id]: e.target.value }))
                      }
                      placeholder={`Whisper to ${shortName}...`}
                      className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-2.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label={`Send whisper to ${agent.name}`}
                      className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white transition-colors hover:bg-amber-500 hover:text-slate-950 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Landmark Camera Bar */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <MapPin className="h-3.5 w-3.5" />
            <span>Jump to Landmark</span>
          </span>
          <button
            type="button"
            onClick={onResetCamera}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {LANDMARK_BUTTONS.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => onFocusLocation(loc.id)}
              className="min-h-[44px] rounded-xl border border-white/10 bg-slate-900/80 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-slate-800 hover:text-white"
            >
              {loc.label}
            </button>
          ))}
          {onSelectSignalRelay && (
            <button
              type="button"
              onClick={onSelectSignalRelay}
              className="col-span-2 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-950/35 px-3 text-xs font-semibold text-cyan-200 transition-colors hover:border-cyan-400/60 hover:bg-cyan-900/40"
            >
              <Radio className="h-3.5 w-3.5 text-cyan-300" />
              <span>The Signal Relay (CLI Agent Hub)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

