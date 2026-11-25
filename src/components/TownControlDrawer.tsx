import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BatteryCharging,
  Bookmark,
  Bus,
  Camera,
  Check,
  CheckSquare,
  ClipboardCheck,
  Coffee,
  Coins,
  Compass,
  Copy,
  Cpu,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FastForward,
  Flame,
  Footprints,
  Globe,
  Hammer,
  Landmark,
  Layers,
  Map as MapIcon,
  MapPin,
  Minus,
  Package,
  PartyPopper,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scale,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Sun,
  TrainFront,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  Video,
  Wrench,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DISTRICT_ZONE_META,
  encodeBlueprintShareCode,
  exportHistoryToCsv,
  FESTIVAL_CATALOG,
  TECH_UPGRADES,
} from '../lib/townSystems.ts';
import {
  computeTownHousingCapacity,
  DEFAULT_TRAIN_BLUEPRINT,
  generateFallbackTrainBlueprint,
  getAvailablePlotIds,
  PLOT_META,
  type ActiveFestivalState,
  type AgentId,
  type AgentRecord,
  type AgentShiftMode,
  type AutopilotRules,
  type BiomeId,
  type CameraBookmark,
  type CameraMode,
  type CameraNudgeAction,
  type CitizenSentimentItem,
  type CivicQuestItem,
  type CouncilDebateOption,
  type CouncilDebateProposal,
  type CreditRatingSummary,
  type DistrictZoneType,
  type EmergencyEventOption,
  type EmergencyEventState,
  type FestivalKind,
  type GraphicsQuality,
  type HeatmapMode,
  type LampMood,
  type MarketPricesState,
  type MayorTodoItem,
  type MunicipalLoanState,
  type PlotId,
  type TechUpgradeId,
  type TimeOfDay,
  type TourismSummary,
  type TownCheckpointSlot,
  type TownEconomySummary,
  type TownHistoryPoint,
  type TownNeedsSummary,
  type TownResources,
  type TownStructure,
  type TownTheme,
  type TrainBlueprint,
  type TrainStyle,
  type UtilityGridSummary,
  type WeatherMode,
} from '../types/town.ts';

export type StudioTab =
  | 'economy'
  | 'world'
  | 'utilities'
  | 'market'
  | 'tech'
  | 'rail'
  | 'council'
  | 'citizens'
  | 'camera'
  | 'tools'
  | 'share';

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
  agents: AgentRecord[];
  resources: TownResources;
  history: TownHistoryPoint[];
  economy: TownEconomySummary;
  townNeeds: TownNeedsSummary;
  utilities: UtilityGridSummary;
  taxRate: number;
  onChangeTaxRate: (nextRate: number) => void;
  heatmapMode: HeatmapMode;
  onChangeHeatmapMode: (mode: HeatmapMode) => void;
  // Utilities & Zoning & Starter Kits
  showUtilityOverlay: boolean;
  onToggleUtilityOverlay: (next: boolean) => void;
  showZoneOverlay: boolean;
  onToggleZoneOverlay: (next: boolean) => void;
  zoneMap: Partial<Record<PlotId, DistrictZoneType>>;
  onSetPlotZone: (plotId: PlotId, zone: DistrictZoneType) => void;
  dronePatrolEnabled: boolean;
  onToggleDronePatrol: (next: boolean) => void;
  onBuildDistrictKit: (kit: 'residential' | 'commerce' | 'fortress') => string;
  // Market, Loans, Quests, Fast-Forward
  marketPrices: MarketPricesState;
  onTradeResource: (
    resource: keyof TownResources,
    side: 'buy' | 'sell',
    amount: number,
  ) => string;
  activeLoan: MunicipalLoanState | null;
  onTakeLoan: (amount: 250 | 600) => string;
  onPayOffLoan: () => string;
  quests: CivicQuestItem[];
  onClaimQuest: (questId: string) => void;
  onFastForwardTurns: (turns: 5 | 10) => void;
  // Tech Tree & Autopilot
  unlockedTechs: TechUpgradeId[];
  onUnlockTech: (techId: TechUpgradeId) => string;
  autopilot: AutopilotRules;
  onChangeAutopilot: (next: AutopilotRules) => void;
  // Rail & Cargo
  trainBlueprints: TrainBlueprint[];
  activeTrainCameraIdx: number;
  onSelectTrainCameraIdx: (idx: number) => void;
  onApplyTrainBlueprint: (bp: TrainBlueprint, mode: 'add' | 'swap') => void;
  onRideTrain: (idx: number) => void;
  savedTowns: Array<{ id: string; name: string }>;
  activeTownId: string;
  onDispatchCargo: (targetTownId: string, resource: keyof TownResources) => string;
  // Council, Emergency & Fireworks
  activeDebate: CouncilDebateProposal | null;
  onConveneDebate: () => void;
  onVoteDebate: (option: CouncilDebateOption) => void;
  activeEmergency: EmergencyEventState | null;
  onTriggerEmergency: () => void;
  onResolveEmergency: (option: EmergencyEventOption) => void;
  onLaunchFireworks: () => void;
  // Citizens & Shifts
  sentiments: CitizenSentimentItem[];
  onSentimentFix: (action: NonNullable<CitizenSentimentItem['fixAction']>) => void;
  agentShifts: Partial<Record<AgentId, AgentShiftMode>>;
  onSetAgentShift: (agentId: AgentId, mode: AgentShiftMode) => void;
  onTownCoffeeBreak: () => void;
  // Camera, Photo Studio, Bookmarks & Zen Mode
  cameraMode: CameraMode;
  onChangeCameraMode: (mode: CameraMode) => void;
  cameraFov: number;
  onChangeCameraFov: (fov: number) => void;
  sunAngle: number;
  onChangeSunAngle: (deg: number) => void;
  cameraBookmarks: CameraBookmark[];
  onSaveCameraBookmark: (name: string) => void;
  onGlideCameraBookmark: (bm: CameraBookmark) => void;
  onDeleteCameraBookmark: (id: string) => void;
  onEnterZenMode: () => void;
  onCapturePostcard: () => void;
  // Share, Checkpoints & Undo/Redo
  onImportShareCode: (rawCode: string) => { ok: boolean; message: string };
  checkpoints: TownCheckpointSlot[];
  onSaveCheckpoint: (label: string) => void;
  onLoadCheckpoint: (id: string) => void;
  onDeleteCheckpoint: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Batch 3: World Atmosphere, Festivals, Strategy, Mobile Tools & Customization
  balloonsEnabled: boolean;
  onToggleBalloons: (next: boolean) => void;
  auroraEnabled: boolean;
  onToggleAurora: (next: boolean) => void;
  deliveryVanEnabled: boolean;
  onToggleDeliveryVan: (next: boolean) => void;
  lampMood: LampMood;
  onChangeLampMood: (mood: LampMood) => void;
  beaconPlotId: PlotId | null;
  onPinBeacon: (plotId: PlotId | null) => void;
  activeFestival: ActiveFestivalState | null;
  onLaunchFestival: (kind: FestivalKind) => string;
  tourism: TourismSummary;
  creditRating: CreditRatingSummary;
  onBulkUpgradeTier1: () => string;
  onAutoAssignVillagers: () => string;
  sunTimelapse: boolean;
  onToggleSunTimelapse: (next: boolean) => void;
  showNameplates: boolean;
  onToggleShowNameplates: (next: boolean) => void;
  onCameraNudge: (action: CameraNudgeAction) => void;
  hapticsEnabled: boolean;
  onToggleHaptics: (next: boolean) => void;
  todos: MayorTodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  townMotto: string;
  emblemColor: string;
  onChangeTownMotto: (motto: string) => void;
  onChangeEmblemColor: (hex: string) => void;
  liveFps: number;
  graphicsQuality: GraphicsQuality;
  onEnableBatterySaver: () => string;
  onCopyReportCard: () => Promise<string>;
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

const RESOURCE_KEYS: Array<{ key: keyof TownResources; label: string }> = [
  { key: 'timber', label: 'Timber' },
  { key: 'stone', label: 'Stone' },
  { key: 'harvest', label: 'Harvest' },
  { key: 'crystal', label: 'Crystal' },
];

const ZONE_TYPES: DistrictZoneType[] = ['mixed', 'residential', 'commercial', 'civic', 'tech'];

function MiniSparkline({
  values,
  color,
  height = 42,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <div className="flex h-[42px] items-center justify-center text-[11px] text-slate-500">
        Advance turns to chart trends
      </div>
    );
  }
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(1, maxV - minV);
  const w = 260;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = height - 4 - ((v - minV) / span) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-[42px] w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" points={pts} />
    </svg>
  );
}

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
  agents,
  resources,
  history,
  economy,
  townNeeds,
  utilities,
  taxRate,
  onChangeTaxRate,
  heatmapMode,
  onChangeHeatmapMode,
  showUtilityOverlay,
  onToggleUtilityOverlay,
  showZoneOverlay,
  onToggleZoneOverlay,
  zoneMap,
  onSetPlotZone,
  dronePatrolEnabled,
  onToggleDronePatrol,
  onBuildDistrictKit,
  marketPrices,
  onTradeResource,
  activeLoan,
  onTakeLoan,
  onPayOffLoan,
  quests,
  onClaimQuest,
  onFastForwardTurns,
  unlockedTechs,
  onUnlockTech,
  autopilot,
  onChangeAutopilot,
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
  onLaunchFireworks,
  sentiments,
  onSentimentFix,
  agentShifts,
  onSetAgentShift,
  onTownCoffeeBreak,
  cameraMode,
  onChangeCameraMode,
  cameraFov,
  onChangeCameraFov,
  sunAngle,
  onChangeSunAngle,
  cameraBookmarks,
  onSaveCameraBookmark,
  onGlideCameraBookmark,
  onDeleteCameraBookmark,
  onEnterZenMode,
  onCapturePostcard,
  onImportShareCode,
  checkpoints,
  onSaveCheckpoint,
  onLoadCheckpoint,
  onDeleteCheckpoint,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  balloonsEnabled,
  onToggleBalloons,
  auroraEnabled,
  onToggleAurora,
  deliveryVanEnabled,
  onToggleDeliveryVan,
  lampMood,
  onChangeLampMood,
  beaconPlotId,
  onPinBeacon,
  activeFestival,
  onLaunchFestival,
  tourism,
  creditRating,
  onBulkUpgradeTier1,
  onAutoAssignVillagers,
  sunTimelapse,
  onToggleSunTimelapse,
  showNameplates,
  onToggleShowNameplates,
  onCameraNudge,
  hapticsEnabled,
  onToggleHaptics,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  townMotto,
  emblemColor,
  onChangeTownMotto,
  onChangeEmblemColor,
  liveFps,
  graphicsQuality,
  onEnableBatterySaver,
  onCopyReportCard,
}: TownControlDrawerProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [trainDraft, setTrainDraft] = useState<TrainBlueprint>(() =>
    generateFallbackTrainBlueprint('Aurora Neon Bullet'),
  );
  const [cargoTargetId, setCargoTargetId] = useState<string>('');
  const [cargoResource, setCargoResource] = useState<keyof TownResources>('timber');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [bookmarkName, setBookmarkName] = useState('');
  const [checkpointName, setCheckpointName] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [selectedZonePlot, setSelectedZonePlot] = useState<PlotId>(
    () => getAvailablePlotIds(unlockedBiomes)[0],
  );

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const effectiveTrains = useMemo(
    () => (trainBlueprints.length > 0 ? trainBlueprints : [DEFAULT_TRAIN_BLUEPRINT]),
    [trainBlueprints],
  );

  const otherTowns = useMemo(
    () => savedTowns.filter((t) => t.id !== activeTownId),
    [savedTowns, activeTownId],
  );

  const availablePlots = useMemo(() => getAvailablePlotIds(unlockedBiomes), [unlockedBiomes]);

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
      blueprints: proceduralBuildings.map((s) => s.blueprint!).slice(0, 8),
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

  const flashStatus = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg((prev) => (prev === msg ? null : prev)), 3200);
  };

  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      setImportFeedback({ ok: false, message: 'Clipboard blocked — select and copy manually.' });
    }
  };

  const handleDownloadCsv = () => {
    const csv = exportHistoryToCsv(townName, history);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${townName.toLowerCase().replace(/\s+/g, '-')}-ledger.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flashStatus('Downloaded CSV economic ledger.');
  };

  const selectedCargoTarget = cargoTargetId || otherTowns[0]?.id || 'regional_depot';
  const unclaimedQuestCount = quests.filter((q) => q.completed && !q.claimed).length;

  const TABS: Array<{ id: StudioTab; label: string; Icon: typeof Coins }> = [
    { id: 'economy', label: 'Economy', Icon: Coins },
    { id: 'world', label: activeFestival ? 'World (Fest)' : 'World', Icon: Globe },
    { id: 'utilities', label: 'Grid', Icon: Zap },
    { id: 'market', label: unclaimedQuestCount > 0 ? `Market (${unclaimedQuestCount})` : 'Market', Icon: Store },
    { id: 'tech', label: 'Tech', Icon: Cpu },
    { id: 'rail', label: 'Rail', Icon: TrainFront },
    { id: 'council', label: 'Council', Icon: Scale },
    { id: 'citizens', label: 'Citizens', Icon: Users },
    { id: 'camera', label: 'Camera', Icon: Camera },
    { id: 'tools', label: 'Tools', Icon: Wrench },
    { id: 'share', label: 'Share', Icon: Share2 },
  ];

  const tier1Count = structures.filter((s) => s.status === 'complete' && s.tier === 1).length;
  const housingSummary = computeTownHousingCapacity(structures);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 md:items-stretch md:justify-end"
      onClick={onClose}
    >
      <aside
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-white/15 bg-slate-950 shadow-2xl md:h-full md:max-h-none md:max-w-[440px] md:rounded-none md:border-t-0 md:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Bottom-Sheet Drag Handle */}
        <div
          className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-700 md:hidden"
          aria-hidden="true"
        />

        {/* Header + Undo/Redo Controls */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: emblemColor }}
                aria-hidden="true"
              />
              <span className="truncate text-[11px] font-semibold text-amber-300">{townName}</span>
            </div>
            <h2 className="font-display text-base font-semibold text-white">Town Studio</h2>
            <p className="truncate text-[10px] text-slate-400">{townMotto}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo last city edit"
              aria-label="Undo last city edit"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo city edit"
              aria-label="Redo city edit"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-35"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Town Studio"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Single-Line Scrollable Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-slate-900/70 px-2 py-1.5 text-[11px]">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-medium whitespace-nowrap transition-colors ${
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

        {statusMsg && (
          <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-medium text-emerald-200">
            {statusMsg}
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5 text-xs">
          {/* TAB 1: ECONOMY, TAX, MUNICIPAL LOANS, TIME-SKIP, ANALYTICS & HEATMAP */}
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
                  <span>0% Low Tax</span>
                  <span
                    className={
                      economy.taxMoraleEffect >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    Morale{' '}
                    {economy.taxMoraleEffect >= 0
                      ? `+${economy.taxMoraleEffect}`
                      : economy.taxMoraleEffect}
                    /turn
                  </span>
                  <span>20% High Tax</span>
                </div>
              </div>

              {/* Rent, Tickets & Net Ledger + Fast-Forward */}
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
                    <span>Staff, Policies & Loan Service</span>
                    <span className="font-mono-tabular text-rose-300">
                      -{economy.workerUpkeep}g
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onFastForwardTurns(5);
                      flashStatus('Simulated +5 economic turns.');
                    }}
                    className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/15 font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Sim +5 Turns</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFastForwardTurns(10);
                      flashStatus('Simulated +10 economic turns.');
                    }}
                    className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-slate-950 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Sim +10 Turns</span>
                  </button>
                </div>
              </div>

              {/* Tourism & Attraction Rating + One-Tap Bulk Upgrade */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Star className="h-3.5 w-3.5 text-amber-300" />
                    <span>Tourism & Skyline Appeal</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-amber-300">
                    ★ {tourism.starRating.toFixed(1)} · +{tourism.revenuePerTurn}g/turn
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  <span className="font-mono-tabular font-semibold text-white">
                    {tourism.dailyVisitors}
                  </span>{' '}
                  visitors/day · Top draw: {tourism.topAttraction}
                </div>
                <button
                  type="button"
                  disabled={tier1Count === 0}
                  onClick={() => flashStatus(onBulkUpgradeTier1())}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <Hammer className="h-3.5 w-3.5" />
                  <span>
                    {tier1Count > 0
                      ? `Bulk Upgrade ${tier1Count} Tier-1 Bldgs (-${tier1Count * 70}g)`
                      : 'All Completed Buildings Upgraded'}
                  </span>
                </button>
              </div>

              {/* Municipal Bonds & Live Credit Rating */}
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">Municipal Bonds & Credit</span>
                  <span className="font-mono-tabular text-xs font-bold text-emerald-300">
                    {creditRating.grade} · {creditRating.interestRatePct}% APR
                  </span>
                </div>
                <p className="mb-2 text-[11px] text-slate-400">
                  {creditRating.label} · {creditRating.advice}
                </p>
                {activeLoan ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-300">
                      {activeLoan.label} · -{activeLoan.perTurnPayment}g/turn ·{' '}
                      {activeLoan.turnsLeft} turns left
                    </div>
                    <button
                      type="button"
                      onClick={() => flashStatus(onPayOffLoan())}
                      className="min-h-[44px] w-full rounded-xl bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Pay Off Early ({activeLoan.remaining}g)
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => flashStatus(onTakeLoan(250))}
                      className="min-h-[44px] rounded-xl border border-white/15 bg-slate-950 px-2.5 text-left hover:border-amber-400/45"
                    >
                      <div className="font-semibold text-white">Borrow +250g</div>
                      <div className="font-mono-tabular text-[10px] text-slate-400">
                        {creditRating.interestRatePct}% rate · 10 turns
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => flashStatus(onTakeLoan(600))}
                      className="min-h-[44px] rounded-xl border border-white/15 bg-slate-950 px-2.5 text-left hover:border-amber-400/45"
                    >
                      <div className="font-semibold text-white">Borrow +600g</div>
                      <div className="font-mono-tabular text-[10px] text-slate-400">
                        {creditRating.interestRatePct}% rate · 12 turns
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Sparkline Analytics + CSV Export */}
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-white">Growth Trends ({history.length} pts)</span>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/15 px-2 text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    <Download className="h-3 w-3" />
                    <span>CSV</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-[10px] text-amber-300">Treasury Gold</div>
                    <MiniSparkline
                      values={history.map((h) => h.treasuryGold)}
                      color="#f59e0b"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-emerald-300">Citizen Morale</div>
                    <MiniSparkline values={history.map((h) => h.morale)} color="#34d399" />
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
                <p className="mt-2 text-[11px] text-slate-400">{townNeeds.shortageHint}</p>
                <div className="mt-2.5 grid grid-cols-5 gap-1">
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
            </>
          )}

          {/* NEW TAB: 3D WORLD ATMOSPHERE, LIGHTING MOOD, WAYPOINT BEACON & FESTIVAL CALENDAR */}
          {tab === 'world' && (
            <>
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">3D Live World Features</div>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      {
                        label: 'Hot Air Balloon Fleet',
                        sub: '3 composite balloons drifting above skyline (+22 tourists/day)',
                        enabled: balloonsEnabled,
                        onToggle: () => onToggleBalloons(!balloonsEnabled),
                      },
                      {
                        label: 'Night Aurora Borealis Ribbon',
                        sub: 'Animated northern-lights sky ribbon during twilight & night',
                        enabled: auroraEnabled,
                        onToggle: () => onToggleAurora(!auroraEnabled),
                      },
                      {
                        label: 'Electric Delivery Van Loop',
                        sub: 'Autonomous delivery van cruising Alderbrook avenues',
                        enabled: deliveryVanEnabled,
                        onToggle: () => onToggleDeliveryVan(!deliveryVanEnabled),
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onToggle}
                      className={`flex min-h-[48px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        item.enabled
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-white'
                          : 'border-white/10 bg-slate-950 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">{item.label}</div>
                        <div className="text-[10px] text-slate-400">{item.sub}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                          item.enabled
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.enabled ? 'On' : 'Off'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3D Street-Lamp & Accent Lighting Mood */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">3D Street-Lamp Lighting Mood</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'warm' as LampMood, label: 'Warm', color: '#fde68a' },
                      { id: 'amber' as LampMood, label: 'Amber', color: '#fb923c' },
                      { id: 'cyber' as LampMood, label: 'Cyber', color: '#22d3ee' },
                      { id: 'emerald' as LampMood, label: 'Emerald', color: '#34d399' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChangeLampMood(m.id);
                        flashStatus(`Switched 3D street lighting to ${m.label}.`);
                      }}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors ${
                        lampMood === m.id
                          ? 'border-white bg-white text-slate-950'
                          : 'border-white/10 bg-slate-950 text-slate-300 hover:text-white'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3D Landmark Waypoint Beacon */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                    <span>3D Waypoint Beacon</span>
                  </div>
                  {beaconPlotId && (
                    <button
                      type="button"
                      onClick={() => {
                        onPinBeacon(null);
                        flashStatus('Cleared 3D Waypoint Beacon.');
                      }}
                      className="min-h-[34px] rounded-lg border border-white/15 px-2.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  value={beaconPlotId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onPinBeacon(v ? (v as PlotId) : null);
                    flashStatus(
                      v
                        ? `Pinned glowing 3D beacon on ${PLOT_META[v as PlotId].shortLabel}.`
                        : 'Cleared 3D beacon.',
                    );
                  }}
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white"
                >
                  <option value="">No Beacon Active</option>
                  {availablePlots.map((pid) => (
                    <option key={pid} value={pid}>
                      Pin Beacon → {PLOT_META[pid].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Civic Festival Calendar */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <PartyPopper className="h-3.5 w-3.5 text-amber-300" />
                    <span>Civic Festival Calendar</span>
                  </div>
                  {activeFestival && (
                    <span className="font-mono-tabular text-[11px] font-semibold text-amber-300">
                      {activeFestival.turnsLeft}t left
                    </span>
                  )}
                </div>
                {activeFestival && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-100">
                    <div className="font-semibold">{activeFestival.label} Active!</div>
                    <div className="mt-0.5 text-amber-200/85">
                      +{activeFestival.goldBonusPerTurn}g · +{activeFestival.moraleBonusPerTurn}{' '}
                      Morale
                      {activeFestival.crystalBonusPerTurn > 0
                        ? ` · +${activeFestival.crystalBonusPerTurn} Crystal`
                        : ''}{' '}
                      per turn
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  {FESTIVAL_CATALOG.map((fest) => (
                    <button
                      key={fest.kind}
                      type="button"
                      onClick={() => flashStatus(onLaunchFestival(fest.kind))}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left hover:border-amber-400/45"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{fest.label}</div>
                        <div className="text-[10px] text-slate-400">{fest.summary}</div>
                      </div>
                      <span className="font-mono-tabular shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                        -{fest.costGold}g
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: POWER/WATER GRID, PATROL DRONE, DISTRICT ZONING & STARTER KITS */}
          {tab === 'utilities' && (
            <>
              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Power & Water Grid</span>
                  <span
                    className={`font-semibold ${
                      utilities.status === 'optimal'
                        ? 'text-emerald-300'
                        : utilities.status === 'strained'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                    }`}
                  >
                    {utilities.status === 'optimal'
                      ? 'Optimal (+5% yield)'
                      : utilities.status === 'strained'
                        ? 'Strained'
                        : 'Shortage (-15%)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-white/10 bg-slate-950 p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-amber-300">
                      <Zap className="h-3.5 w-3.5" />
                      <span>Power</span>
                    </div>
                    <div className="mt-1 font-mono-tabular text-sm font-semibold text-white">
                      {utilities.powerUsedMW} / {utilities.powerProducedMW} MW
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Surplus {utilities.powerSurplusMW >= 0 ? `+${utilities.powerSurplusMW}` : utilities.powerSurplusMW} MW
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950 p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-cyan-300">
                      <Droplets className="h-3.5 w-3.5" />
                      <span>Water</span>
                    </div>
                    <div className="mt-1 font-mono-tabular text-sm font-semibold text-white">
                      {utilities.waterUsedKL} / {utilities.waterProducedKL} kL
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Surplus {utilities.waterSurplusKL >= 0 ? `+${utilities.waterSurplusKL}` : utilities.waterSurplusKL} kL
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleUtilityOverlay(!showUtilityOverlay)}
                    className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      showUtilityOverlay
                        ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                        : 'border-white/15 bg-slate-950 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {showUtilityOverlay ? 'Hide 3D Grid Lines' : 'Show 3D Grid Lines'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDronePatrol(!dronePatrolEnabled)}
                    className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      dronePatrolEnabled
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                        : 'border-white/15 bg-slate-950 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Radio className="h-3.5 w-3.5" />
                    <span>{dronePatrolEnabled ? 'Patrol Drone On' : 'Patrol Drone Off'}</span>
                  </button>
                </div>
              </div>

              {/* District Zoning Painter */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <MapIcon className="h-3.5 w-3.5 text-amber-300" />
                    <span>District Zoning Painter</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleZoneOverlay(!showZoneOverlay)}
                    className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold ${
                      showZoneOverlay
                        ? 'bg-amber-500 text-slate-950'
                        : 'border border-white/15 bg-slate-950 text-slate-300'
                    }`}
                  >
                    {showZoneOverlay ? '3D Borders On' : '3D Borders Off'}
                  </button>
                </div>

                <select
                  value={selectedZonePlot}
                  onChange={(e) => setSelectedZonePlot(e.target.value as PlotId)}
                  className="min-h-[38px] w-full rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                >
                  {availablePlots.map((pid) => (
                    <option key={pid} value={pid}>
                      {PLOT_META[pid].label} · Current:{' '}
                      {DISTRICT_ZONE_META[zoneMap[pid] ?? 'mixed'].label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-5 gap-1">
                  {ZONE_TYPES.map((zt) => {
                    const active = (zoneMap[selectedZonePlot] ?? 'mixed') === zt;
                    return (
                      <button
                        key={zt}
                        type="button"
                        onClick={() => {
                          onSetPlotZone(selectedZonePlot, zt);
                          onToggleZoneOverlay(true);
                          flashStatus(
                            `Zoned ${PLOT_META[selectedZonePlot].shortLabel} as ${DISTRICT_ZONE_META[zt].label}.`,
                          );
                        }}
                        className={`min-h-[36px] rounded-lg text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-white text-slate-950'
                            : 'border border-white/10 bg-slate-950 text-slate-300 hover:text-white'
                        }`}
                      >
                        {DISTRICT_ZONE_META[zt].shortLabel}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  {DISTRICT_ZONE_META[zoneMap[selectedZonePlot] ?? 'mixed'].bonus}
                </p>
              </div>

              {/* 1-Tap District Starter Kits */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">One-Tap District Starter Kits</div>
                <div className="space-y-1.5">
                  {(
                    [
                      {
                        id: 'residential' as const,
                        title: 'Residential Quarter (-110g)',
                        sub: 'Places 2 multi-story Apartments (+56 crowd housing)',
                      },
                      {
                        id: 'commerce' as const,
                        title: 'Commerce & Power Strip (-95g)',
                        sub: 'Places Artisan Bakery + Windmill (+18 MW power)',
                      },
                      {
                        id: 'fortress' as const,
                        title: 'Safety & Defense Ring (-105g)',
                        sub: 'Places Town Hospital + Triple-Gun Defense Tower',
                      },
                    ] as const
                  ).map((kit) => (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => flashStatus(onBuildDistrictKit(kit.id))}
                      className="flex min-h-[46px] w-full flex-col items-start justify-center rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left hover:border-amber-400/50 hover:bg-slate-900"
                    >
                      <span className="font-semibold text-white">{kit.title}</span>
                      <span className="text-[10px] text-slate-400">{kit.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB 3: DYNAMIC RESOURCE MARKET & ACTIVE CIVIC QUESTS */}
          {tab === 'market' && (
            <>
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Live Resource Market Exchange</span>
                  <span className="font-mono-tabular text-[11px] text-amber-300">
                    {economy.treasuryGold}g cash
                  </span>
                </div>
                <div className="space-y-2">
                  {RESOURCE_KEYS.map(({ key, label }) => {
                    const price = marketPrices[key];
                    const trend = marketPrices.trends[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <span>{label}</span>
                            <span className="font-mono-tabular text-amber-300">{price}g</span>
                            {trend === 'up' ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                            ) : trend === 'down' ? (
                              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <Minus className="h-3 w-3 text-slate-500" />
                            )}
                          </div>
                          <div className="font-mono-tabular text-[10px] text-slate-400">
                            In stock: {resources[key]}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => flashStatus(onTradeResource(key, 'buy', 5))}
                            className="min-h-[34px] rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                          >
                            Buy 5
                          </button>
                          <button
                            type="button"
                            onClick={() => flashStatus(onTradeResource(key, 'sell', 5))}
                            className="min-h-[34px] rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
                          >
                            Sell 5
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Civic Quests */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Award className="h-3.5 w-3.5 text-amber-300" />
                  <span>Active Civic Quests</span>
                </div>
                <div className="space-y-2">
                  {quests.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-xl border border-white/10 bg-slate-950 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white">{q.title}</span>
                        <span className="font-mono-tabular text-[11px] text-amber-300">
                          {q.progress}/{q.target}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">{q.detail}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-mono-tabular text-[10px] text-emerald-300">
                          Reward: +{q.rewardGold}g · +{q.rewardCrystal} Crystal
                        </span>
                        {q.claimed ? (
                          <span className="text-[11px] font-medium text-slate-500">Claimed</span>
                        ) : q.completed ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClaimQuest(q.id);
                              flashStatus(`Claimed +${q.rewardGold}g and +${q.rewardCrystal} Crystal!`);
                            }}
                            className="min-h-[32px] rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                          >
                            Claim Reward
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500">In progress</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB 4: 8-NODE CIVIC TECH TREE & SMART AUTOPILOT */}
          {tab === 'tech' && (
            <>
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Civic Tech Tree ({unlockedTechs.length}/{TECH_UPGRADES.length})
                  </span>
                  <span className="font-mono-tabular text-[11px] text-cyan-300">
                    {resources.crystal} Crystal · {economy.treasuryGold}g
                  </span>
                </div>
                <div className="space-y-1.5">
                  {TECH_UPGRADES.map((tech) => {
                    const owned = unlockedTechs.includes(tech.id);
                    return (
                      <div
                        key={tech.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                          owned
                            ? 'border-emerald-400/35 bg-emerald-500/10'
                            : 'border-white/10 bg-slate-950'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{tech.label}</div>
                          <div className="text-[10px] text-slate-400">{tech.effect}</div>
                        </div>
                        {owned ? (
                          <span className="shrink-0 text-[11px] font-semibold text-emerald-300">
                            Unlocked
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => flashStatus(onUnlockTech(tech.id))}
                            className="min-h-[34px] shrink-0 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                          >
                            {tech.costGold}g · {tech.costCrystal}C
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Smart Civic Autopilot */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  <span>Smart Civic Autopilot</span>
                </div>
                {(
                  [
                    {
                      key: 'autoClaimQuests' as const,
                      label: 'Auto-Claim Completed Quests',
                      sub: 'Collects Gold & Crystal rewards each turn automatically',
                    },
                    {
                      key: 'autoBalanceTax' as const,
                      label: 'Auto-Balance Tax Rate',
                      sub: 'Lowers tax if morale dips below 72%, raises slightly if thriving',
                    },
                    {
                      key: 'autoUpgradeBuildings' as const,
                      label: 'Auto-Upgrade Tier 1 Buildings',
                      sub: 'Upgrades completed buildings when treasury exceeds 450g',
                    },
                    {
                      key: 'autoBuildHousing' as const,
                      label: 'Auto-Build Housing When Crowded',
                      sub: 'Places a new Apartment on an open plot if Housing < 60%',
                    },
                  ] as const
                ).map((rule) => (
                  <label
                    key={rule.key}
                    className="flex min-h-[46px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-white">{rule.label}</div>
                      <div className="text-[10px] text-slate-400">{rule.sub}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autopilot[rule.key]}
                      onChange={(e) =>
                        onChangeAutopilot({ ...autopilot, [rule.key]: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 accent-amber-400"
                    />
                  </label>
                ))}
              </div>
            </>
          )}

          {/* TAB 5: RAILWAY FLEET & INTER-TOWN CARGO */}
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
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTrainCameraIdx(idx);
                          onRideTrain(idx);
                          onClose();
                        }}
                        className="min-h-[36px] shrink-0 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                      >
                        Ride Cab
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Commission Custom Train</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    value={trainDraft.name}
                    onChange={(e) => setTrainDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Train name..."
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                  />
                  <select
                    value={trainDraft.style}
                    onChange={(e) =>
                      setTrainDraft((p) => ({ ...p, style: e.target.value as TrainStyle }))
                    }
                    className="min-h-[38px] rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
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
                    Swap Lead
                  </button>
                  <button
                    type="button"
                    disabled={effectiveTrains.length >= 3}
                    onClick={() => onApplyTrainBlueprint(trainDraft, 'add')}
                    className="min-h-[40px] flex-1 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-45"
                  >
                    {effectiveTrains.length >= 3 ? 'Fleet Full (3/3)' : 'Add Train'}
                  </button>
                </div>
              </div>

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
                    {RESOURCE_KEYS.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label} ({resources[r.key]} avail)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => flashStatus(onDispatchCargo(selectedCargoTarget, cargoResource))}
                  className="min-h-[40px] w-full rounded-xl bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Dispatch 6 {cargoResource} Freight
                </button>
              </div>
            </>
          )}

          {/* TAB 6: COUNCIL DEBATES, EMERGENCIES & 3D FIREWORKS SHOW */}
          {tab === 'council' && (
            <>
              <div className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <div>
                  <div className="font-semibold text-white">3D Sky Fireworks Show</div>
                  <div className="text-[11px] text-amber-200/80">
                    Launch live fireworks over Plaza (+4 Morale)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onLaunchFireworks();
                    flashStatus('Launched 3D Fireworks over Town Plaza!');
                  }}
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 font-semibold text-slate-950 hover:bg-amber-400"
                >
                  <Flame className="h-3.5 w-3.5" />
                  <span>Launch</span>
                </button>
              </div>

              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Landmark className="h-3.5 w-3.5 text-amber-300" />
                    <span>Town Council Debate</span>
                  </div>
                  <button
                    type="button"
                    onClick={onConveneDebate}
                    className="min-h-[34px] rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200"
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

              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                    <span>Civic & Emergency Dispatch</span>
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerEmergency}
                    className="min-h-[34px] rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 text-[11px] font-semibold text-rose-200"
                  >
                    Trigger Event
                  </button>
                </div>
                {activeEmergency ? (
                  <div className="space-y-2">
                    <div className="font-semibold text-white">{activeEmergency.title}</div>
                    <p className="text-[11px] text-slate-300">{activeEmergency.description}</p>
                    {activeEmergency.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onResolveEmergency(opt)}
                        className="flex min-h-[44px] w-full flex-col items-start justify-center rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-left hover:border-amber-400/50"
                      >
                        <span className="font-semibold text-white">{opt.label}</span>
                        <span className="text-[10px] text-slate-400">{opt.detail}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    No active emergency. Blizzards, brush sparks, bridge repairs, and tourist
                    rushes occur dynamically or on demand.
                  </p>
                )}
              </div>
            </>
          )}

          {/* TAB 7: CITIZEN SENTIMENT FEED & VILLAGER SHIFT MANAGER */}
          {tab === 'citizens' && (
            <>
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Live Citizen Voice & Feedback</div>
                <div className="space-y-2">
                  {sentiments.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-white/10 bg-slate-950 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-semibold ${
                            s.mood === 'concern'
                              ? 'text-rose-300'
                              : s.mood === 'happy'
                                ? 'text-emerald-300'
                                : 'text-slate-200'
                          }`}
                        >
                          {s.speaker}
                        </span>
                        {s.fixAction && (
                          <button
                            type="button"
                            onClick={() => {
                              onSentimentFix(s.fixAction!);
                              flashStatus(`Addressed ${s.speaker}'s concern.`);
                            }}
                            className="min-h-[28px] rounded-md border border-amber-400/40 bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25"
                          >
                            Quick Fix
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">Staff Shift Boosts</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => flashStatus(onAutoAssignVillagers())}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Auto-Assign</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onTownCoffeeBreak();
                        flashStatus('Hosted Town Coffee Break (+6 Morale & stronger bonds)!');
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                    >
                      <Coffee className="h-3.5 w-3.5" />
                      <span>Coffee (-20g)</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {agents.slice(0, 10).map((agent) => {
                    const mode = agentShifts[agent.id] ?? 'normal';
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">{agent.name}</div>
                          <div className="truncate text-[10px] text-slate-400">{agent.role}</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {(['normal', 'overtime', 'rest'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => onSetAgentShift(agent.id, m)}
                              className={`min-h-[30px] rounded-md px-2 text-[10px] font-semibold ${
                                mode === m
                                  ? m === 'overtime'
                                    ? 'bg-amber-500 text-slate-950'
                                    : m === 'rest'
                                      ? 'bg-emerald-400 text-slate-950'
                                      : 'bg-slate-200 text-slate-950'
                                  : 'border border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {m === 'normal' ? 'Std' : m === 'overtime' ? 'Boost' : 'Rest'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* TAB 8: PHOTO STUDIO, FOV/SUN SLIDERS, CAMERA BOOKMARKS & WALK/TOUR */}
          {tab === 'camera' && (
            <>
              {/* Photo & Cinema Controls */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Photo Studio & Lens Controls</div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="mb-1 flex justify-between text-slate-400">
                      <span>Camera FOV</span>
                      <span className="font-mono-tabular text-white">{cameraFov}°</span>
                    </div>
                    <input
                      type="range"
                      min={32}
                      max={68}
                      step={1}
                      value={cameraFov}
                      onChange={(e) => onChangeCameraFov(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Sun className="h-3 w-3" /> Sun Angle
                      </span>
                      <span className="font-mono-tabular text-white">{sunAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      value={sunAngle}
                      onChange={(e) => onChangeSunAngle(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleSunTimelapse(!sunTimelapse)}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${
                      sunTimelapse
                        ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                        : 'border-white/15 bg-slate-950 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    <span>{sunTimelapse ? 'Timelapse On' : 'Sun Timelapse'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleShowNameplates(!showNameplates)}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${
                      showNameplates
                        ? 'border-white/15 bg-slate-950 text-slate-200 hover:bg-slate-800'
                        : 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    {showNameplates ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    <span>{showNameplates ? 'Labels Shown' : 'Labels Hidden'}</span>
                  </button>
                </div>
                {/* One-Handed Touch Camera Quick-Orbit Pad */}
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                    One-Thumb Camera Quick-Orbit
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        { action: 'left' as CameraNudgeAction, label: 'Left', Icon: RotateCcw },
                        { action: 'right' as CameraNudgeAction, label: 'Right', Icon: RotateCw },
                        { action: 'zoom_in' as CameraNudgeAction, label: 'In', Icon: ZoomIn },
                        { action: 'zoom_out' as CameraNudgeAction, label: 'Out', Icon: ZoomOut },
                        { action: 'top_down' as CameraNudgeAction, label: 'Top', Icon: Compass },
                      ] as const
                    ).map(({ action, label, Icon }) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => onCameraNudge(action)}
                        className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-white/15 bg-slate-950 text-[10px] font-semibold text-slate-200 active:bg-amber-500 active:text-slate-950"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onEnterZenMode();
                      onClose();
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-950 font-semibold text-white hover:bg-slate-800"
                  >
                    <EyeOff className="h-3.5 w-3.5 text-amber-300" />
                    <span>Hide HUD (Zen)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCapturePostcard();
                      flashStatus('Snapped high-res postcard photo!');
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Snap Postcard</span>
                  </button>
                </div>
              </div>

              {/* Camera Bookmarks */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Bookmark className="h-3.5 w-3.5 text-amber-300" />
                  <span>Saved Camera Viewpoints ({cameraBookmarks.length}/6)</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={28}
                    value={bookmarkName}
                    onChange={(e) => setBookmarkName(e.target.value)}
                    placeholder="e.g., Sunset Skyline..."
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={cameraBookmarks.length >= 6}
                    onClick={() => {
                      onSaveCameraBookmark(bookmarkName.trim() || `View ${cameraBookmarks.length + 1}`);
                      setBookmarkName('');
                      flashStatus('Saved current camera angle!');
                    }}
                    className="min-h-[38px] shrink-0 rounded-lg bg-amber-500 px-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
                  >
                    Save View
                  </button>
                </div>
                {cameraBookmarks.length > 0 && (
                  <div className="space-y-1.5">
                    {cameraBookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onGlideCameraBookmark(bm);
                            onClose();
                          }}
                          className="min-h-[34px] flex-1 text-left font-medium text-white hover:text-amber-300"
                        >
                          {bm.name} <span className="text-[10px] text-slate-500">· {bm.fov}°</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCameraBookmark(bm.id)}
                          aria-label={`Delete ${bm.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Camera Modes */}
              <div className="space-y-1.5">
                {(
                  [
                    {
                      mode: 'free_roam' as CameraMode,
                      title: 'First-Person Street Walk',
                      sub: 'Eye-level stroll · thumbstick + Sprint',
                      Icon: Footprints,
                    },
                    {
                      mode: 'tour' as CameraMode,
                      title: 'Guided Drone Skyline Tour',
                      sub: 'Smooth cinematic flight over landmarks',
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
                      sub: 'Window seat along main boulevard',
                      Icon: Bus,
                    },
                    {
                      mode: 'orbit' as CameraMode,
                      title: 'Overview Orbit Camera',
                      sub: 'Standard pinch-zoom & pan view',
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
                    className={`flex min-h-[50px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                      cameraMode === mode
                        ? 'border-amber-400/60 bg-amber-500/15 text-white'
                        : 'border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{title}</div>
                      <div className="text-[10px] text-slate-400">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* NEW TAB: MAYOR CHECKLIST, MOTTO/EMBLEM, REPORT CARD, FPS HEALTH & HAPTICS */}
          {tab === 'tools' && (
            <>
              {/* Live Performance & 4GB Phone Battery Saver */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Activity className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Device & FPS Health</span>
                  </div>
                  <span
                    className={`font-mono-tabular text-xs font-bold ${
                      liveFps >= 45
                        ? 'text-emerald-300'
                        : liveFps >= 28
                          ? 'text-amber-300'
                          : 'text-rose-300'
                    }`}
                  >
                    {liveFps} FPS · {graphicsQuality.toUpperCase()}
                  </span>
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400">
                  {structures.length} Bldgs · {housingSummary.dummyPopulation} Instanced Crowd ·{' '}
                  {effectiveTrains.length} Trains · {agents.length} AI Agents
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => flashStatus(onEnableBatterySaver())}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                  >
                    <BatteryCharging className="h-4 w-4 shrink-0" />
                    <span>Battery Saver</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleHaptics(!hapticsEnabled)}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                      hapticsEnabled
                        ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                        : 'border-white/15 bg-slate-950 text-slate-300'
                    }`}
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <span>{hapticsEnabled ? 'Haptics On' : 'Haptics Off'}</span>
                  </button>
                </div>
              </div>

              {/* Mayor's Custom Checklist */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <CheckSquare className="h-3.5 w-3.5 text-amber-300" />
                    <span>Mayor&apos;s Checklist ({todos.filter((t) => !t.done).length} open)</span>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleaned = todoDraft.trim();
                    if (!cleaned) return;
                    onAddTodo(cleaned);
                    setTodoDraft('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    maxLength={80}
                    value={todoDraft}
                    onChange={(e) => setTodoDraft(e.target.value)}
                    placeholder="Add town goal..."
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white"
                  />
                  <button
                    type="submit"
                    aria-label="Add checklist item"
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
                <div className="space-y-1.5">
                  {todos.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTodo(item.id)}
                        className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            item.done
                              ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                              : 'border-slate-600'
                          }`}
                        >
                          {item.done && <Check className="h-3 w-3" />}
                        </span>
                        <span
                          className={`truncate text-xs ${
                            item.done ? 'text-slate-500 line-through' : 'text-slate-100'
                          }`}
                        >
                          {item.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTodo(item.id)}
                        aria-label="Delete checklist item"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Town Motto & Emblem Color */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Town Identity & Emblem</div>
                <input
                  type="text"
                  maxLength={70}
                  value={townMotto}
                  onChange={(e) => onChangeTownMotto(e.target.value)}
                  placeholder="Town motto..."
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {['#f59e0b', '#38bdf8', '#34d399', '#f43f5e', '#a78bfa', '#fb923c'].map(
                      (hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => onChangeEmblemColor(hex)}
                          aria-label={`Set emblem color ${hex}`}
                          className={`h-8 w-8 rounded-full border-2 transition-transform ${
                            emblemColor === hex ? 'scale-110 border-white' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ),
                    )}
                  </div>
                  <input
                    type="color"
                    value={emblemColor}
                    onChange={(e) => onChangeEmblemColor(e.target.value)}
                    aria-label="Custom emblem color"
                    className="h-9 w-11 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                  />
                </div>
              </div>

              {/* One-Tap Town Report Card Copy */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Shareable Town Report Card</div>
                <p className="text-[11px] text-slate-400">
                  Copy a clean text summary of your Credit Rating, Tourism, Treasury, and Skyline
                  for WhatsApp, Discord, or Notes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void onCopyReportCard().then((msg) => flashStatus(msg));
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  <span>Copy Town Report Card</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 9: SHARE CODES & QUICK CHECKPOINT SNAPSHOTS */}
          {tab === 'share' && (
            <>
              {/* 3 Local Quick Checkpoints */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Save className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Quick Town Checkpoints ({checkpoints.length}/3)</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={28}
                    value={checkpointName}
                    onChange={(e) => setCheckpointName(e.target.value)}
                    placeholder="Checkpoint label..."
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveCheckpoint(
                        checkpointName.trim() || `Save #${checkpoints.length + 1}`,
                      );
                      setCheckpointName('');
                      flashStatus('Saved local town checkpoint!');
                    }}
                    className="min-h-[38px] shrink-0 rounded-lg bg-emerald-500 px-3 font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Save Slot
                  </button>
                </div>
                {checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{cp.label}</div>
                      <div className="font-mono-tabular text-[10px] text-slate-400">
                        Turn {cp.turnCount} · {cp.treasuryGold}g · {cp.structures.length} bldgs
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadCheckpoint(cp.id);
                          flashStatus(`Restored checkpoint "${cp.label}".`);
                        }}
                        className="min-h-[32px] rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCheckpoint(cp.id)}
                        aria-label={`Delete checkpoint ${cp.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Town Share Code */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Export Full Town Code</div>
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
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950"
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

              {/* Individual Building & Train Codes */}
              <div className="space-y-1.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Blueprint Codes</div>
                {proceduralBuildings.slice(0, 5).map((s) => {
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
                        <div className="truncate font-medium text-white">{s.blueprint!.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {s.blueprint!.floors}F · {s.blueprint!.roofStyle}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyCode(`b-${s.plotId}`, code)}
                        className="min-h-[32px] shrink-0 rounded-lg border border-white/15 px-2.5 text-[11px] text-slate-200"
                      >
                        {copiedId === `b-${s.plotId}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  );
                })}
                {effectiveTrains.map((t, idx) => {
                  const code = encodeBlueprintShareCode({ kind: 'train', blueprint: t });
                  return (
                    <div
                      key={`t-${idx}`}
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
                        className="min-h-[32px] shrink-0 rounded-lg border border-white/15 px-2.5 text-[11px] text-slate-200"
                      >
                        {copiedId === `t-${idx}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Paste & Import */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="font-semibold text-white">Import Share Code</div>
                <textarea
                  rows={3}
                  value={importDraft}
                  onChange={(e) => setImportDraft(e.target.value)}
                  placeholder="Paste ALDER-BLDG:..., ALDER-TRAIN:..., or ALDER-TOWN:..."
                  className="w-full rounded-lg border border-white/15 bg-slate-950 p-2.5 font-mono text-[11px] text-white placeholder:text-slate-500"
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
        </div>
      </aside>
    </div>
  );
}
