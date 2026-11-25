import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Check,
  Coins,
  Compass,
  Copy,
  Download,
  Flame,
  Footprints,
  Landmark,
  Layers,
  Package,
  Scale,
  Share2,
  TrainFront,
  Video,
  X,
} from 'lucide-react';
import {
  encodeBlueprintShareCode,
} from '../lib/townSystems.ts';
import {
  DEFAULT_TRAIN_BLUEPRINT,
  generateFallbackTrainBlueprint,
  type BiomeId,
  type CameraMode,
  type CouncilDebateOption,
  type CouncilDebateProposal,
  type EmergencyEventOption,
  type EmergencyEventState,
  type HeatmapMode,
  type TimeOfDay,
  type TownEconomySummary,
  type TownNeedsSummary,
  type TownResources,
  type TownStructure,
  type TownTheme,
  type TrainBlueprint,
  type TrainStyle,
  type WeatherMode,
} from '../types/town.ts';

export type StudioTab = 'economy' | 'rail' | 'council' | 'share' | 'explore';

interface TownControlDrawerProps {
  open: boolean;
  initialTab?: StudioTab;
  onClose: () => void;
  townName: string;
  townTheme: TownTheme;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  unlockedBiomes: BiomeId[];
  structures: TownStructure[];
  resources: TownResources;
  economy: TownEconomySummary;
  townNeeds: TownNeedsSummary;
  taxRate: number;
  onChangeTaxRate: (nextRate: number) => void;
  heatmapMode: HeatmapMode;
  onChangeHeatmapMode: (mode: HeatmapMode) => void;
  trainBlueprints: TrainBlueprint[];
  activeTrainCameraIdx: number;
  onSelectTrainCameraIdx: (idx: number) => void;
  onApplyTrainBlueprint: (bp: TrainBlueprint, mode: 'add' | 'swap') => void;
  onRideTrain: (idx: number) => void;
  savedTowns: Array<{ id: string; name: string }>;
  activeTownId: string;
  onDispatchCargo: (targetTownId: string, resource: keyof TownResources) => string;
  activeDebate: CouncilDebateProposal | null;
  onConveneDebate: () => void;
  onVoteDebate: (option: CouncilDebateOption) => void;
  activeEmergency: EmergencyEventState | null;
  onTriggerEmergency: () => void;
  onResolveEmergency: (option: EmergencyEventOption) => void;
  onImportShareCode: (rawCode: string) => { ok: boolean; message: string };
  cameraMode: CameraMode;
  onChangeCameraMode: (mode: CameraMode) => void;
}

const HEATMAP_BUTTONS: Array<{ id: HeatmapMode; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'housing', label: 'Housing' },
  { id: 'food', label: 'Food' },
  { id: 'safety', label: 'Safety' },
  { id: 'recreation', label: 'Rec' },
];

const TRAIN_STYLES: Array<{ value: TrainStyle; label: string }> = [
  { value: 'steam', label: 'Steam' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'freight', label: 'Freight' },
  { value: 'neon', label: 'Neon' },
];

const RESOURCE_OPTIONS: Array<{ key: keyof TownResources; label: string; unitGold: number }> = [
  { key: 'timber', label: 'Timber', unitGold: 9 },
  { key: 'stone', label: 'Stone', unitGold: 11 },
  { key: 'harvest', label: 'Harvest', unitGold: 10 },
  { key: 'crystal', label: 'Crystal', unitGold: 18 },
];

export function TownControlDrawer({
  open,
  initialTab = 'economy',
  onClose,
  townName,
  townTheme,
  weather,
  timeOfDay,
  unlockedBiomes,
  structures,
  resources,
  economy,
  townNeeds,
  taxRate,
  onChangeTaxRate,
  heatmapMode,
  onChangeHeatmapMode,
  trainBlueprints,
  activeTrainCameraIdx,
  onSelectTrainCameraIdx,
  onApplyTrainBlueprint,
  onRideTrain,
  savedTowns,
  activeTownId,
  onDispatchCargo,
  activeDebate,
  onConveneDebate,
  onVoteDebate,
  activeEmergency,
  onTriggerEmergency,
  onResolveEmergency,
  onImportShareCode,
  cameraMode,
  onChangeCameraMode,
}: TownControlDrawerProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [trainDraft, setTrainDraft] = useState<TrainBlueprint>(() =>
    generateFallbackTrainBlueprint('Aurora Neon Bullet'),
  );
  const [cargoTargetId, setCargoTargetId] = useState<string>('');
  const [cargoResource, setCargoResource] = useState<keyof TownResources>('timber');
  const [cargoStatus, setCargoStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const effectiveTrains = useMemo(
    () => (trainBlueprints.length > 0 ? trainBlueprints : [DEFAULT_TRAIN_BLUEPRINT]),
    [trainBlueprints],
  );

  const otherTowns = useMemo(
    () => savedTowns.filter((t) => t.id !== activeTownId),
    [savedTowns, activeTownId],
  );

  const proceduralBuildings = useMemo(
    () => structures.filter((s) => Boolean(s.blueprint)),
    [structures],
  );

  const townShareCode = useMemo(() => {
    if (!open || tab !== 'share') return '';
    return encodeBlueprintShareCode({
      kind: 'town',
      townName,
      theme: townTheme,
      weather,
      timeOfDay,
      unlockedBiomes,
      blueprints: proceduralBuildings
        .map((s) => s.blueprint!)
        .slice(0, 8),
      trains: effectiveTrains.slice(0, 3),
    });
  }, [
    open,
    tab,
    townName,
    townTheme,
    weather,
    timeOfDay,
    unlockedBiomes,
    proceduralBuildings,
    effectiveTrains,
  ]);

  if (!open) return null;

  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      setImportFeedback({ ok: false, message: 'Clipboard blocked — select and copy manually.' });
    }
  };

  const selectedCargoTarget = cargoTargetId || otherTowns[0]?.id || 'regional_depot';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/70 sm:items-stretch"
      onClick={onClose}
    >
      <aside
        className="flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/15 bg-slate-950 shadow-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-[11px] font-medium text-amber-300">{townName}</div>
            <h2 className="font-display text-base font-semibold text-white">Town Studio</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Town Studio"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 5 Clean Tabs */}
        <div className="grid grid-cols-5 gap-1 border-b border-white/10 bg-slate-900/70 p-1.5 text-[11px]">
          {(
            [
              { id: 'economy', label: 'Economy', Icon: Coins },
              { id: 'rail', label: 'Rail', Icon: TrainFront },
              { id: 'council', label: 'Council', Icon: Scale },
              { id: 'share', label: 'Share', Icon: Share2 },
              { id: 'explore', label: 'Explore', Icon: Compass },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex min-h-[40px] flex-col items-center justify-center gap-0.5 rounded-lg font-medium transition-colors ${
                tab === id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5 text-xs">
          {/* TAB 1: ECONOMY, TAX SLIDER & CITIZEN NEEDS HEATMAP */}
          {tab === 'economy' && (
            <>
              <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Tax & Budget Policy</span>
                  <span className="font-mono-tabular text-sm font-semibold text-amber-300">
                    {taxRate}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={taxRate}
                  onChange={(e) => onChangeTaxRate(Number(e.target.value))}
                  className="mt-2 w-full accent-amber-400"
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>0% Low Tax (+Morale)</span>
                  <span
                    className={
                      economy.taxMoraleEffect >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    Morale {economy.taxMoraleEffect >= 0 ? `+${economy.taxMoraleEffect}` : economy.taxMoraleEffect}/turn
                  </span>
                  <span>20% High Tax</span>
                </div>
              </div>

              {/* Rent, Tickets & Net Ledger */}
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-white">Live Treasury Ledger</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    {economy.netPerTurn >= 0 ? `+${economy.netPerTurn}` : economy.netPerTurn}g/turn
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-300">
                    <span>Civic Tax ({taxRate}%)</span>
                    <span className="font-mono-tabular text-white">+{economy.civicBaseTax}g</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Apartment Crowd Rent</span>
                    <span className="font-mono-tabular text-emerald-300">
                      +{economy.apartmentRent}g
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Train Ticket Revenue</span>
                    <span className="font-mono-tabular text-cyan-300">
                      +{economy.trainTicketRevenue}g
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Building & Rail Trade</span>
                    <span className="font-mono-tabular text-white">
                      +{economy.buildingRevenue + economy.railwayBonus}g
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5 text-slate-400">
                    <span>Named Staff Upkeep</span>
                    <span className="font-mono-tabular text-rose-300">
                      -{economy.workerUpkeep}g
                    </span>
                  </div>
                </div>
              </div>

              {/* Citizen Needs & 3D Heatmap Overlay */}
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Layers className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Citizen Needs & 3D Heatmap</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-300">
                    Avg {townNeeds.overall}%
                  </span>
                </div>

                <div className="space-y-2">
                  {(
                    [
                      { key: 'housing', label: 'Housing', val: townNeeds.housing },
                      { key: 'food', label: 'Food', val: townNeeds.food },
                      { key: 'safety', label: 'Safety', val: townNeeds.safety },
                      { key: 'recreation', label: 'Recreation', val: townNeeds.recreation },
                    ] as const
                  ).map((row) => (
                    <div key={row.key}>
                      <div className="mb-0.5 flex justify-between text-[11px]">
                        <span className="text-slate-300">{row.label}</span>
                        <span className="font-mono-tabular font-semibold text-white">
                          {row.val}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            row.val >= 75
                              ? 'bg-emerald-400'
                              : row.val >= 50
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                          }`}
                          style={{ width: `${row.val}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-2.5 text-[11px] text-slate-400">{townNeeds.shortageHint}</p>

                <div className="mt-3">
                  <div className="mb-1 text-[11px] text-slate-400">3D Map Overlay</div>
                  <div className="grid grid-cols-5 gap-1">
                    {HEATMAP_BUTTONS.map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => onChangeHeatmapMode(btn.id)}
                        className={`min-h-[36px] rounded-lg text-[11px] font-medium transition-colors ${
                          heatmapMode === btn.id
                            ? 'bg-cyan-400 text-slate-950'
                            : 'border border-white/10 bg-slate-950 text-slate-300 hover:text-white'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: RAILWAY FLEET & INTER-TOWN CARGO ROUTES */}
          {tab === 'rail' && (
            <>
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Active Train Fleet ({effectiveTrains.length}/3)
                  </span>
                  <span className="text-[11px] text-slate-400">Cab Camera Target</span>
                </div>
                <div className="space-y-2">
                  {effectiveTrains.map((train, idx) => (
                    <div
                      key={`${train.name}-${idx}`}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                        activeTrainCameraIdx === idx
                          ? 'border-amber-400/50 bg-amber-500/10'
                          : 'border-white/10 bg-slate-950/70'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">
                          #{idx + 1} · {train.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {train.style} · {train.carCount} cars · {train.speed.toFixed(1)}x speed
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTrainCameraIdx(idx);
                            onRideTrain(idx);
                            onClose();
                          }}
                          className="min-h-[36px] rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                        >
                          Ride Cab
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Train Designer */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Commission Custom Train</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    value={trainDraft.name}
                    onChange={(e) => setTrainDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Train name..."
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                  <select
                    value={trainDraft.style}
                    onChange={(e) =>
                      setTrainDraft((p) => ({ ...p, style: e.target.value as TrainStyle }))
                    }
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    {TRAIN_STYLES.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Carriages</span>
                      <span className="font-mono-tabular text-white">{trainDraft.carCount}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={trainDraft.carCount}
                      onChange={(e) =>
                        setTrainDraft((p) => ({ ...p, carCount: Number(e.target.value) }))
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Speed</span>
                      <span className="font-mono-tabular text-white">
                        {trainDraft.speed.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={2.2}
                      step={0.1}
                      value={trainDraft.speed}
                      onChange={(e) =>
                        setTrainDraft((p) => ({ ...p, speed: Number(e.target.value) }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Engine</span>
                    <input
                      type="color"
                      value={trainDraft.locomotiveColor}
                      onChange={(e) =>
                        setTrainDraft((p) => ({ ...p, locomotiveColor: e.target.value }))
                      }
                      className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Cars</span>
                    <input
                      type="color"
                      value={trainDraft.carriageColor}
                      onChange={(e) =>
                        setTrainDraft((p) => ({ ...p, carriageColor: e.target.value }))
                      }
                      className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyTrainBlueprint(trainDraft, 'swap')}
                    className="min-h-[40px] flex-1 rounded-xl border border-white/15 bg-slate-950 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Swap Lead Train
                  </button>
                  <button
                    type="button"
                    disabled={effectiveTrains.length >= 3}
                    onClick={() => onApplyTrainBlueprint(trainDraft, 'add')}
                    className="min-h-[40px] flex-1 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-45"
                  >
                    {effectiveTrains.length >= 3 ? 'Fleet Full (3/3)' : 'Add to Fleet'}
                  </button>
                </div>
              </div>

              {/* Inter-Town Cargo Route Dispatch */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Package className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Inter-Town Cargo Dispatch</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedCargoTarget}
                    onChange={(e) => setCargoTargetId(e.target.value)}
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                  >
                    {otherTowns.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    <option value="regional_depot">Regional Rail Exchange</option>
                  </select>
                  <select
                    value={cargoResource}
                    onChange={(e) => setCargoResource(e.target.value as keyof TownResources)}
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                  >
                    {RESOURCE_OPTIONS.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label} ({resources[r.key]} avail)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const msg = onDispatchCargo(selectedCargoTarget, cargoResource);
                    setCargoStatus(msg);
                  }}
                  className="min-h-[40px] w-full rounded-xl bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Dispatch 6 {cargoResource} Cargo Freight
                </button>
                {cargoStatus && <p className="text-[11px] text-emerald-300">{cargoStatus}</p>}
              </div>
            </>
          )}

          {/* TAB 3: AI COUNCIL DEBATES & EMERGENCY RESPONSE */}
          {tab === 'council' && (
            <>
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Landmark className="h-3.5 w-3.5 text-amber-300" />
                    <span>Town Council Debate</span>
                  </div>
                  <button
                    type="button"
                    onClick={onConveneDebate}
                    className="min-h-[34px] rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    {activeDebate ? 'New Motion' : 'Convene Debate'}
                  </button>
                </div>

                {activeDebate ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-slate-300">
                      Motion: {activeDebate.topic}
                    </div>
                    {[activeDebate.optionA, activeDebate.optionB].map((opt) => (
                      <div
                        key={opt.id}
                        className="rounded-xl border border-white/10 bg-slate-950 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{opt.title}</span>
                          <span className="font-mono-tabular text-[11px] text-amber-300">
                            -{opt.goldCost}g
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {opt.leaderName} · {opt.leaderRole}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-300">{opt.pitch}</p>
                        <button
                          type="button"
                          onClick={() => onVoteDebate(opt)}
                          className="mt-2 min-h-[38px] w-full rounded-lg bg-amber-500 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                        >
                          Approve {opt.leaderName.split(' ')[0]}&apos;s Proposal
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Convene a live council vote between your town leaders to approve a new
                    procedural skyscraper, defense tower, or custom train.
                  </p>
                )}
              </div>

              {/* Emergency Events */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                    <span>Civic & Emergency Dispatch</span>
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerEmergency}
                    className="min-h-[34px] rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25"
                  >
                    Trigger Event
                  </button>
                </div>

                {activeEmergency ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      <Flame className="h-3.5 w-3.5 text-amber-300" />
                      <span>{activeEmergency.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-300">{activeEmergency.description}</p>
                    {activeEmergency.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onResolveEmergency(opt)}
                        className="flex min-h-[44px] w-full flex-col items-start justify-center rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-left hover:border-amber-400/50 hover:bg-slate-900"
                      >
                        <span className="font-semibold text-white">{opt.label}</span>
                        <span className="text-[10px] text-slate-400">{opt.detail}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    No active emergency. Blizzards, brush sparks, bridge repairs, and tourist
                    rushes occur dynamically or on demand here.
                  </p>
                )}
              </div>
            </>
          )}

          {/* TAB 4: SHARE & IMPORT CODES */}
          {tab === 'share' && (
            <>
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Export Full Town Code</div>
                <p className="text-[11px] text-slate-400">
                  Includes theme, biomes, custom procedural buildings, and train fleet.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={townShareCode}
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2.5 font-mono text-[10px] text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => void copyCode('town', townShareCode)}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    {copiedId === 'town' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedId === 'town' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Procedural Building & Train Codes */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Building & Train Blueprints</div>
                {proceduralBuildings.length === 0 && effectiveTrains.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    Build a custom procedural building or train to generate share codes.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {proceduralBuildings.slice(0, 6).map((s) => {
                      const code = encodeBlueprintShareCode({
                        kind: 'building',
                        blueprint: s.blueprint!,
                      });
                      return (
                        <div
                          key={s.plotId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">
                              {s.blueprint!.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {s.blueprint!.floors}F · {s.blueprint!.roofStyle}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyCode(`b-${s.plotId}`, code)}
                            className="min-h-[34px] shrink-0 rounded-lg border border-white/15 px-2.5 text-[11px] text-slate-200 hover:bg-white/10"
                          >
                            {copiedId === `b-${s.plotId}` ? 'Copied' : 'Copy Code'}
                          </button>
                        </div>
                      );
                    })}
                    {effectiveTrains.map((t, idx) => {
                      const code = encodeBlueprintShareCode({
                        kind: 'train',
                        blueprint: t,
                      });
                      return (
                        <div
                          key={`train-share-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-cyan-200">{t.name}</div>
                            <div className="text-[10px] text-slate-400">
                              Train · {t.style} · {t.carCount} cars
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyCode(`t-${idx}`, code)}
                            className="min-h-[34px] shrink-0 rounded-lg border border-white/15 px-2.5 text-[11px] text-slate-200 hover:bg-white/10"
                          >
                            {copiedId === `t-${idx}` ? 'Copied' : 'Copy Code'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Paste & Import */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Download className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Import Share Code</span>
                </div>
                <textarea
                  rows={3}
                  value={importDraft}
                  onChange={(e) => setImportDraft(e.target.value)}
                  placeholder="Paste ALDER-BLDG:..., ALDER-TRAIN:..., or ALDER-TOWN:..."
                  className="w-full rounded-lg border border-white/15 bg-slate-950 p-2.5 font-mono text-[11px] text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const res = onImportShareCode(importDraft);
                    setImportFeedback(res);
                    if (res.ok) setImportDraft('');
                  }}
                  className="min-h-[40px] w-full rounded-xl bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Clone Into Town
                </button>
                {importFeedback && (
                  <p
                    className={`text-[11px] ${
                      importFeedback.ok ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {importFeedback.message}
                  </p>
                )}
              </div>
            </>
          )}

          {/* TAB 5: FIRST-PERSON STREET WALK & DRONE TOUR */}
          {tab === 'explore' && (
            <div className="space-y-2.5">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Camera & Street Exploration</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Walk at eye level with the on-screen thumbstick & Sprint button, or glide on a
                  guided drone tour over your procedural skyline.
                </p>
              </div>

              {(
                [
                  {
                    mode: 'free_roam' as CameraMode,
                    title: 'First-Person Street Walk',
                    sub: 'Eye-level stroll · mobile thumbstick + Sprint toggle',
                    Icon: Footprints,
                  },
                  {
                    mode: 'tour' as CameraMode,
                    title: 'Guided Drone Skyline Tour',
                    sub: 'Smooth cinematic flight over landmarks & biomes',
                    Icon: Video,
                  },
                  {
                    mode: 'train_cab' as CameraMode,
                    title: 'Ride Express Train Cab',
                    sub: `Locomotive #${activeTrainCameraIdx + 1} forward view`,
                    Icon: TrainFront,
                  },
                  {
                    mode: 'bus_window' as CameraMode,
                    title: 'Ride Town Shuttle Bus',
                    sub: 'Window seat along the main boulevard',
                    Icon: Bus,
                  },
                  {
                    mode: 'orbit' as CameraMode,
                    title: 'Overview Orbit Camera',
                    sub: 'Standard pinch-zoom & pan planning view',
                    Icon: Compass,
                  },
                ] as const
              ).map(({ mode, title, sub, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    onChangeCameraMode(mode);
                    onClose();
                  }}
                  className={`flex min-h-[54px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    cameraMode === mode
                      ? 'border-amber-400/60 bg-amber-500/15 text-white'
                      : 'border-white/10 bg-slate-900 text-slate-200 hover:border-white/25 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-amber-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{title}</div>
                    <div className="text-[11px] text-slate-400">{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
