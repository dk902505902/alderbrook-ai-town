import { useEffect, useState } from 'react';
import {
  Award,
  Castle,
  CloudRain,
  Coins,
  Compass,
  Cpu,
  Eye,
  EyeOff,
  Gem,
  HeartHandshake,
  HeartPulse,
  Lock,
  MapPin,
  MessageCircle,
  Mountain,
  Plane,
  Radio,
  Send,
  Snowflake,
  Sun,
  Swords,
  Target,
  TrainFront,
  Trees,
  UserMinus,
  UserPlus,
  Wheat,
} from 'lucide-react';
import { formatCompactModelName, resolveInferenceConfig } from '../lib/aiRouting.ts';
import { getAgentTopBonds } from '../lib/townSystems.ts';
import {
  CORE_AGENT_IDS,
  ENEMY_RAIDER_AGENT_ID,
  getStructureDisplayLabel,
  getWeatherSeasonEffect,
  LOCATION_LABELS,
  MAX_TOWN_AGENTS,
  PLOT_META,
  type AgentId,
  type AgentRecord,
  type AIProviderConfig,
  type EnemyCityState,
  type EnemyRaidState,
  type LocationId,
  type PlotId,
  type TownEconomySummary,
  type TownMetrics,
  type TownRankInfo,
  type TownRelationship,
  type TownResourceRates,
  type TownResources,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';
import type { ChronicleTab } from './TownChronicleModal.tsx';

interface HierarchyPanelProps {
  agents: AgentRecord[];
  structures: TownStructure[];
  metrics: TownMetrics;
  economy: TownEconomySummary;
  resources: TownResources;
  resourceRates: TownResourceRates;
  townRank: TownRankInfo;
  relationships: TownRelationship[];
  weather: WeatherMode;
  providerConfig: AIProviderConfig;
  enemyCity: EnemyCityState;
  raidState: EnemyRaidState;
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
  povVillagerId?: AgentId | null;
  isHiring: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onTogglePovAgent?: (agentId: AgentId) => void;
  onChatVillager?: (agentId: AgentId) => void;
  onSendAgentNote: (agentId: AgentId, note: string) => void;
  onHireWorker: (prompt: string) => void;
  onUnhireWorker?: (agentId: AgentId) => void;
  onFocusLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
  onFocusEnemyCity?: () => void;
  onToggleEnemyRaids?: (next?: boolean) => void;
  onTriggerEnemyRaid?: () => void;
  onLaunchCounterRaid?: () => void;
  onOpenChronicle?: (tab: ChronicleTab) => void;
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
  economy,
  resources,
  resourceRates,
  townRank,
  relationships,
  weather,
  providerConfig,
  enemyCity,
  raidState,
  activeAgentId,
  selectedAgentId,
  povVillagerId = null,
  isHiring,
  onSelectAgent,
  onTogglePovAgent,
  onChatVillager,
  onSendAgentNote,
  onHireWorker,
  onUnhireWorker,
  onFocusLocation,
  onSelectPlot,
  onSelectSignalRelay,
  onFocusEnemyCity,
  onToggleEnemyRaids,
  onTriggerEnemyRaid,
  onLaunchCounterRaid,
  onOpenChronicle,
  onResetCamera,
}: HierarchyPanelProps) {
  const [activeTab, setActiveTab] = useState<'town' | 'rival'>('town');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [hirePrompt, setHirePrompt] = useState('');
  const [confirmUnhireId, setConfirmUnhireId] = useState<AgentId | null>(null);

  useEffect(() => {
    if (activeTab !== 'rival' || !raidState.enabled || raidState.active) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeTab, raidState.enabled, raidState.active]);

  const nextWaveCountdownSec =
    raidState.enabled && !raidState.active && raidState.nextWaveAtMs
      ? Math.max(0, Math.ceil((raidState.nextWaveAtMs - nowMs) / 1000))
      : null;
  const coreAgentSet = new Set<string>(CORE_AGENT_IDS);
  const enemyAiResolved = resolveInferenceConfig(providerConfig, ENEMY_RAIDER_AGENT_ID);
  const enemyModelLabel = enemyAiResolved.isInstantTactics
    ? 'Instant Zero-Token AI'
    : enemyAiResolved.isExternalCli
      ? 'External CLI AI'
      : `${formatCompactModelName(enemyAiResolved.modelName)} · ${enemyAiResolved.providerLabel}`;
  const enemyBuiltCount = enemyCity.buildings.filter((b) => b.built).length;

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
      {/* Top 2-Tab Switcher: Alderbrook Town vs Read-Only Rival Intel (Ironhold Bastion) */}
      <div className="flex shrink-0 gap-1 border-b border-white/10 bg-slate-950/75 px-3 py-2">
        <button
          type="button"
          onClick={() => setActiveTab('town')}
          className={`inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'town'
              ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/45'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <span>Our Town</span>
          <span className="font-mono-tabular text-[10px] opacity-80">
            {agents.length}/{MAX_TOWN_AGENTS}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rival')}
          className={`inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'rival'
              ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/50'
              : 'text-slate-400 hover:bg-white/5 hover:text-rose-200'
          }`}
        >
          <Swords className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span>Rival Intel</span>
          {raidState.active && (
            <span className="rounded bg-rose-600 px-1 py-0.5 text-[9px] font-bold text-white">
              LIVE
            </span>
          )}
        </button>
      </div>

      {activeTab === 'rival' ? (
        <div className="hud-scroll flex-1 space-y-3 overflow-y-auto p-3.5">
          {/* Read-Only Fortress Header */}
          <div className="rounded-xl border border-rose-500/35 bg-rose-950/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Castle className="h-4 w-4 shrink-0 text-rose-400" />
                  <h3 className="truncate font-display text-sm font-semibold text-white">
                    {enemyCity.name}
                  </h3>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-rose-200/85">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span>100% Autonomous Enemy AI · Read-Only Intel</span>
                </p>
              </div>
              {onFocusEnemyCity && (
                <button
                  type="button"
                  onClick={onFocusEnemyCity}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-rose-400/50 bg-rose-600 px-2.5 text-[11px] font-semibold text-white hover:bg-rose-500"
                >
                  <Target className="h-3.5 w-3.5 shrink-0" />
                  <span>View City</span>
                </button>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-rose-500/20 pt-2 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Cpu className="h-3 w-3 shrink-0 text-rose-300" />
                <span>Warlord AI</span>
              </span>
              <span className="truncate font-mono text-[10px] text-amber-200">
                {enemyModelLabel}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-rose-100/90">
              “{enemyCity.warlordDecision}”
            </p>

            {/* Live Raid Status & Quick Actions */}
            <div className="mt-2.5 space-y-2 border-t border-rose-500/20 pt-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-rose-200">
                  {raidState.active
                    ? `Wave #${raidState.waveNumber} Attacking!`
                    : raidState.enabled
                      ? nextWaveCountdownSec !== null
                        ? `Next Raid Wave in ${nextWaveCountdownSec}s`
                        : 'Preparing Next Raid Wave...'
                      : 'Peaceful Mode (Raids OFF)'}
                </span>
                {onToggleEnemyRaids && (
                  <button
                    type="button"
                    onClick={() => onToggleEnemyRaids(!raidState.enabled)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      raidState.enabled
                        ? 'border-rose-400/50 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
                        : 'border-white/15 bg-slate-900 text-slate-300 hover:border-rose-400/40 hover:text-rose-200'
                    }`}
                  >
                    Raids: {raidState.enabled ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {onTriggerEnemyRaid && (
                  <button
                    type="button"
                    onClick={onTriggerEnemyRaid}
                    className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-600/85 px-2 text-[11px] font-semibold text-white hover:bg-rose-500"
                  >
                    <Swords className="h-3.5 w-3.5 shrink-0" />
                    <span>{raidState.active ? 'Focus Raid' : 'Attack Now'}</span>
                  </button>
                )}
                {onLaunchCounterRaid && (
                  <button
                    type="button"
                    onClick={onLaunchCounterRaid}
                    disabled={enemyCity.counterRaidActive}
                    className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-cyan-400/45 bg-cyan-600/25 px-2 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-600/35 disabled:opacity-50"
                  >
                    <Target className="h-3.5 w-3.5 shrink-0" />
                    <span>{enemyCity.counterRaidActive ? 'Raiding...' : 'Counter-Raid'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Enemy Stockpiles & Two-Way Loot Ledger */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/85 p-2.5">
              <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                <Coins className="h-3 w-3 text-amber-300" />
                <span>Enemy Gold Vault</span>
              </div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-amber-200">
                {enemyCity.gold}g
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Looted us: <span className="text-rose-300">+{enemyCity.totalGoldLootedFromUs}g</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/85 p-2.5">
              <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                <Wheat className="h-3 w-3 text-emerald-300" />
                <span>Enemy Food Stores</span>
              </div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-emerald-200">
                {enemyCity.food}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Reclaimed: <span className="text-cyan-300">{enemyCity.totalGoldCounterLooted}g / {enemyCity.totalFoodCounterLooted}f</span>
              </div>
            </div>
          </div>

          {/* Autonomous Fortress Infrastructure & Air Force */}
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>Fortress Works ({enemyBuiltCount}/{enemyCity.buildings.length})</span>
              <span className="font-mono-tabular text-[10px] text-slate-400">
                Turn {enemyCity.autonomousTurnCount}
              </span>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1.5">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <TrainFront className="h-3.5 w-3.5 text-orange-300" />
                  <span>Ore Rail</span>
                </span>
                <span className={enemyCity.railBuilt ? 'font-semibold text-emerald-300' : 'text-slate-500'}>
                  {enemyCity.railBuilt ? 'ACTIVE' : 'Unbuilt'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1.5">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <Plane className="h-3.5 w-3.5 text-rose-300" />
                  <span>Air Fleet</span>
                </span>
                <span className="font-mono-tabular font-semibold text-orange-200">
                  {enemyCity.helicoptersReady}H · {enemyCity.jetsReady}J
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {enemyCity.buildings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-950/55 px-2 py-1 text-[11px]"
                >
                  <span className={b.built ? 'text-slate-200' : 'text-slate-500'}>
                    {b.label}
                  </span>
                  <span
                    className={`font-mono-tabular text-[10px] font-semibold ${
                      b.built ? 'text-rose-300' : 'text-slate-500'
                    }`}
                  >
                    {b.built ? `Built · L${b.level}` : 'Planned'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Read-Only 4-Rank Autonomous Enemy Command Hierarchy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>Autonomous Enemy Hierarchy</span>
              <span className="text-[10px] font-normal text-slate-400">No player orders</span>
            </div>
            {enemyCity.hierarchy.map((unit) => {
              const indent = unit.rank === 1 ? '' : unit.rank === 2 ? 'ml-3' : 'ml-6';
              const width =
                unit.rank === 1
                  ? '100%'
                  : unit.rank === 2
                    ? 'calc(100% - 0.75rem)'
                    : 'calc(100% - 1.5rem)';
              return (
                <div
                  key={unit.id}
                  style={{ width }}
                  className={`rounded-xl border border-rose-500/25 bg-slate-900/85 p-2.5 ${indent}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            unit.rank === 1
                              ? '#f43f5e'
                              : unit.rank === 2
                                ? '#f97316'
                                : '#fbbf24',
                        }}
                      />
                      <span className="truncate font-display text-xs font-semibold text-white">
                        {unit.name}
                      </span>
                    </div>
                    <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                      R{unit.rank} · {unit.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {unit.role}
                    {unit.supervisor ? ` · Reports to ${unit.supervisor}` : ''}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-200">
                    {unit.lastAction}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
      {/* Town Pulse Metrics Strip + Weather Effect Badge + Expansion Summary */}
      <div className="shrink-0 space-y-2 border-b border-white/10 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenChronicle?.('stats')}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20"
            title="View Civic Rank, Analytics & Milestones"
          >
            <Award className="h-3 w-3 shrink-0 text-amber-300" />
            <span>
              R{townRank.level} · {townRank.title}
            </span>
          </button>
          <span
            className={`inline-flex max-w-[175px] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${weatherBadgeClass}`}
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
            Town Growth: <span className="font-mono-tabular text-slate-200">{completedCount}</span> built
            {' · '}
            <span className="font-mono-tabular text-slate-200">{agents.length}/{MAX_TOWN_AGENTS}</span> villagers
          </span>
          {activeSites.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPlot(activeSites[0].plotId)}
              className="truncate font-medium text-amber-300 hover:underline"
            >
              Building {getStructureDisplayLabel(activeSites[0])} ({activeSites[0].progress}%)
            </button>
          )}
        </div>

        {/* 4-Resource Compact Stockpile Strip */}
        <div className="grid grid-cols-4 gap-1 border-t border-white/10 pt-1.5 font-mono-tabular text-[10px] text-slate-300">
          <span className="inline-flex items-center gap-1" title={`Timber (+${resourceRates.timber}/turn)`}>
            <Trees className="h-3 w-3 shrink-0 text-emerald-300" />
            <span>{resources.timber}</span>
          </span>
          <span className="inline-flex items-center gap-1" title={`Stone (+${resourceRates.stone}/turn)`}>
            <Mountain className="h-3 w-3 shrink-0 text-slate-300" />
            <span>{resources.stone}</span>
          </span>
          <span className="inline-flex items-center gap-1" title={`Harvest (+${resourceRates.harvest}/turn)`}>
            <Wheat className="h-3 w-3 shrink-0 text-amber-300" />
            <span>{resources.harvest}</span>
          </span>
          <span className="inline-flex items-center gap-1" title={`Crystal (+${resourceRates.crystal}/turn)`}>
            <Gem className="h-3 w-3 shrink-0 text-cyan-300" />
            <span>{resources.crystal}</span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <Coins className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-mono-tabular font-semibold text-amber-200">
              {economy.treasuryGold}g
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span
              className={`font-mono-tabular font-medium ${
                economy.netPerTurn >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {economy.netPerTurn >= 0 ? '+' : ''}
              {economy.netPerTurn}g/t
            </span>
          </span>
          {onOpenChronicle && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChronicle('civic')}
                className="shrink-0 font-semibold text-sky-300 hover:underline"
              >
                Council
              </button>
              <button
                type="button"
                onClick={() => onOpenChronicle('economy')}
                className="shrink-0 font-semibold text-amber-300 hover:underline"
              >
                Spend Gold
              </button>
            </div>
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
                      style={{
                        backgroundColor:
                          agent.healthStatus === 'injured' ? '#fb7185' : agent.accentColor,
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-display text-sm font-semibold text-white">
                      {agent.name}
                    </span>
                    {agent.healthStatus === 'injured' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                        <HeartPulse className="h-3 w-3" />
                        <span>Injured</span>
                      </span>
                    )}
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

                <p
                  className={`mt-2 line-clamp-2 text-xs leading-relaxed ${
                    agent.healthStatus === 'injured' ? 'text-rose-200' : 'text-slate-200'
                  }`}
                >
                  {agent.healthStatus === 'injured'
                    ? 'Injured (Needs Hospital) — walking safely to Town Hospital for care.'
                    : agent.currentTask}
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

                  {(() => {
                    const bonds = getAgentTopBonds(agent.id, relationships, agents, 3);
                    if (bonds.length === 0) return null;
                    return (
                      <div className="mt-2 border-t border-white/10 pt-2">
                        <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                          <HeartHandshake className="h-3 w-3 text-emerald-300" />
                          <span>Villager Bonds</span>
                        </div>
                        <div className="space-y-0.5 text-[11px]">
                          {bonds.map((b) => (
                            <div
                              key={b.partnerId}
                              className="flex items-center justify-between gap-2 text-slate-300"
                            >
                              <span className="truncate">{b.partnerName}</span>
                              <span className="shrink-0 font-mono-tabular text-emerald-300">
                                {b.tier} · {b.score}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 1-Tap First-Person POV & Talk 1-on-1 Buttons */}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {onChatVillager && (
                      <button
                        type="button"
                        onClick={() => onChatVillager(agent.id)}
                        className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/12 px-2.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/22"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>Talk 1-on-1</span>
                      </button>
                    )}
                    {onTogglePovAgent && (
                      <button
                        type="button"
                        onClick={() => onTogglePovAgent(agent.id)}
                        className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                          povVillagerId === agent.id
                            ? 'border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'border-amber-400/35 bg-amber-500/12 text-amber-200 hover:bg-amber-500/22'
                        }`}
                      >
                        {povVillagerId === agent.id ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Exit POV</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>First-Person</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Mayor Dismissal / Unhire Control (Hired Specialists Only — Core Council Protected) */}
                  {onUnhireWorker && !coreAgentSet.has(agent.id) && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {confirmUnhireId === agent.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmUnhireId(null);
                              onUnhireWorker(agent.id);
                            }}
                            className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-400/60 bg-rose-600 px-2.5 text-xs font-semibold text-white hover:bg-rose-500"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            <span>Confirm Unhire {shortName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnhireId(null)}
                            className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-white/15 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 hover:text-white"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmUnhireId(agent.id)}
                          className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          <span>Unhire Specialist</span>
                        </button>
                      )}
                    </div>
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
          {onFocusEnemyCity && (
            <button
              type="button"
              onClick={onFocusEnemyCity}
              className="col-span-2 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-950/35 px-3 text-xs font-semibold text-rose-200 transition-colors hover:border-rose-400/60 hover:bg-rose-900/40"
            >
              <Castle className="h-3.5 w-3.5 text-rose-300" />
              <span>View Enemy City ({enemyCity.name})</span>
            </button>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

