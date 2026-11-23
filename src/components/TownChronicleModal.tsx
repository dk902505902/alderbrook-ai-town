import { useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Camera,
  CheckCircle2,
  Coins,
  Download,
  FileJson,
  Flame,
  Gem,
  Hammer,
  Landmark,
  Mountain,
  Newspaper,
  PartyPopper,
  RefreshCw,
  ScrollText,
  Sparkles,
  TrainFront,
  Trees,
  Upload,
  Vote,
  Wheat,
  X,
  Zap,
} from 'lucide-react';
import {
  computeTradeTrainPayout,
  DECOR_PACKS,
  TOWN_POLICIES,
} from '../lib/townSystems.ts';
import type {
  CouncilProposal,
  DecorPackId,
  PlotId,
  PolicyId,
  TownEconomySummary,
  TownGazetteEdition,
  TownHistoryPoint,
  TownMilestone,
  TownRankInfo,
  TownResourceRates,
  TownResources,
} from '../types/town.ts';

export type ChronicleTab = 'gazette' | 'economy' | 'civic' | 'stats' | 'backup';

interface TownChronicleModalProps {
  isOpen: boolean;
  initialTab: ChronicleTab;
  townName: string;
  gazette: TownGazetteEdition;
  economy: TownEconomySummary;
  resources: TownResources;
  resourceRates: TownResourceRates;
  activePolicies: PolicyId[];
  decorPacks: DecorPackId[];
  councilProposals: CouncilProposal[];
  townRank: TownRankInfo;
  milestones: TownMilestone[];
  history: TownHistoryPoint[];
  railSpurBuilt: boolean;
  hasBuildingInProgress: boolean;
  hasUpgradeableBuilding: boolean;
  lastPostcardDataUrl: string | null;
  onClose: () => void;
  onCapturePostcard: () => void;
  onFocusPlot: (plotId: PlotId) => void;
  onSpendRushBuild: () => void;
  onSpendUpgradeBuilding: () => void;
  onSpendLaunchFestival: () => void;
  onSpendTradeTrain: () => void;
  onTogglePolicy: (policyId: PolicyId) => void;
  onToggleDecorPack: (packId: DecorPackId) => void;
  onEnactCouncilProposal: (proposal: CouncilProposal) => void;
  onRefreshCouncilProposals: () => void;
  onExportJson: () => void;
  onImportJson: (rawJson: string) => { ok: boolean; message: string };
}

function SparklineCard({
  title,
  currentLabel,
  deltaLabel,
  values,
  strokeColor,
}: {
  title: string;
  currentLabel: string;
  deltaLabel: string;
  values: number[];
  strokeColor: string;
}) {
  const safeValues = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const minVal = Math.min(...safeValues);
  const maxVal = Math.max(...safeValues);
  const range = Math.max(1, maxVal - minVal);
  const width = 220;
  const height = 46;
  const points = safeValues
    .map((v, i) => {
      const x = (i / (safeValues.length - 1)) * width;
      const y = height - 4 - ((v - minVal) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-400">{title}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-tabular text-sm font-bold text-white">{currentLabel}</span>
          <span className="font-mono-tabular text-[10px] text-slate-400">{deltaLabel}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-11 w-full overflow-visible"
        role="img"
        aria-label={`${title} trend chart`}
      >
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export function TownChronicleModal({
  isOpen,
  initialTab,
  townName,
  gazette,
  economy,
  resources,
  resourceRates,
  activePolicies,
  decorPacks,
  councilProposals,
  townRank,
  milestones,
  history,
  railSpurBuilt,
  hasBuildingInProgress,
  hasUpgradeableBuilding,
  lastPostcardDataUrl,
  onClose,
  onCapturePostcard,
  onFocusPlot,
  onSpendRushBuild,
  onSpendUpgradeBuilding,
  onSpendLaunchFestival,
  onSpendTradeTrain,
  onTogglePolicy,
  onToggleDecorPack,
  onEnactCouncilProposal,
  onRefreshCouncilProposals,
  onExportJson,
  onImportJson,
}: TownChronicleModalProps) {
  const [activeTab, setActiveTab] = useState<ChronicleTab>(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState<ChronicleTab>(initialTab);
  const [backupStatus, setBackupStatus] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab);
  }

  if (!isOpen) return null;

  const fileSlug =
    townName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'alderbrook';

  const tradeExport = computeTradeTrainPayout(resources, railSpurBuilt);
  const tradeTotalUnits =
    tradeExport.shipped.timber +
    tradeExport.shipped.stone +
    tradeExport.shipped.harvest +
    tradeExport.shipped.crystal;
  const unlockedMilestoneCount = milestones.filter((m) => m.unlocked).length;

  const flashAction = (msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => {
      setActionToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = onImportJson(text);
      setBackupStatus({
        tone: result.ok ? 'ok' : 'err',
        text: result.message,
      });
    } catch {
      setBackupStatus({
        tone: 'err',
        text: 'Could not read the selected JSON file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleCouncilDecide = () => {
    if (councilProposals.length === 0) return;
    const sorted = [...councilProposals].sort((a, b) => b.votes - a.votes);
    const winner = sorted.find((p) => economy.treasuryGold >= p.costGold) ?? sorted[0];
    if (economy.treasuryGold < winner.costGold) {
      flashAction(`Need ${winner.costGold}g in treasury to enact "${winner.title}".`);
      return;
    }
    onEnactCouncilProposal(winner);
    flashAction(`Council passed "${winner.title}" (${winner.votes} votes)!`);
  };

  const latestHist = history[history.length - 1];
  const firstHist = history[0];
  const goldValues = history.map((h) => h.treasuryGold);
  const pulseValues = history.map((h) => Math.round((h.prosperity + h.orderLevel + h.morale) / 3));
  const growthValues = history.map((h) => h.buildings * 10 + h.population);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${townName} Town Chronicle`}
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-base font-semibold text-white">
                {townName} Chronicle
              </h2>
              <span className="shrink-0 rounded-md border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                Rank {townRank.level}: {townRank.title}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gazette, Treasury & Resources, Council Laws & Decor, Analytics & Backups
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Town Chronicle"
            className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 5-Tab Navigation Strip */}
        <div className="grid shrink-0 grid-cols-5 border-b border-white/10 bg-slate-900/60">
          {(
            [
              { id: 'gazette', label: 'Gazette', Icon: Newspaper },
              { id: 'economy', label: 'Economy', Icon: Coins },
              { id: 'civic', label: 'Civic', Icon: Landmark },
              { id: 'stats', label: 'Stats', Icon: BarChart3 },
              { id: 'backup', label: 'Backup', Icon: FileJson },
            ] as const
          ).map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[44px] items-center justify-center gap-1 border-b-2 px-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors sm:text-xs ${
                  selected
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {actionToast && (
          <div className="shrink-0 border-b border-emerald-400/30 bg-emerald-500/12 px-4 py-2 text-xs font-medium text-emerald-200">
            {actionToast}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="hud-scroll flex-1 overflow-y-auto p-4">
          {activeTab === 'gazette' && (
            <div className="space-y-4">
              {/* Gazette Masthead */}
              <div className="border-b border-amber-400/30 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-amber-300">
                  <span>The {gazette.townName} Gazette</span>
                  <span>
                    Edition #{gazette.editionNumber} · {gazette.weatherSummary}
                  </span>
                </div>
                <h3 className="mt-1.5 font-display text-lg leading-snug font-bold text-white">
                  {gazette.headline}
                </h3>
                <p className="mt-1 text-xs text-slate-300">{gazette.subheadline}</p>
              </div>

              {/* 1-Tap 3D Photo Postcard Studio */}
              <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white">3D Photo Postcard</div>
                    <div className="text-[11px] text-slate-400">
                      Capture the live 3D camera view with a framed town caption
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onCapturePostcard}
                      className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 transition-colors hover:bg-amber-400"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Snap Postcard</span>
                    </button>
                    {lastPostcardDataUrl && (
                      <a
                        href={lastPostcardDataUrl}
                        download={`${fileSlug}-postcard.png`}
                        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold whitespace-nowrap text-amber-200 transition-colors hover:bg-amber-500/25"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Save PNG</span>
                      </a>
                    )}
                  </div>
                </div>

                {lastPostcardDataUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                    <img
                      src={lastPostcardDataUrl}
                      alt={`3D Postcard of ${townName}`}
                      className="h-auto w-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Compiled Stories */}
              <div className="divide-y divide-white/10">
                {gazette.stories.map((story, idx) => (
                  <article key={`${story.title}-${idx}`} className="py-3 first:pt-1 last:pb-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Sparkles className="h-3 w-3 shrink-0 text-amber-300" />
                      <span>{story.meta}</span>
                    </div>
                    <h4 className="mt-1 font-display text-sm font-semibold text-white">
                      {story.title}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{story.body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'economy' && (
            <div className="space-y-4">
              {/* Top Treasury Readout */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3.5">
                <div>
                  <div className="text-[11px] font-medium text-amber-200/80">Town Treasury</div>
                  <div className="mt-0.5 font-mono-tabular text-2xl font-bold text-amber-300">
                    {economy.treasuryGold}g
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-medium text-slate-300">Net Per Turn</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-xl font-bold ${
                      economy.netPerTurn >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {economy.netPerTurn >= 0 ? '+' : ''}
                    {economy.netPerTurn}g
                  </div>
                </div>
              </div>

              {/* 4-Resource Supply Chain Stockpile */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Town Resource Stockpile</span>
                  <span className="text-[11px] text-slate-400">Exportable via Express Train</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      {
                        label: 'Timber',
                        val: resources.timber,
                        rate: resourceRates.timber,
                        Icon: Trees,
                        color: 'text-emerald-300',
                      },
                      {
                        label: 'Stone',
                        val: resources.stone,
                        rate: resourceRates.stone,
                        Icon: Mountain,
                        color: 'text-slate-300',
                      },
                      {
                        label: 'Harvest',
                        val: resources.harvest,
                        rate: resourceRates.harvest,
                        Icon: Wheat,
                        color: 'text-amber-300',
                      },
                      {
                        label: 'Crystal',
                        val: resources.crystal,
                        rate: resourceRates.crystal,
                        Icon: Gem,
                        color: 'text-cyan-300',
                      },
                    ] as const
                  ).map(({ label, val, rate, Icon, color }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-slate-900/70 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                        <span>{label}</span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between">
                        <span className="font-mono-tabular text-base font-bold text-white">
                          {val}
                        </span>
                        <span className="font-mono-tabular text-[10px] font-semibold text-emerald-300">
                          +{rate}/t
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spendable Treasury Instant Civic Actions */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Spend Treasury · Instant Actions</span>
                  <span className="text-[11px] text-slate-400">Live 3D town impact</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={!hasBuildingInProgress || economy.treasuryGold < 60}
                    onClick={() => {
                      onSpendRushBuild();
                      flashAction('Rushed active construction to 100% completion!');
                    }}
                    className="flex min-h-[54px] items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-amber-500/12 px-3 py-2 text-left transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                        <span>Rush Construction</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {hasBuildingInProgress ? 'Finish active site now' : 'No site building'}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono-tabular text-xs font-bold text-amber-300">
                      -60g
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasUpgradeableBuilding || economy.treasuryGold < 120}
                    onClick={() => {
                      onSpendUpgradeBuilding();
                      flashAction('Upgraded a town building to the next architectural tier!');
                    }}
                    className="flex min-h-[54px] items-center justify-between gap-2 rounded-xl border border-sky-400/35 bg-sky-500/12 px-3 py-2 text-left transition-colors hover:bg-sky-500/20 disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
                        <Hammer className="h-3.5 w-3.5 shrink-0" />
                        <span>Upgrade Landmark</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {hasUpgradeableBuilding ? 'Boost lowest completed tier' : 'Need built site'}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono-tabular text-xs font-bold text-sky-300">
                      -120g
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={economy.treasuryGold < 45}
                    onClick={() => {
                      onSpendLaunchFestival();
                      flashAction('Sky lanterns & fireworks launched over Town Square (+10 Morale)!');
                    }}
                    className="flex min-h-[54px] items-center justify-between gap-2 rounded-xl border border-rose-400/35 bg-rose-500/12 px-3 py-2 text-left transition-colors hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
                        <PartyPopper className="h-3.5 w-3.5 shrink-0" />
                        <span>Launch 3D Festival</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Sky lanterns, fireworks & +10 Morale
                      </div>
                    </div>
                    <span className="shrink-0 font-mono-tabular text-xs font-bold text-rose-300">
                      -45g
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={economy.treasuryGold < 35 || tradeTotalUnits === 0}
                    onClick={() => {
                      onSpendTradeTrain();
                      flashAction(
                        `Express Trade Train dispatched! Exported ${tradeTotalUnits} crates for +${tradeExport.goldEarned}g.`,
                      );
                    }}
                    className="flex min-h-[54px] items-center justify-between gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/12 px-3 py-2 text-left transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                        <TrainFront className="h-3.5 w-3.5 shrink-0" />
                        <span>Express Trade Train</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Export {tradeTotalUnits} crates → +{tradeExport.goldEarned}g
                      </div>
                    </div>
                    <span className="shrink-0 font-mono-tabular text-xs font-bold text-emerald-300">
                      -35g
                    </span>
                  </button>
                </div>
              </div>

              {/* Ledger Breakdown */}
              <div className="space-y-1.5 border-y border-white/10 py-3 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Civic Tax, Policies & Decor Tourism</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    +{economy.civicBaseTax}g
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Steam Railway Trade</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    +{economy.railwayBonus}g
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Completed Buildings Output</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    +{economy.buildingRevenue}g
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Civic Upkeep & Wages</span>
                  <span className="font-mono-tabular font-semibold text-rose-300">
                    -{economy.workerUpkeep}g
                  </span>
                </div>
              </div>

              {/* Per-Building Output Ranking */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Building Production</span>
                  <span className="text-[11px] text-slate-400">
                    Tap any building to focus in 3D
                  </span>
                </div>
                {economy.topBuildings.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-400">
                    No completed buildings yet. Ask Mayor Sterling or Architect Lyra to construct a
                    Bakery, Windmill, Greenhouse, or Research Lab to grow town gold!
                  </p>
                ) : (
                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-900/50">
                    {economy.topBuildings.map((row) => (
                      <button
                        key={row.plotId}
                        type="button"
                        onClick={() => {
                          onFocusPlot(row.plotId);
                          onClose();
                        }}
                        className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">
                            {row.label}
                          </div>
                          <div className="truncate text-[11px] text-slate-400">
                            {row.district} · {row.note}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono-tabular text-xs font-bold text-amber-300">
                          +{row.goldPerTurn}g
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'civic' && (
            <div className="space-y-5">
              {/* 1. Town Council Proposals & Voting Board */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                      <Vote className="h-4 w-4 text-amber-300" />
                      <span>Town Council Ballot</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Vote to enact a proposal live in 3D, or let villagers decide by majority
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCouncilDecide}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                    >
                      <Flame className="h-3 w-3" />
                      <span>Let Council Decide</span>
                    </button>
                    <button
                      type="button"
                      onClick={onRefreshCouncilProposals}
                      title="Refresh Council Proposals"
                      aria-label="Refresh Council Proposals"
                      className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {councilProposals.map((prop) => {
                    const affordable = economy.treasuryGold >= prop.costGold;
                    return (
                      <div
                        key={prop.id}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-white">{prop.title}</span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono-tabular text-[10px] text-amber-200">
                              {prop.votes} villager votes
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-300">{prop.summary}</p>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Proposed by {prop.proposerName} · Backed by {prop.supporters.join(', ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!affordable}
                          onClick={() => {
                            onEnactCouncilProposal(prop);
                            flashAction(`Enacted "${prop.title}"!`);
                          }}
                          className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold whitespace-nowrap text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-40"
                        >
                          <span>Enact</span>
                          <span className="font-mono-tabular">
                            {prop.costGold > 0 ? `(-${prop.costGold}g)` : '(Free)'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 2. Town Laws & Civic Policies Switchboard */}
              <section className="space-y-2 border-t border-white/10 pt-4">
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <ScrollText className="h-4 w-4 text-sky-300" />
                    <span>Town Laws & Civic Policies</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Toggle civic laws anytime to reshape gold revenue, build speed, and town morale
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TOWN_POLICIES.map((meta) => {
                    const active = activePolicies.includes(meta.id);
                    return (
                      <button
                        key={meta.id}
                        type="button"
                        onClick={() => onTogglePolicy(meta.id)}
                        aria-pressed={active}
                        className={`flex min-h-[72px] flex-col justify-between rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-sky-400/60 bg-sky-500/15'
                            : 'border-white/10 bg-slate-900/70 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{meta.label}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              active
                                ? 'bg-sky-400 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {active ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-0.5 text-[10px]">
                          <div className="font-medium text-emerald-300">{meta.benefit}</div>
                          <div className="text-rose-300">{meta.tradeoff}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 3. Custom 3D Street Props & Decor Placer */}
              <section className="space-y-2 border-t border-white/10 pt-4">
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <Sparkles className="h-4 w-4 text-emerald-300" />
                    <span>3D Street Props & Plaza Decor</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Place instanced 3D street decorations around Town Square for lasting tourism gold & morale
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DECOR_PACKS.map((meta) => {
                    const installed = decorPacks.includes(meta.id);
                    const canBuy = installed || economy.treasuryGold >= meta.costGold;
                    return (
                      <button
                        key={meta.id}
                        type="button"
                        disabled={!canBuy}
                        onClick={() => {
                          onToggleDecorPack(meta.id);
                          flashAction(
                            installed
                              ? `Packed away ${meta.label} from Town Square.`
                              : `Installed ${meta.label} in 3D (+${meta.moraleBonus} Morale)!`,
                          );
                        }}
                        className={`flex min-h-[68px] flex-col justify-between rounded-xl border p-3 text-left transition-colors disabled:opacity-40 ${
                          installed
                            ? 'border-emerald-400/60 bg-emerald-500/15'
                            : 'border-white/10 bg-slate-900/70 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{meta.label}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold ${
                              installed
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-amber-500/20 text-amber-200'
                            }`}
                          >
                            {installed ? 'PLACED' : `${meta.costGold}g`}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-300">{meta.summary}</p>
                        <div className="mt-1 text-[10px] font-medium text-emerald-300">
                          +{meta.moraleBonus} Morale · +3g/turn tourism
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-4">
              {/* Town Civic Rank Progression */}
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-amber-200/80">
                      Civic Rank {townRank.level} of 5
                    </div>
                    <div className="font-display text-lg font-bold text-white">
                      {townRank.title}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-tabular text-lg font-bold text-amber-300">
                      {townRank.progressPct}%
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {townRank.nextTitle ? `Next: ${townRank.nextTitle}` : 'Max Rank Achieved'}
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">{townRank.nextRequirement}</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${townRank.progressPct}%` }}
                  />
                </div>
              </div>

              {/* Town Growth Sparkline Analytics */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Town Growth Analytics</span>
                  <span className="text-[11px] text-slate-400">
                    Last {history.length} turns tracked
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <SparklineCard
                    title="Treasury Gold"
                    currentLabel={`${latestHist?.treasuryGold ?? economy.treasuryGold}g`}
                    deltaLabel={
                      firstHist && latestHist
                        ? `${latestHist.treasuryGold - firstHist.treasuryGold >= 0 ? '+' : ''}${
                            latestHist.treasuryGold - firstHist.treasuryGold
                          }g`
                        : '+0g'
                    }
                    values={goldValues}
                    strokeColor="#fbbf24"
                  />
                  <SparklineCard
                    title="Avg Town Pulse"
                    currentLabel={`${pulseValues[pulseValues.length - 1] ?? 70}`}
                    deltaLabel="/100"
                    values={pulseValues}
                    strokeColor="#34d399"
                  />
                  <SparklineCard
                    title="Civic Expansion"
                    currentLabel={`${latestHist?.buildings ?? 0} bldg`}
                    deltaLabel={`${latestHist?.population ?? 5} pop`}
                    values={growthValues}
                    strokeColor="#38bdf8"
                  />
                </div>
              </div>

              {/* 8 Town Milestones & Achievement Badges */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    <Award className="h-4 w-4 text-amber-300" />
                    <span>Town Milestones & Badges</span>
                  </span>
                  <span className="font-mono-tabular text-[11px] text-amber-300">
                    {unlockedMilestoneCount}/{milestones.length} unlocked
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-start justify-between gap-2 rounded-xl border p-2.5 ${
                        m.unlocked
                          ? 'border-emerald-400/40 bg-emerald-500/10'
                          : 'border-white/10 bg-slate-900/60 opacity-75'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`h-3.5 w-3.5 shrink-0 ${
                              m.unlocked ? 'text-emerald-300' : 'text-slate-600'
                            }`}
                          />
                          <span className="truncate text-xs font-semibold text-white">
                            {m.title}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">{m.description}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold ${
                          m.unlocked
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-slate-800 text-amber-300'
                        }`}
                      >
                        +{m.rewardGold}g
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">Export Town Save (.json)</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Download a portable JSON snapshot of <span className="text-slate-200">{townName}</span>{' '}
                  including all buildings, custom labels, roads, outer biomes, villagers,
                  relationships, treasury, resources, policies, street decor, milestones, and
                  recent Town Log history.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onExportJson();
                    setBackupStatus({
                      tone: 'ok',
                      text: `Exported ${fileSlug}-backup.json to your device.`,
                    });
                  }}
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
                >
                  <Download className="h-4 w-4" />
                  <span>Download {townName} Backup (.json)</span>
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">Import Town Save (.json)</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Load any exported town file into a new saved town slot. Your existing{' '}
                  <span className="text-slate-200">Alderbrook (Main)</span> and other saved towns
                  stay untouched.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/25"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose .json Backup File</span>
                </button>
              </div>

              {backupStatus && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                    backupStatus.tone === 'ok'
                      ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200'
                      : 'border-rose-400/40 bg-rose-500/12 text-rose-200'
                  }`}
                >
                  {backupStatus.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
