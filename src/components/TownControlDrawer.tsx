import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BatteryCharging,
  BookOpen,
  Bookmark,
  Bus,
  Camera,
  Check,
  CheckSquare,
  ClipboardCheck,
  CloudSun,
  Coffee,
  Coins,
  Compass,
  Copy,
  Cpu,
  Dices,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FastForward,
  FileJson,
  Flame,
  Footprints,
  Globe,
  Grid3x3,
  Hammer,
  Handshake,
  Landmark,
  Layers,
  Leaf,
  Map as MapIcon,
  MapPin,
  Medal,
  Minus,
  Package,
  PartyPopper,
  PiggyBank,
  Plus,
  Radio,
  Redo2,
  RefreshCw,
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
  Trophy,
  Undo2,
  UserCheck,
  Users,
  Video,
  Volume2,
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
  HARBOR_CRUISE_DAILY_TOURISTS,
  HARBOR_CRUISE_REVENUE_PER_TURN,
  HARBOR_UNLOCK_COST_GOLD,
  ISLAND_DEFENSE_COST_GOLD,
  ISLAND_RESORT_COST_GOLD,
  ISLAND_RESORT_DAILY_TOURISTS,
  ISLAND_RESORT_REVENUE_PER_TURN,
  MEGAPROJECT_CATALOG,
  SUBWAY_BUILD_COST_CRYSTAL,
  SUBWAY_BUILD_COST_GOLD,
  SUBWAY_REVENUE_PER_TURN,
  TECH_UPGRADES,
  TRADE_PACT_CATALOG,
} from '../lib/townSystems.ts';
import {
  computeTownHousingCapacity,
  DEFAULT_TRAIN_BLUEPRINT,
  generateFallbackTrainBlueprint,
  getAvailablePlotIds,
  PLOT_META,
  type ActiveFestivalState,
  type ActiveMayorMandate,
  type AgentId,
  type AgentRecord,
  type AgentShiftMode,
  type AutopilotRules,
  type BiomeId,
  type CameraBookmark,
  type CameraMode,
  type CameraNudgeAction,
  type CinemaFilterMode,
  type CitizenSentimentItem,
  type CivicQuestItem,
  type CouncilDebateOption,
  type CouncilDebateProposal,
  type CreditRatingSummary,
  type DistrictZoneType,
  type EcoScoreSummary,
  type EmergencyEventOption,
  type EmergencyEventState,
  type FestivalKind,
  type GraphicsQuality,
  type HeatmapMode,
  type JournalEntry,
  type LampMood,
  type MarketPricesState,
  type MayorTodoItem,
  type MegaprojectId,
  type MiniGameMode,
  type MunicipalLoanState,
  type PlotId,
  type RadioNewsItem,
  type TechUpgradeId,
  type TimeOfDay,
  type TourismSummary,
  type TownCheckpointSlot,
  type TownEconomySummary,
  type TownElectionState,
  type TownEraId,
  type TownEraSummary,
  type TownHistoryPoint,
  type TownNeedsSummary,
  type TownResources,
  type TownStructure,
  type TownTheme,
  type TownTrophyItem,
  type TradePactId,
  type TrainBlueprint,
  type TrainStyle,
  type UtilityGridSummary,
  type WeatherForecastItem,
  type WeatherMode,
} from '../types/town.ts';

export type StudioTab =
  | 'economy'
  | 'frontier'
  | 'play'
  | 'world'
  | 'wonders'
  | 'utilities'
  | 'market'
  | 'tech'
  | 'rail'
  | 'council'
  | 'citizens'
  | 'camera'
  | 'trophies'
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
  // Batch 4: 30 Creative 3D Marvels, Megaprojects, Diplomacy, Studio & Trophies
  airshipEnabled: boolean;
  onToggleAirship: (next: boolean) => void;
  skyTramEnabled: boolean;
  onToggleSkyTram: (next: boolean) => void;
  meteorShowerEnabled: boolean;
  onToggleMeteorShower: (next: boolean) => void;
  onTriggerMeteorShower: () => void;
  searchlightsEnabled: boolean;
  onToggleSearchlights: (next: boolean) => void;
  rainbowEnabled: boolean;
  onToggleRainbow: (next: boolean) => void;
  firefliesEnabled: boolean;
  onToggleFireflies: (next: boolean) => void;
  holoEmblemEnabled: boolean;
  onToggleHoloEmblem: (next: boolean) => void;
  birdsEnabled: boolean;
  onToggleBirds: (next: boolean) => void;
  satelliteEnabled: boolean;
  onToggleSatellite: (next: boolean) => void;
  cinemaFilter: CinemaFilterMode;
  onChangeCinemaFilter: (mode: CinemaFilterMode) => void;
  photoGridOverlay: boolean;
  onTogglePhotoGrid: (next: boolean) => void;
  postcardCaption: string;
  onChangePostcardCaption: (caption: string) => void;
  autoTurntable: boolean;
  onToggleAutoTurntable: (next: boolean) => void;
  onJumpLandmark: (target: 'town_hall' | 'rail' | 'plaza' | 'reset') => void;
  soundVolume: number;
  onChangeSoundVolume: (vol: number) => void;
  onPlayTestChime: () => void;
  savingsVaultGold: number;
  onVaultTransfer: (delta: number) => string;
  taxHolidayTurnsLeft: number;
  onStartTaxHoliday: () => string;
  canClaimGrant: boolean;
  turnsUntilGrant: number;
  onClaimGrant: () => string;
  ecoScore: EcoScoreSummary;
  weatherForecast: WeatherForecastItem[];
  megaprojectProgress: Partial<Record<MegaprojectId, number>>;
  onInvestMegaproject: (id: MegaprojectId) => string;
  activeTradePacts: TradePactId[];
  onToggleTradePact: (id: TradePactId) => string;
  onTransmuteResource: (dir: 'to_crystal' | 'from_crystal') => string;
  awardedMedalAgentIds: AgentId[];
  onToggleMedal: (agentId: AgentId) => string;
  onRushAllConstruction: () => string;
  journalEntries: JournalEntry[];
  onAddJournalEntry: (text: string) => void;
  onDeleteJournalEntry: (id: string) => void;
  trophies: TownTrophyItem[];
  onSurpriseAtmosphere: () => string;
  onResetVisuals: () => string;
  onDownloadBackupJson: () => string;
  // Batch 5: Subway X-Ray, Coastal Harbor, Elections, Live Radio, 3D Mini-Games & Living Eras
  subwayBuilt: boolean;
  undergroundXray: boolean;
  onBuildSubway: () => string;
  onToggleUndergroundXray: () => void;
  onFocusUnderground: () => void;
  harborUnlocked: boolean;
  islandResortBuilt: boolean;
  islandDefenseBuilt: boolean;
  onUnlockHarbor: () => string;
  onBuildIslandResort: () => string;
  onBuildIslandDefense: () => string;
  onFocusHarbor: () => void;
  activeElection: TownElectionState | null;
  activeMandate: ActiveMayorMandate | null;
  onCallElection: () => string;
  onVoteElection: (candidateId: string | null) => string;
  radioTickerEnabled: boolean;
  radioVoiceEnabled: boolean;
  radioHeadlines: RadioNewsItem[];
  onToggleRadioTicker: (next: boolean) => void;
  onToggleRadioVoice: (next: boolean) => void;
  onBroadcastRadioNow: () => void;
  townEraSummary: TownEraSummary;
  eraOverride: 'auto' | TownEraId;
  onChangeEraOverride: (next: 'auto' | TownEraId) => void;
  miniGameBestScores: Record<'train_driver' | 'turret_defense' | 'drone_hunt', number>;
  onStartMiniGame: (mode: Exclude<MiniGameMode, 'none'>) => void;
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
  airshipEnabled,
  onToggleAirship,
  skyTramEnabled,
  onToggleSkyTram,
  meteorShowerEnabled,
  onToggleMeteorShower,
  onTriggerMeteorShower,
  searchlightsEnabled,
  onToggleSearchlights,
  rainbowEnabled,
  onToggleRainbow,
  firefliesEnabled,
  onToggleFireflies,
  holoEmblemEnabled,
  onToggleHoloEmblem,
  birdsEnabled,
  onToggleBirds,
  satelliteEnabled,
  onToggleSatellite,
  cinemaFilter,
  onChangeCinemaFilter,
  photoGridOverlay,
  onTogglePhotoGrid,
  postcardCaption,
  onChangePostcardCaption,
  autoTurntable,
  onToggleAutoTurntable,
  onJumpLandmark,
  soundVolume,
  onChangeSoundVolume,
  onPlayTestChime,
  savingsVaultGold,
  onVaultTransfer,
  taxHolidayTurnsLeft,
  onStartTaxHoliday,
  canClaimGrant,
  turnsUntilGrant,
  onClaimGrant,
  ecoScore,
  weatherForecast,
  megaprojectProgress,
  onInvestMegaproject,
  activeTradePacts,
  onToggleTradePact,
  onTransmuteResource,
  awardedMedalAgentIds,
  onToggleMedal,
  onRushAllConstruction,
  journalEntries,
  onAddJournalEntry,
  onDeleteJournalEntry,
  trophies,
  onSurpriseAtmosphere,
  onResetVisuals,
  onDownloadBackupJson,
  subwayBuilt,
  undergroundXray,
  onBuildSubway,
  onToggleUndergroundXray,
  onFocusUnderground,
  harborUnlocked,
  islandResortBuilt,
  islandDefenseBuilt,
  onUnlockHarbor,
  onBuildIslandResort,
  onBuildIslandDefense,
  onFocusHarbor,
  activeElection,
  activeMandate,
  onCallElection,
  onVoteElection,
  radioTickerEnabled,
  radioVoiceEnabled,
  radioHeadlines,
  onToggleRadioTicker,
  onToggleRadioVoice,
  onBroadcastRadioNow,
  townEraSummary,
  eraOverride,
  onChangeEraOverride,
  miniGameBestScores,
  onStartMiniGame,
}: TownControlDrawerProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [timelineIdx, setTimelineIdx] = useState<number>(Math.max(0, history.length - 1));
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
  const [journalDraft, setJournalDraft] = useState('');
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
  const unlockedTrophyCount = trophies.filter((t) => t.unlocked).length;
  const inProgressBuildCount = structures.filter((s) => s.status === 'building').length;

  const TABS: Array<{ id: StudioTab; label: string; Icon: typeof Coins }> = [
    { id: 'economy', label: 'Economy', Icon: Coins },
    { id: 'frontier', label: 'Metro & Harbor', Icon: Layers },
    { id: 'play', label: 'Play & Eras', Icon: Dices },
    { id: 'world', label: activeFestival ? 'World (Fest)' : 'World', Icon: Globe },
    { id: 'wonders', label: 'Wonders', Icon: Landmark },
    { id: 'utilities', label: 'Grid', Icon: Zap },
    { id: 'market', label: unclaimedQuestCount > 0 ? `Market (${unclaimedQuestCount})` : 'Market', Icon: Store },
    { id: 'tech', label: 'Tech', Icon: Cpu },
    { id: 'rail', label: 'Rail', Icon: TrainFront },
    { id: 'council', label: activeElection?.status === 'open' ? 'Council (Vote!)' : 'Council', Icon: Scale },
    { id: 'citizens', label: 'Citizens', Icon: Users },
    { id: 'camera', label: 'Camera', Icon: Camera },
    { id: 'trophies', label: `Awards (${unlockedTrophyCount})`, Icon: Trophy },
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
                {inProgressBuildCount > 0 && (
                  <button
                    type="button"
                    onClick={() => flashStatus(onRushAllConstruction())}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>
                      Rush All {inProgressBuildCount} Active Build{inProgressBuildCount === 1 ? '' : 's'} (-{inProgressBuildCount * 40}g)
                    </span>
                  </button>
                )}
              </div>

              {/* Protected Savings Vault (+4%/turn) & Tax Holiday & Regional Grant */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <PiggyBank className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Municipal Savings Vault</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-emerald-300">
                    {savingsVaultGold}g · +4%/turn
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => flashStatus(onVaultTransfer(100))}
                    className="min-h-[44px] rounded-xl border border-emerald-400/40 bg-emerald-500/15 font-semibold text-emerald-200 hover:bg-emerald-500/25"
                  >
                    Deposit +100g
                  </button>
                  <button
                    type="button"
                    onClick={() => flashStatus(onVaultTransfer(-100))}
                    className="min-h-[44px] rounded-xl border border-white/15 bg-slate-950 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Withdraw 100g
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={taxHolidayTurnsLeft > 0}
                    onClick={() => flashStatus(onStartTaxHoliday())}
                    className="min-h-[44px] rounded-xl border border-amber-400/40 bg-amber-500/15 px-2 text-[11px] font-semibold text-amber-200 disabled:opacity-50"
                  >
                    {taxHolidayTurnsLeft > 0
                      ? `Tax Holiday (${taxHolidayTurnsLeft}t)`
                      : 'Tax Holiday (3t)'}
                  </button>
                  <button
                    type="button"
                    disabled={!canClaimGrant}
                    onClick={() => flashStatus(onClaimGrant())}
                    className="min-h-[44px] rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-2 text-[11px] font-semibold text-cyan-200 disabled:opacity-45"
                  >
                    {canClaimGrant ? 'Claim Dev Grant' : `Grant in ${turnsUntilGrant}t`}
                  </button>
                </div>
              </div>

              {/* Eco-Sustainability Index */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Leaf className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Eco-Sustainability Index</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-emerald-300">
                    {ecoScore.score}% · {ecoScore.label}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${ecoScore.score}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{ecoScore.tip}</p>
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

          {/* WORLD TAB: 3-TURN WEATHER FORECAST, SURPRISE ME!, 12 LIVE 3D WORLD MARVELS, LIGHTING & FESTIVALS */}
          {tab === 'world' && (
            <>
              {/* 3-Turn Weather Forecast + Surprise Me! */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <CloudSun className="h-3.5 w-3.5 text-sky-300" />
                    <span>3-Turn Weather Forecast</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => flashStatus(onSurpriseAtmosphere())}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    <Dices className="h-3.5 w-3.5" />
                    <span>Surprise Me!</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {weatherForecast.map((f) => (
                    <div
                      key={f.turnsAhead}
                      className="rounded-xl border border-white/10 bg-slate-950 p-2"
                    >
                      <div className="font-mono-tabular text-[10px] text-amber-300">
                        +{f.turnsAhead} Turn{f.turnsAhead > 1 ? 's' : ''}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-semibold text-white">
                        {f.label}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-400">
                        {f.hint}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">3D World Marvels & Living Sky</span>
                  <button
                    type="button"
                    onClick={() => {
                      onTriggerMeteorShower();
                      flashStatus('Launched Starlight Meteor Shower across the sky!');
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Meteors Now</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      {
                        label: 'Grand Zephyr Airship',
                        sub: 'Luxury skyline blimp (+30 tourists/day)',
                        enabled: airshipEnabled,
                        onToggle: () => onToggleAirship(!airshipEnabled),
                      },
                      {
                        label: 'Sky Gondola Cable-Car Line',
                        sub: 'Glass cable car gliding across town (+18 tourists/day)',
                        enabled: skyTramEnabled,
                        onToggle: () => onToggleSkyTram(!skyTramEnabled),
                      },
                      {
                        label: 'Post-Rain Rainbow Arch',
                        sub: '5-band rainbow arching over the horizon (+18 tourists/day)',
                        enabled: rainbowEnabled,
                        onToggle: () => onToggleRainbow(!rainbowEnabled),
                      },
                      {
                        label: 'Starlight Meteor Shower',
                        sub: 'Shooting star streaks across twilight & night skies',
                        enabled: meteorShowerEnabled,
                        onToggle: () => onToggleMeteorShower(!meteorShowerEnabled),
                      },
                      {
                        label: 'Twin Gala Searchlights',
                        sub: 'Sweeping festival spotlight beams from central square',
                        enabled: searchlightsEnabled,
                        onToggle: () => onToggleSearchlights(!searchlightsEnabled),
                      },
                      {
                        label: 'Golden Fireflies Swarm',
                        sub: 'Glowing fireflies drifting around town gardens at night',
                        enabled: firefliesEnabled,
                        onToggle: () => onToggleFireflies(!firefliesEnabled),
                      },
                      {
                        label: 'Floating Holo Town Emblem',
                        sub: 'Rotating holographic crest spire hovering above Town Hall',
                        enabled: holoEmblemEnabled,
                        onToggle: () => onToggleHoloEmblem(!holoEmblemEnabled),
                      },
                      {
                        label: 'Instanced Soaring Birds Flock',
                        sub: '24 low-poly swallows banking smoothly in sky thermals',
                        enabled: birdsEnabled,
                        onToggle: () => onToggleBirds(!birdsEnabled),
                      },
                      {
                        label: 'Orbiting Civic Satellite',
                        sub: 'Solar-winged weather & comms satellite high overhead',
                        enabled: satelliteEnabled,
                        onToggle: () => onToggleSatellite(!satelliteEnabled),
                      },
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
                      className={`flex min-h-[46px] items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-left transition-colors ${
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

          {/* NEW TAB: MULTI-STAGE TOWN MEGAPROJECTS & SISTER-CITY TRADE PACTS */}
          {tab === 'wonders' && (
            <>
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Landmark className="h-3.5 w-3.5 text-amber-300" />
                    <span>Multi-Stage World Wonders</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-cyan-300">
                    {economy.treasuryGold}g · {resources.crystal}C
                  </span>
                </div>
                <div className="space-y-2">
                  {MEGAPROJECT_CATALOG.map((mp) => {
                    const pct = Math.min(100, megaprojectProgress[mp.id] ?? 0);
                    const done = pct >= 100;
                    return (
                      <div
                        key={mp.id}
                        className={`rounded-xl border p-2.5 ${
                          done
                            ? 'border-amber-400/50 bg-amber-500/10'
                            : 'border-white/10 bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{mp.label}</span>
                          <span className="font-mono-tabular text-[11px] font-semibold text-amber-300">
                            {pct}%
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">{mp.summary}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${done ? 'bg-amber-400' : 'bg-cyan-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {done ? (
                          <div className="mt-2 text-[11px] font-semibold text-amber-300">
                            Wonder Complete · Permanent Dividend Active
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => flashStatus(onInvestMegaproject(mp.id))}
                            className="mt-2 min-h-[40px] w-full rounded-xl bg-amber-500 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                          >
                            Invest +25% ({mp.stageCostGold}g · {mp.stageCostCrystal} Crystal)
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sister-City Trade Pacts */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Handshake className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Sister-City Trade Pacts ({activeTradePacts.length}/3)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {TRADE_PACT_CATALOG.map((pact) => {
                    const active = activeTradePacts.includes(pact.id);
                    return (
                      <div
                        key={pact.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                          active
                            ? 'border-emerald-400/40 bg-emerald-500/10'
                            : 'border-white/10 bg-slate-950'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{pact.cityName}</div>
                          <div className="text-[10px] text-slate-400">{pact.summary}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => flashStatus(onToggleTradePact(pact.id))}
                          className={`min-h-[40px] shrink-0 rounded-xl px-3 text-[11px] font-semibold ${
                            active
                              ? 'border border-rose-400/40 bg-rose-500/15 text-rose-200'
                              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          }`}
                        >
                          {active ? 'Cancel' : `Sign -${pact.signingFeeGold}g`}
                        </button>
                      </div>
                    );
                  })}
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

              {/* Civic Refinery / Resource Transmuter */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Civic Refinery & Resource Transmuter</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => flashStatus(onTransmuteResource('to_crystal'))}
                    className="min-h-[44px] rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-2.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    12 T/S/H → +3 Crystal
                  </button>
                  <button
                    type="button"
                    onClick={() => flashStatus(onTransmuteResource('from_crystal'))}
                    className="min-h-[44px] rounded-xl border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    3 Crystal → +10 T/S/H
                  </button>
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

          {/* TAB 6: COUNCIL DEBATES, ELECTIONS, RADIO, EMERGENCIES & 3D FIREWORKS SHOW */}
          {tab === 'council' && (
            <>
              {/* Live Villager Elections & AI Political Campaigns */}
              <div className="space-y-2.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">Live Villager Elections</div>
                    <div className="text-[11px] text-cyan-200/80">
                      Every 15 turns · Winning Mayor grants 15-turn civic mandate
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => flashStatus(onCallElection())}
                    className="min-h-[40px] shrink-0 rounded-xl bg-cyan-400 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 hover:bg-cyan-300"
                  >
                    Call Election
                  </button>
                </div>

                {activeMandate && (
                  <div className="rounded-lg border border-white/15 bg-slate-950/80 px-2.5 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">
                        Mandate: {activeMandate.mayorName} · {activeMandate.platformTitle}
                      </span>
                      <span className="shrink-0 font-semibold text-amber-300 tabular-nums">
                        {activeMandate.turnsLeft}t left
                      </span>
                    </div>
                    <div className="mt-0.5 text-emerald-300">{activeMandate.buffSummary}</div>
                  </div>
                )}

                {activeElection && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-cyan-200">
                      {activeElection.status === 'open'
                        ? `Ballots Open (Turn ${activeElection.turnStarted}) — Cast Deciding Vote:`
                        : `Election Results (Turn ${activeElection.turnStarted}):`}
                    </div>
                    {activeElection.candidates.map((cand) => {
                      const isWinner = activeElection.winnerId === cand.id;
                      return (
                        <div
                          key={cand.id}
                          className={`rounded-xl border p-2.5 ${
                            isWinner
                              ? 'border-emerald-400/60 bg-emerald-500/15'
                              : 'border-white/10 bg-slate-950/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-white">
                                {cand.name} ·{' '}
                                <span style={{ color: cand.color }}>{cand.platformTitle}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">"{cand.slogan}"</div>
                            </div>
                            {activeElection.status === 'open' ? (
                              <button
                                type="button"
                                onClick={() => flashStatus(onVoteElection(cand.id))}
                                className="min-h-[40px] shrink-0 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                              >
                                Vote
                              </button>
                            ) : (
                              <span className="shrink-0 text-xs font-bold text-emerald-300 tabular-nums">
                                {cand.votes} votes{isWinner ? ' · Won' : ''}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-emerald-300">{cand.buffSummary}</div>
                        </div>
                      );
                    })}
                    {activeElection.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => flashStatus(onVoteElection(null))}
                        className="min-h-[44px] w-full rounded-xl border border-white/15 bg-slate-900 font-semibold text-slate-100 hover:bg-slate-800"
                      >
                        Let Citizens Vote Automatically
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Breaking News Broadcast & Live Town Radio */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Radio className="h-3.5 w-3.5 text-amber-300" />
                    <span>Live Town Radio & Broadcasts</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onBroadcastRadioNow();
                      flashStatus('Broadcasting latest Town Radio headline!');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Broadcast</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleRadioTicker(!radioTickerEnabled)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                      radioTickerEnabled
                        ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200'
                        : 'border-white/10 bg-slate-950 text-slate-400'
                    }`}
                  >
                    Ticker: {radioTickerEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleRadioVoice(!radioVoiceEnabled)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                      radioVoiceEnabled
                        ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-slate-950 text-slate-400'
                    }`}
                  >
                    Voice AI: {radioVoiceEnabled ? 'ON' : 'Muted'}
                  </button>
                </div>
                {radioHeadlines.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-white/5 bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-300"
                  >
                    <span className="mr-1.5 font-bold text-amber-300">[{item.tag}]</span>
                    {item.text}
                  </div>
                ))}
              </div>

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
                    const hasMedal = awardedMedalAgentIds.includes(agent.id);
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate font-semibold text-white">
                            <span className="truncate">{agent.name}</span>
                            {hasMedal && (
                              <Medal className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                            )}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {agent.role}
                            {hasMedal ? ' · Medal (+12g/t)' : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => flashStatus(onToggleMedal(agent.id))}
                            title={
                              hasMedal
                                ? 'Revoke Mayor Medal of Honor'
                                : 'Award Mayor Medal of Honor (+12g/turn)'
                            }
                            aria-label={`Toggle Medal of Honor for ${agent.name}`}
                            className={`flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border ${
                              hasMedal
                                ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                                : 'border-white/10 text-slate-400 hover:text-amber-300'
                            }`}
                          >
                            <Medal className="h-3.5 w-3.5" />
                          </button>
                          {(['normal', 'overtime', 'rest'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => onSetAgentShift(agent.id, m)}
                              className={`min-h-[34px] rounded-md px-2 text-[10px] font-semibold ${
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
                    onClick={() => onToggleAutoTurntable(!autoTurntable)}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${
                      autoTurntable
                        ? 'border-amber-400 bg-amber-500 text-slate-950'
                        : 'border-white/15 bg-slate-950 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{autoTurntable ? 'Turntable On' : 'Auto Turntable'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onTogglePhotoGrid(!photoGridOverlay)}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${
                      photoGridOverlay
                        ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                        : 'border-white/15 bg-slate-950 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Grid3x3 className="h-3.5 w-3.5" />
                    <span>{photoGridOverlay ? 'Photo Grid On' : 'Rule of 3rds'}</span>
                  </button>
                </div>

                {/* Live 3D Cinema Color Grading Filter */}
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                    Live Cinema Color Grading
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'none' as CinemaFilterMode, label: 'Natural' },
                        { id: 'warm_film' as CinemaFilterMode, label: 'Warm Film' },
                        { id: 'noir' as CinemaFilterMode, label: 'Noir B&W' },
                        { id: 'cyber_vivid' as CinemaFilterMode, label: 'Cyber Vivid' },
                        { id: 'pastel_dream' as CinemaFilterMode, label: 'Pastel' },
                        { id: 'vintage' as CinemaFilterMode, label: 'Vintage' },
                      ] as const
                    ).map((cf) => (
                      <button
                        key={cf.id}
                        type="button"
                        onClick={() => onChangeCinemaFilter(cf.id)}
                        className={`min-h-[38px] rounded-xl border text-[11px] font-semibold transition-colors ${
                          cinemaFilter === cf.id
                            ? 'border-amber-400 bg-amber-500 text-slate-950'
                            : 'border-white/10 bg-slate-950 text-slate-300 hover:text-white'
                        }`}
                      >
                        {cf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* One-Tap Landmark Camera Jump Strip */}
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                    One-Tap Landmark Focus
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'town_hall' as const, label: 'Hall' },
                        { id: 'rail' as const, label: 'Rail' },
                        { id: 'plaza' as const, label: 'Plaza' },
                        { id: 'reset' as const, label: 'Reset' },
                      ] as const
                    ).map((lm) => (
                      <button
                        key={lm.id}
                        type="button"
                        onClick={() => {
                          onJumpLandmark(lm.id);
                          flashStatus(`Framed ${lm.label}.`);
                        }}
                        className="min-h-[40px] rounded-xl border border-white/15 bg-slate-950 text-[11px] font-semibold text-slate-200 active:bg-amber-500 active:text-slate-950"
                      >
                        {lm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Postcard Caption */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">
                    Custom Postcard Caption Stamp
                  </label>
                  <input
                    type="text"
                    maxLength={70}
                    value={postcardCaption}
                    onChange={(e) => onChangePostcardCaption(e.target.value)}
                    placeholder="Optional caption stamped on snapped postcards..."
                    className="min-h-[42px] w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white placeholder:text-slate-500"
                  />
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

          {/* NEW TAB: 12-BADGE TOWN ACHIEVEMENT TROPHY SHELF */}
          {tab === 'trophies' && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Trophy className="h-4 w-4 text-amber-300" />
                  <span>Town Trophy Shelf</span>
                </div>
                <span className="font-mono-tabular text-xs font-semibold text-amber-300">
                  {unlockedTrophyCount}/{trophies.length} Unlocked
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{
                    width: `${Math.round((unlockedTrophyCount / Math.max(1, trophies.length)) * 100)}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {trophies.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-xl border p-2.5 ${
                      t.unlocked
                        ? 'border-amber-400/50 bg-amber-500/10'
                        : 'border-white/10 bg-slate-950/80 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Trophy
                        className={`h-3.5 w-3.5 shrink-0 ${
                          t.unlocked ? 'text-amber-300' : 'text-slate-600'
                        }`}
                      />
                      <span
                        className={`font-mono-tabular text-[10px] font-semibold ${
                          t.unlocked ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        {t.progressLabel}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-white">{t.title}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                      {t.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOOLS TAB: FPS HEALTH, VOLUME MIXER, CHECKLIST, MAYOR JOURNAL, EMBLEM, RESET & JSON BACKUP */}
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

              {/* Master Soundscape Volume Mixer & Test Chime */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Volume2 className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Master Soundscape Volume</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    {soundVolume}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={soundVolume}
                    onChange={(e) => onChangeSoundVolume(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onPlayTestChime();
                      flashStatus(`Tested sound chime at ${soundVolume}%.`);
                    }}
                    className="min-h-[38px] shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 text-[11px] font-semibold text-cyan-200"
                  >
                    Test
                  </button>
                </div>
              </div>

              {/* Mayor's Civic Journal / Timestamped Diary */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <BookOpen className="h-3.5 w-3.5 text-amber-300" />
                  <span>Mayor&apos;s Civic Journal ({journalEntries.length})</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = journalDraft.trim();
                    if (!clean) return;
                    onAddJournalEntry(clean);
                    setJournalDraft('');
                    flashStatus('Logged entry in Mayor Journal.');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    maxLength={140}
                    value={journalDraft}
                    onChange={(e) => setJournalDraft(e.target.value)}
                    placeholder="Record town strategy note..."
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white"
                  />
                  <button
                    type="submit"
                    aria-label="Add journal entry"
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
                {journalEntries.length > 0 && (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {journalEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono-tabular text-[10px] text-amber-300">
                            Turn {entry.turn}
                          </div>
                          <div className="text-[11px] leading-snug text-slate-200">{entry.text}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteJournalEntry(entry.id)}
                          aria-label="Delete journal entry"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* One-Tap Town Report Card, Direct JSON Backup & Visual Reset */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="font-semibold text-white">Export, Backup & Clean Visual Reset</div>
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => flashStatus(onDownloadBackupJson())}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                  >
                    <FileJson className="h-4 w-4 shrink-0" />
                    <span>Download .JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => flashStatus(onResetVisuals())}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-950 px-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <RotateCcw className="h-4 w-4 shrink-0" />
                    <span>Reset Visuals</span>
                  </button>
                </div>
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

          {/* NEW TAB: UNDERGROUND SUBWAY METRO & 3D COASTAL HARBOR EXPANSION */}
          {tab === 'frontier' && (
            <>
              {/* 1. Interactive 3D Underground & Subway Metro */}
              <div className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">3D Underground & Subway Metro</div>
                    <div className="text-[11px] text-cyan-200/85">
                      X-Ray transparent streets · Water/Power mains · Twin underground metro trains
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-cyan-300 tabular-nums">
                    {subwayBuilt ? `+${SUBWAY_REVENUE_PER_TURN}g/t` : 'Locked'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleUndergroundXray();
                      flashStatus(
                        !undergroundXray
                          ? 'X-Ray Underground ON — looking through streets!'
                          : 'Returned to solid surface terrain.',
                      );
                    }}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl font-semibold ${
                      undergroundXray
                        ? 'bg-cyan-400 text-slate-950'
                        : 'border border-cyan-400/40 bg-slate-950 text-cyan-200 hover:bg-slate-900'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    <span>{undergroundXray ? 'X-Ray: ON' : 'Toggle X-Ray'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFocusUnderground();
                      onClose();
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-950 font-semibold text-slate-100 hover:bg-slate-900"
                  >
                    <Eye className="h-4 w-4 text-cyan-300" />
                    <span>Inspect Below</span>
                  </button>
                </div>

                {!subwayBuilt ? (
                  <button
                    type="button"
                    onClick={() => flashStatus(onBuildSubway())}
                    className="min-h-[46px] w-full rounded-xl bg-amber-500 px-3 font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    Construct Subway Metro Loop ({SUBWAY_BUILD_COST_GOLD}g + {SUBWAY_BUILD_COST_CRYSTAL} Crystal)
                  </button>
                ) : (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-200">
                    Subway Metro Operational · 4 Lit Subterranean Stations + Twin Trains (+{SUBWAY_REVENUE_PER_TURN}g/turn)
                  </div>
                )}
              </div>

              {/* 2. 3D Coastal Harbor, Cruise Ship & Offshore Paradise Island */}
              <div className="space-y-3 rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">Coastal Harbor & Offshore Island</div>
                    <div className="text-[11px] text-sky-200/85">
                      Striped Lighthouse · Animated Cruise Ship · Arch Bridge · Island Resort
                    </div>
                  </div>
                  {harborUnlocked && (
                    <button
                      type="button"
                      onClick={() => {
                        onFocusHarbor();
                        onClose();
                      }}
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-xl bg-sky-400 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-300"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>Harbor Cam</span>
                    </button>
                  )}
                </div>

                {!harborUnlocked ? (
                  <button
                    type="button"
                    onClick={() => flashStatus(onUnlockHarbor())}
                    className="min-h-[46px] w-full rounded-xl bg-sky-400 px-3 font-semibold text-slate-950 hover:bg-sky-300"
                  >
                    Unlock Coastal Harbor & Cruise Pier ({HARBOR_UNLOCK_COST_GOLD}g)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-sky-400/30 bg-slate-950/75 px-2.5 py-2 text-[11px] text-sky-200">
                      Grand Cruise Ship Active · +{HARBOR_CRUISE_DAILY_TOURISTS} daily tourists · +{HARBOR_CRUISE_REVENUE_PER_TURN}g/turn
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        disabled={islandResortBuilt}
                        onClick={() => flashStatus(onBuildIslandResort())}
                        className={`min-h-[46px] rounded-xl px-3 text-left text-xs font-semibold ${
                          islandResortBuilt
                            ? 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                            : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        }`}
                      >
                        {islandResortBuilt
                          ? `Offshore Luxury Island Resort Built (+${ISLAND_RESORT_DAILY_TOURISTS} tourists · +${ISLAND_RESORT_REVENUE_PER_TURN}g/t)`
                          : `Build Offshore Island Luxury Resort (${ISLAND_RESORT_COST_GOLD}g · +${ISLAND_RESORT_REVENUE_PER_TURN}g/t)`}
                      </button>
                      <button
                        type="button"
                        disabled={islandDefenseBuilt}
                        onClick={() => flashStatus(onBuildIslandDefense())}
                        className={`min-h-[46px] rounded-xl px-3 text-left text-xs font-semibold ${
                          islandDefenseBuilt
                            ? 'border border-cyan-400/35 bg-cyan-500/15 text-cyan-200'
                            : 'border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
                        }`}
                      >
                        {islandDefenseBuilt
                          ? 'Coastal Missile Battery Active (Radar & Air-Raid Shield)'
                          : `Build Coastal Missile Battery (${ISLAND_DEFENSE_COST_GOLD}g · Boosts Defense)`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* NEW TAB: 3 INTERACTIVE 3D MINI-GAMES, LIVING ERAS & TIMELINE REPLAY */}
          {tab === 'play' && (
            <>
              {/* 1. 3 Interactive 3D Mini-Games */}
              <div className="space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <div>
                  <div className="font-semibold text-white">3D Town Mini-Games</div>
                  <div className="text-[11px] text-amber-200/85">
                    45-second interactive challenges right inside your 3D town · Win real Gold & Crystal!
                  </div>
                </div>

                {[
                  {
                    id: 'train_driver' as const,
                    title: 'Drive the Express Train',
                    desc: 'Take the Cab POV throttle, blow the horn & stop cleanly in Alderbrook Station Zone!',
                    reward: '+18g per perfect stop',
                    best: miniGameBestScores.train_driver,
                    accent: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
                  },
                  {
                    id: 'turret_defense' as const,
                    title: 'Turret Air Defense',
                    desc: 'Tap incoming red raider drones in 3D or fire auto-lock interceptor laser volleys!',
                    reward: '+14g & Crystal per 3 hits',
                    best: miniGameBestScores.turret_defense,
                    accent: 'bg-rose-500 text-white hover:bg-rose-400',
                  },
                  {
                    id: 'drone_hunt' as const,
                    title: 'Drone Sky Treasure Hunt',
                    desc: 'Spot & tap 8 glowing golden 3D sky crates hovering around town landmarks!',
                    reward: '+16g & +1 Crystal per 2 crates',
                    best: miniGameBestScores.drone_hunt,
                    accent: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
                  },
                ].map((game) => (
                  <div
                    key={game.id}
                    className="space-y-2 rounded-xl border border-white/10 bg-slate-950/85 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{game.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{game.desc}</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-amber-300 tabular-nums">
                        Best: {game.best}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-emerald-300">{game.reward}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onStartMiniGame(game.id);
                          onClose();
                        }}
                        className={`min-h-[44px] shrink-0 rounded-xl px-4 text-xs font-semibold whitespace-nowrap ${game.accent}`}
                      >
                        Play Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 2. Living Town Eras & 3D Architectural Evolution */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">Living Town Era</div>
                    <div className="text-[11px] text-cyan-300">{townEraSummary.label}</div>
                  </div>
                  <span className="text-xs font-bold text-amber-300 tabular-nums">
                    +{townEraSummary.goldBonusPerTurn}g/t
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{townEraSummary.subtitle}</p>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400"
                    style={{ width: `${townEraSummary.progressPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400">{townEraSummary.requirementHint}</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'village', label: 'Village' },
                      { id: 'steam_city', label: 'Steam' },
                      { id: 'neo_metropolis', label: 'Neo' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeEraOverride(opt.id);
                        flashStatus(`Living Era visual style set to ${opt.label}.`);
                      }}
                      className={`min-h-[40px] rounded-xl text-[11px] font-semibold ${
                        eraOverride === opt.id
                          ? 'bg-cyan-400 text-slate-950'
                          : 'border border-white/10 bg-slate-950 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Interactive Town History Timeline Scrubber */}
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white">Town History Timeline Replay</div>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {history.length} snapshot{history.length === 1 ? '' : 's'}
                  </span>
                </div>
                {(() => {
                  const safeIdx = Math.min(Math.max(0, timelineIdx), Math.max(0, history.length - 1));
                  const pt = history[safeIdx];
                  if (!pt) {
                    return <div className="text-[11px] text-slate-400">Advance turns to record timeline history.</div>;
                  }
                  return (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, history.length - 1)}
                        value={safeIdx}
                        onChange={(e) => setTimelineIdx(Number(e.target.value))}
                        aria-label="Scrub town history timeline"
                        className="h-2 w-full accent-amber-400"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                        <span className="font-semibold text-amber-300">Turn {pt.turn}</span>
                        <span>
                          {pt.treasuryGold}g · {pt.population} pop · {pt.buildings} bldgs · {pt.morale}% morale
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
