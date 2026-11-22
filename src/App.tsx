import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Compass,
  FastForward,
  Gauge,
  HelpCircle,
  LogOut,
  Map as MapIcon,
  MessageSquareText,
  Palette,
  Pause,
  Play,
  Radio,
  ScrollText,
  Settings,
  Users,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { AIProvidersModal } from './components/AIProvidersModal.tsx';
import { DecreePanel } from './components/DecreePanel.tsx';
import { HelpGuideModal } from './components/HelpGuideModal.tsx';
import { HierarchyPanel } from './components/HierarchyPanel.tsx';
import { RemoteBridgeModal } from './components/RemoteBridgeModal.tsx';
import { TownLogPanel } from './components/TownLogPanel.tsx';
import { TownMinimap } from './components/TownMinimap.tsx';
import { TownViewport } from './components/TownViewport.tsx';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { soundscape } from './lib/soundscape.ts';
import {
  enqueueRemoteCommand,
  loadOrInitializeTown,
  markRemoteCommandStatus,
  persistAgentNote,
  persistAgentTurn,
  persistEnvironmentSettings,
  persistGodDecree,
  persistHiredWorkers,
  persistRemoteStructureAction,
  persistWeatherShift,
  resetTownInFirestore,
  subscribePendingRemoteCommands,
} from './lib/townStore.ts';
import type { AgentWorldCoord } from './three/townScene.ts';
import {
  ALL_PLOT_IDS,
  ALL_STRUCTURE_TYPES,
  ALL_TOWN_THEMES,
  createHiredAgentRecord,
  createInitialAgents,
  createInitialLogs,
  DEFAULT_PROVIDER_CONFIG,
  DEFAULT_REMOTE_BRIDGE_CONFIG,
  DEFAULT_TOWN_METRICS,
  detectDefaultGraphicsQuality,
  getWeatherSeasonEffect,
  LOCATION_LABELS,
  MAX_TOWN_AGENTS,
  normalizeTownTheme,
  normalizeWeatherMode,
  PLOT_META,
  STRUCTURE_META,
  TOWN_THEME_META,
  type AgentId,
  type AgentRecord,
  type AgentTurnResponse,
  type AIProviderConfig,
  type GraphicsQuality,
  type HiredWorkerSpec,
  type LocationId,
  type PlotId,
  type RemoteBridgeConfig,
  type RemoteCommandRecord,
  type RemoteCommandType,
  type StructureType,
  type TimeOfDay,
  type TownLogItem,
  type TownMetrics,
  type TownStructure,
  type TownTheme,
  type WeatherMode,
} from './types/town.ts';

const PROVIDER_STORAGE_KEY = 'ai_town_provider_settings';
const REMOTE_BRIDGE_STORAGE_KEY = 'alderbrook_remote_bridge_v1';
const LOCAL_TOWN_STORAGE_KEY = 'alderbrook_local_town_v2';
const GRAPHICS_QUALITY_STORAGE_KEY = 'alderbrook_graphics_quality';

const QUALITY_CYCLE: GraphicsQuality[] = ['low', 'medium', 'high'];

function loadGraphicsQuality(): GraphicsQuality {
  try {
    const saved = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      return saved;
    }
  } catch {
    // Ignore storage access issues
  }
  return detectDefaultGraphicsQuality();
}

type MobileTab = 'hierarchy' | 'log' | 'decree';

interface LocalTownSnapshot {
  turnCount: number;
  activeAgentIndex: number;
  activeDecree: string;
  metrics: TownMetrics;
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  theme: TownTheme;
  agents: AgentRecord[];
  structures: TownStructure[];
  logs: TownLogItem[];
}

function clampMetric(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

const TIME_CYCLE: TimeOfDay[] = ['dawn', 'day', 'twilight', 'night'];
const SEASON_CYCLE: WeatherMode[] = ['summer', 'rain', 'winter'];

function createWeatherShiftLog(
  nextWeather: WeatherMode,
  structures: TownStructure[],
  turnNumber: number,
  timestampMs: number,
): TownLogItem {
  const eff = getWeatherSeasonEffect(nextWeather, structures);
  return {
    id: `weather-${turnNumber}-${timestampMs}`,
    turnNumber,
    agentId: 'weather_shift',
    agentName: `Season · ${eff.label}`,
    rank: 0,
    location: 'plaza',
    targetAgent: null,
    thought: eff.shiftDetail,
    dialogue: eff.shiftHeadline,
    newTask: eff.badgeText,
    timestampMs,
  };
}

function loadProviderConfig(): AIProviderConfig {
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AIProviderConfig>;
    return {
      preset: parsed.preset || DEFAULT_PROVIDER_CONFIG.preset,
      baseUrl: parsed.baseUrl || DEFAULT_PROVIDER_CONFIG.baseUrl,
      modelName: parsed.modelName || DEFAULT_PROVIDER_CONFIG.modelName,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
}

function loadRemoteBridgeConfig(): RemoteBridgeConfig {
  try {
    const raw = window.localStorage.getItem(REMOTE_BRIDGE_STORAGE_KEY);
    if (!raw) return DEFAULT_REMOTE_BRIDGE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<RemoteBridgeConfig>;
    return {
      webhookUrl: typeof parsed.webhookUrl === 'string' ? parsed.webhookUrl : '',
      telegramBotToken: typeof parsed.telegramBotToken === 'string' ? parsed.telegramBotToken : '',
      telegramChatId: typeof parsed.telegramChatId === 'string' ? parsed.telegramChatId : '',
      notifyOnBuildComplete: parsed.notifyOnBuildComplete ?? true,
      notifyOnTier3: parsed.notifyOnTier3 ?? true,
      notifyOnWeatherShift: parsed.notifyOnWeatherShift ?? true,
      notifyOnRemoteCommand: parsed.notifyOnRemoteCommand ?? false,
    };
  } catch {
    return DEFAULT_REMOTE_BRIDGE_CONFIG;
  }
}

function parseRemoteWeatherInput(raw: unknown): WeatherMode | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('rain') || s.includes('storm') || s.includes('wet')) return 'rain';
  if (s.includes('winter') || s.includes('snow') || s.includes('frost') || s.includes('cold')) return 'winter';
  if (s.includes('summer') || s.includes('sun') || s.includes('clear') || s.includes('warm')) return 'summer';
  return null;
}

function parseRemoteBuildTarget(
  cmd: RemoteCommandRecord,
  existingStructures: TownStructure[],
): { plotId: PlotId; structureType: StructureType } | null {
  let rawText = '';
  let explicitPlot: PlotId | null = null;
  let explicitStructure: StructureType | null = null;

  if (cmd.payload && typeof cmd.payload === 'object') {
    const p = cmd.payload as Record<string, unknown>;
    const pPlot = String(p.plotId ?? p.plot_id ?? '').trim().toLowerCase();
    const pStruct = String(p.structureType ?? p.structure_type ?? p.structure ?? '').trim().toLowerCase();
    if (ALL_PLOT_IDS.includes(pPlot as PlotId)) explicitPlot = pPlot as PlotId;
    if (ALL_STRUCTURE_TYPES.includes(pStruct as StructureType)) explicitStructure = pStruct as StructureType;
    rawText = String(p.value ?? p.text ?? '').trim().toLowerCase();
  } else {
    rawText = String(cmd.value ?? cmd.payload ?? '').trim().toLowerCase();
  }

  if (!explicitPlot && rawText) {
    for (const pId of ALL_PLOT_IDS) {
      if (rawText.includes(pId)) {
        explicitPlot = pId;
        break;
      }
    }
  }
  if (!explicitStructure && rawText) {
    for (const st of ALL_STRUCTURE_TYPES) {
      const label = STRUCTURE_META[st].label.toLowerCase();
      if (rawText.includes(st) || rawText.includes(label)) {
        explicitStructure = st;
        break;
      }
    }
  }

  const occupiedMap = new Map(existingStructures.map((s) => [s.plotId, s]));
  if (explicitPlot) {
    const existing = occupiedMap.get(explicitPlot);
    return {
      plotId: explicitPlot,
      structureType: explicitStructure || existing?.structureType || 'bakery',
    };
  }

  if (explicitStructure) {
    const matchingExisting = existingStructures.find(
      (s) => s.structureType === explicitStructure && (s.status === 'building' || s.tier < 3),
    );
    if (matchingExisting) {
      return { plotId: matchingExisting.plotId, structureType: explicitStructure };
    }
    const emptyPlot = ALL_PLOT_IDS.find((p) => !occupiedMap.has(p));
    if (emptyPlot) {
      return { plotId: emptyPlot, structureType: explicitStructure };
    }
  }

  const fallbackEmpty = ALL_PLOT_IDS.find((p) => !occupiedMap.has(p));
  if (fallbackEmpty) {
    return { plotId: fallbackEmpty, structureType: explicitStructure || 'bakery' };
  }
  const fallbackUpgradable = existingStructures.find((s) => s.status === 'building' || s.tier < 3);
  if (fallbackUpgradable) {
    return { plotId: fallbackUpgradable.plotId, structureType: fallbackUpgradable.structureType };
  }
  return null;
}

function loadLocalTown(): LocalTownSnapshot {
  try {
    const raw = window.localStorage.getItem(LOCAL_TOWN_STORAGE_KEY);
    if (!raw) {
      return {
        turnCount: 0,
        activeAgentIndex: 0,
        activeDecree: '',
        metrics: { ...DEFAULT_TOWN_METRICS },
        timeOfDay: 'day',
        weather: 'summer',
        theme: 'meadow',
        agents: createInitialAgents(),
        structures: [],
        logs: createInitialLogs(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalTownSnapshot>;
    if (!Array.isArray(parsed.agents) || parsed.agents.length < 5) {
      throw new Error('Invalid local snapshot');
    }
    const restoredAgents = parsed.agents.slice(0, MAX_TOWN_AGENTS).map((a) => ({
      ...a,
      activePlotId: a.activePlotId || null,
      userNote: typeof a.userNote === 'string' ? a.userNote : '',
    }));
    return {
      turnCount: Number(parsed.turnCount ?? 0),
      activeAgentIndex: Number(parsed.activeAgentIndex ?? 0) % restoredAgents.length,
      activeDecree: typeof parsed.activeDecree === 'string' ? parsed.activeDecree : '',
      metrics: parsed.metrics || { ...DEFAULT_TOWN_METRICS },
      timeOfDay: parsed.timeOfDay || 'day',
      weather: normalizeWeatherMode(parsed.weather),
      theme: normalizeTownTheme(parsed.theme),
      agents: restoredAgents,
      structures: Array.isArray(parsed.structures) ? parsed.structures : [],
      logs: Array.isArray(parsed.logs) && parsed.logs.length > 0 ? parsed.logs : createInitialLogs(),
    };
  } catch {
    return {
      turnCount: 0,
      activeAgentIndex: 0,
      activeDecree: '',
      metrics: { ...DEFAULT_TOWN_METRICS },
      timeOfDay: 'day',
      weather: 'summer',
      theme: 'meadow',
      agents: createInitialAgents(),
      structures: [],
      logs: createInitialLogs(),
    };
  }
}

export default function App() {
  const initialLocal = useRef<LocalTownSnapshot | null>(null);
  if (!initialLocal.current) {
    initialLocal.current = loadLocalTown();
  }

  const [agents, setAgents] = useState<AgentRecord[]>(initialLocal.current.agents);
  const [structures, setStructures] = useState<TownStructure[]>(initialLocal.current.structures);
  const [logs, setLogs] = useState<TownLogItem[]>(initialLocal.current.logs);
  const [turnCount, setTurnCount] = useState<number>(initialLocal.current.turnCount);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(initialLocal.current.activeAgentIndex);
  const [activeDecree, setActiveDecree] = useState<string>(initialLocal.current.activeDecree);
  const [metrics, setMetrics] = useState<TownMetrics>(initialLocal.current.metrics);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialLocal.current.timeOfDay);
  const [weather, setWeather] = useState<WeatherMode>(initialLocal.current.weather);
  const [townTheme, setTownTheme] = useState<TownTheme>(initialLocal.current.theme);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() =>
    loadGraphicsQuality(),
  );

  const [turnIntervalSeconds, setTurnIntervalSeconds] = useState<number>(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(8);
  const [isThinking, setIsThinking] = useState(false);
  const [isHiring, setIsHiring] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>('mayor_sterling');
  const [selectedPlotId, setSelectedPlotId] = useState<PlotId | null>(null);
  const [followActive, setFollowActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [minimapCoords, setMinimapCoords] = useState<Partial<Record<AgentId, AgentWorldCoord>>>({});
  const [communicationEvent, setCommunicationEvent] = useState<{
    speakerId: AgentId;
    targetAgentName: string | null;
    accentColor: string;
    nonce: number;
  } | null>(null);

  const [focusRequest, setFocusRequest] = useState<
    | { type: 'agent'; id: AgentId; nonce: number }
    | { type: 'location'; id: LocationId; nonce: number }
    | { type: 'plot'; id: PlotId; nonce: number }
    | { type: 'reset'; nonce: number }
    | null
  >(null);

  // Desktop sidebar collapse states
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Mobile bottom drawer state
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);

  // AI Provider & Remote Bridge settings
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>(() => loadProviderConfig());
  const [remoteBridgeConfig, setRemoteBridgeConfig] = useState<RemoteBridgeConfig>(() =>
    loadRemoteBridgeConfig(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [remoteExecutedCount, setRemoteExecutedCount] = useState(0);
  const [hasServerDefaultKey, setHasServerDefaultKey] = useState(false);

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

  const activeAgent = agents[activeAgentIndex % agents.length];
  const activeAgentId = activeAgent?.id ?? 'mayor_sterling';
  const inFlightRef = useRef(false);
  const processingCommandIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { hasDefaultKey?: boolean }) => {
        setHasServerDefaultKey(Boolean(data.hasDefaultKey));
      })
      .catch(() => {
        setHasServerDefaultKey(false);
      });

    return () => {
      soundscape.dispose();
    };
  }, []);

  useEffect(() => {
    if (user) return;
    try {
      const snapshot: LocalTownSnapshot = {
        turnCount,
        activeAgentIndex,
        activeDecree,
        metrics,
        timeOfDay,
        weather,
        theme: townTheme,
        agents,
        structures,
        logs: logs.slice(0, 40),
      };
      window.localStorage.setItem(LOCAL_TOWN_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota errors
    }
  }, [user, turnCount, activeAgentIndex, activeDecree, metrics, timeOfDay, weather, townTheme, agents, structures, logs]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) return;
      try {
        const cloudState = await loadOrInitializeTown(nextUser.uid);
        setTurnCount(cloudState.turnCount);
        setActiveAgentIndex(cloudState.activeAgentIndex);
        setActiveDecree(cloudState.activeDecree);
        setMetrics(cloudState.metrics);
        setTimeOfDay(cloudState.timeOfDay);
        setWeather(cloudState.weather);
        setTownTheme(cloudState.theme);
        setAgents(cloudState.agents);
        setStructures(cloudState.structures);
        setLogs(cloudState.logs);
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    return () => unsub();
  }, []);

  const stateRef = useRef({
    agents,
    structures,
    logs,
    turnCount,
    activeAgentIndex,
    activeDecree,
    metrics,
    timeOfDay,
    weather,
    turnIntervalSeconds,
    providerConfig,
    remoteBridgeConfig,
    user,
  });
  stateRef.current = {
    agents,
    structures,
    logs,
    turnCount,
    activeAgentIndex,
    activeDecree,
    metrics,
    timeOfDay,
    weather,
    turnIntervalSeconds,
    providerConfig,
    remoteBridgeConfig,
    user,
  };

  const dispatchBridgeNotification = useCallback(
    (
      eventType: 'build_complete' | 'building_tier_3' | 'weather_shift' | 'remote_command',
      title: string,
      message: string,
    ) => {
      const snap = stateRef.current;
      const cfg = snap.remoteBridgeConfig;
      const hasWebhook = Boolean(cfg.webhookUrl.trim());
      const hasTelegram = Boolean(cfg.telegramBotToken.trim() && cfg.telegramChatId.trim());
      if (!hasWebhook && !hasTelegram) return;

      if (eventType === 'build_complete' && !cfg.notifyOnBuildComplete) return;
      if (eventType === 'building_tier_3' && !cfg.notifyOnTier3) return;
      if (eventType === 'weather_shift' && !cfg.notifyOnWeatherShift) return;
      if (eventType === 'remote_command' && !cfg.notifyOnRemoteCommand) return;

      void fetch('/api/bridge/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: cfg.webhookUrl.trim(),
          telegramBotToken: cfg.telegramBotToken.trim(),
          telegramChatId: cfg.telegramChatId.trim(),
          eventType,
          title,
          message,
          townStats: {
            turnCount: snap.turnCount,
            weather: snap.weather,
            villagers: snap.agents.length,
            prosperity: snap.metrics.prosperity,
            orderLevel: snap.metrics.orderLevel,
            morale: snap.metrics.morale,
          },
        }),
      }).catch(() => {
        // Outgoing alerts are best-effort so town turns never stall
      });
    },
    [],
  );

  const runTurn = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsThinking(true);
    setErrorBanner(null);

    const snap = stateRef.current;
    const currentAgent = snap.agents[snap.activeAgentIndex % snap.agents.length];
    if (!currentAgent) {
      inFlightRef.current = false;
      setIsThinking(false);
      return;
    }

    try {
      const res = await fetch('/api/town/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-base-url': snap.providerConfig.baseUrl.trim(),
          'x-ai-model-name': snap.providerConfig.modelName.trim(),
          'x-ai-api-key': snap.providerConfig.apiKey.trim(),
        },
        body: JSON.stringify({
          activeAgentId: currentAgent.id,
          agents: snap.agents,
          structures: snap.structures,
          recentLogs: snap.logs.slice(0, 8),
          activeDecree: snap.activeDecree,
          turnCount: snap.turnCount,
          timeOfDay: snap.timeOfDay,
          weather: snap.weather,
          metrics: snap.metrics,
        }),
      });

      const payload = (await res.json()) as {
        turnResult?: AgentTurnResponse;
        error?: string;
        code?: string;
      };

      if (!res.ok || !payload.turnResult) {
        if (payload.code === 'MISSING_API_KEY') {
          setIsPlaying(false);
          setSettingsOpen(true);
        }
        setErrorBanner(payload.error || 'Failed to advance simulation turn.');
        return;
      }

      const result = payload.turnResult;
      const nextTurnNumber = snap.turnCount + 1;
      const now = Date.now();

      // Advance time of day gently every 5 turns
      let nextTimeOfDay = snap.timeOfDay;
      if (nextTurnNumber % 5 === 0) {
        const idx = TIME_CYCLE.indexOf(snap.timeOfDay);
        nextTimeOfDay = TIME_CYCLE[(idx + 1) % TIME_CYCLE.length];
      }

      const weatherEffect = getWeatherSeasonEffect(snap.weather, snap.structures);

      let prosperityDelta = result.metrics_delta?.prosperity ?? 0;
      let orderDelta = result.metrics_delta?.order ?? 0;
      let moraleDelta = result.metrics_delta?.morale ?? 0;

      // Apply autonomous AI build_order if present
      let nextStructures = snap.structures;
      let structureMutation: {
        mode: 'create' | 'progress' | 'upgrade';
        structure: TownStructure;
      } | null = null;
      let activePlotId: PlotId | null = null;
      let playBuildFanfare = false;
      let completedBuildingInfo: { label: string; plotId: PlotId; builder: string } | null = null;
      let tier3BuildingInfo: { label: string; plotId: PlotId; builder: string } | null = null;

      const buildOrder = result.build_order;
      if (buildOrder && buildOrder.action !== 'none' && buildOrder.plot_id) {
        const existingSite = snap.structures.find((s) => s.plotId === buildOrder.plot_id);

        if (buildOrder.action === 'propose' && !existingSite && buildOrder.structure_type) {
          const created: TownStructure = {
            plotId: buildOrder.plot_id,
            structureType: buildOrder.structure_type,
            status: 'building',
            progress: 20,
            tier: 1,
            proposedBy: currentAgent.name,
            lastBuilder: currentAgent.name,
            updatedAtMs: now,
          };
          nextStructures = [...snap.structures, created];
          structureMutation = { mode: 'create', structure: created };
          activePlotId = created.plotId;
        } else if (buildOrder.action === 'construct' && existingSite && existingSite.status === 'building') {
          const baseStepGain = currentAgent.rank === 3 ? 45 : 30;
          const stepGain = Math.max(
            15,
            Math.round(baseStepGain * weatherEffect.constructionMultiplier),
          );
          const nextProgress = Math.min(100, existingSite.progress + stepGain);
          const finished = nextProgress >= 100;
          const progressed: TownStructure = {
            ...existingSite,
            progress: nextProgress,
            status: finished ? 'complete' : 'building',
            lastBuilder: currentAgent.name,
            updatedAtMs: now,
          };
          nextStructures = snap.structures.map((s) =>
            s.plotId === progressed.plotId ? progressed : s,
          );
          structureMutation = { mode: 'progress', structure: progressed };
          activePlotId = progressed.plotId;

          if (finished) {
            const bonus = STRUCTURE_META[progressed.structureType].bonus;
            prosperityDelta += bonus.prosperity;
            orderDelta += bonus.order;
            moraleDelta += bonus.morale;
            playBuildFanfare = true;
            completedBuildingInfo = {
              label: STRUCTURE_META[progressed.structureType].label,
              plotId: progressed.plotId,
              builder: currentAgent.name,
            };
          }
        } else if (
          buildOrder.action === 'upgrade' &&
          existingSite &&
          existingSite.status === 'complete' &&
          existingSite.tier < 3
        ) {
          const upgraded: TownStructure = {
            ...existingSite,
            tier: existingSite.tier + 1,
            lastBuilder: currentAgent.name,
            updatedAtMs: now,
          };
          nextStructures = snap.structures.map((s) =>
            s.plotId === upgraded.plotId ? upgraded : s,
          );
          structureMutation = { mode: 'upgrade', structure: upgraded };
          activePlotId = upgraded.plotId;
          prosperityDelta += 2;
          orderDelta += 1;
          moraleDelta += 2;
          playBuildFanfare = true;
          if (upgraded.tier === 3) {
            tier3BuildingInfo = {
              label: STRUCTURE_META[upgraded.structureType].label,
              plotId: upgraded.plotId,
              builder: currentAgent.name,
            };
          }
        }
      }

      // Allow villagers to visit a completed Pavilion, Bakery, or Archive for shelter / socializing
      if (!activePlotId && result.visit_plot_id) {
        const shelterTarget = nextStructures.find(
          (s) => s.plotId === result.visit_plot_id && s.status === 'complete',
        );
        if (shelterTarget) {
          activePlotId = shelterTarget.plotId;
        }
      }

      // Apply Weather & Season Building Bonuses to Town Pulse
      const postTurnEffect = getWeatherSeasonEffect(snap.weather, nextStructures);
      if (snap.weather === 'rain') {
        if (postTurnEffect.hasGreenhouseOrGranary) {
          if (prosperityDelta > 0) prosperityDelta = Math.ceil(prosperityDelta * 1.25);
          if (moraleDelta > 0) moraleDelta = Math.ceil(moraleDelta * 1.25);
          if (nextTurnNumber % 2 === 0) prosperityDelta += 1;
        }
        if (postTurnEffect.hasBakery && (currentAgent.id === 'worker_pip' || currentAgent.id === 'architect_lyra')) {
          moraleDelta += 1;
        }
      } else if (snap.weather === 'summer') {
        if (postTurnEffect.hasWindmill) {
          if (prosperityDelta > 0) prosperityDelta = Math.ceil(prosperityDelta * 1.25);
          if (result.target_location === 'market' || result.target_location === 'workshop') {
            prosperityDelta += 1;
          }
        }
        if (postTurnEffect.hasPavilion && result.target_location === 'park') {
          moraleDelta += 1;
        }
      } else if (snap.weather === 'winter') {
        if (postTurnEffect.hasBakery) {
          if (result.target_location === 'town_hall' || result.target_location === 'market' || nextTurnNumber % 2 === 0) {
            moraleDelta += 1;
          }
        } else if (nextTurnNumber % 3 === 0) {
          moraleDelta -= 1;
        }
      }

      const nextMetrics: TownMetrics = {
        prosperity: clampMetric(snap.metrics.prosperity + prosperityDelta),
        orderLevel: clampMetric(snap.metrics.orderLevel + orderDelta),
        morale: clampMetric(snap.metrics.morale + moraleDelta),
      };

      // Clear consumed userNote after the agent responds to it
      const updatedAgent: AgentRecord = {
        ...currentAgent,
        location: result.target_location,
        activePlotId,
        targetAgent: result.target_agent,
        thought: result.thought,
        dialogue: result.dialogue,
        currentTask: result.new_task,
        userNote: '',
        updatedAtMs: now,
      };

      const logEntry: TownLogItem = {
        id: `turn-${nextTurnNumber}-${now}`,
        turnNumber: nextTurnNumber,
        agentId: updatedAgent.id,
        agentName: updatedAgent.name,
        rank: updatedAgent.rank,
        location: result.target_location,
        targetAgent: result.target_agent,
        thought: result.thought,
        dialogue: result.dialogue,
        newTask: result.new_task,
        timestampMs: now,
      };

      // Cycle season naturally every 12 turns and log the weather shift
      let weatherShift: { weather: WeatherMode; logEntry: TownLogItem } | null = null;
      if (nextTurnNumber % 12 === 0) {
        const wIdx = SEASON_CYCLE.indexOf(snap.weather);
        const nextWeather = SEASON_CYCLE[(wIdx + 1) % SEASON_CYCLE.length];
        weatherShift = {
          weather: nextWeather,
          logEntry: createWeatherShiftLog(nextWeather, nextStructures, nextTurnNumber, now + 1),
        };
      }

      // Autonomous Mayor Sterling hiring when Town Pulse is high & buildings need staff
      let hiredPayload: { workers: AgentRecord[]; logs: TownLogItem[] } | null = null;
      if (
        result.hired_worker &&
        currentAgent.id === 'mayor_sterling' &&
        snap.agents.length < MAX_TOWN_AGENTS
      ) {
        const existingIds = new Set(snap.agents.map((a) => a.id));
        const newWorker = createHiredAgentRecord(result.hired_worker, existingIds, now + 2);
        const hireLog: TownLogItem = {
          id: `hire-${nextTurnNumber}-${now + 2}`,
          turnNumber: nextTurnNumber,
          agentId: newWorker.id,
          agentName: newWorker.name,
          rank: 3,
          location: 'plaza',
          targetAgent: 'Mayor Sterling',
          thought: `Recruited by Mayor Sterling as ${newWorker.role} (${newWorker.personality}).`,
          dialogue: newWorker.dialogue,
          newTask: newWorker.currentTask,
          timestampMs: now + 2,
        };
        hiredPayload = { workers: [newWorker], logs: [hireLog] };
        playBuildFanfare = true;
      }

      const nextAgentsList = [
        ...snap.agents.map((a) => (a.id === updatedAgent.id ? updatedAgent : a)),
        ...(hiredPayload ? hiredPayload.workers : []),
      ].slice(0, MAX_TOWN_AGENTS);
      const nextAgentIndex = (snap.activeAgentIndex + 1) % nextAgentsList.length;

      setAgents(nextAgentsList);
      if (structureMutation) {
        setStructures(nextStructures);
      }
      setLogs((prev) => {
        const additions = [
          ...(hiredPayload ? hiredPayload.logs : []),
          ...(weatherShift ? [weatherShift.logEntry] : []),
          logEntry,
        ];
        return [...additions, ...prev].slice(0, 50);
      });
      setTurnCount(nextTurnNumber);
      setActiveAgentIndex(nextAgentIndex);
      setMetrics(nextMetrics);
      if (nextTimeOfDay !== snap.timeOfDay) {
        setTimeOfDay(nextTimeOfDay);
      }
      if (weatherShift) {
        setWeather(weatherShift.weather);
      }
      setSelectedAgentId(hiredPayload ? hiredPayload.workers[0].id : updatedAgent.id);
      setSecondsLeft(snap.turnIntervalSeconds);
      setCommunicationEvent({
        speakerId: updatedAgent.id,
        targetAgentName: result.target_agent,
        accentColor: updatedAgent.accentColor,
        nonce: now,
      });

      if (playBuildFanfare) {
        soundscape.playBuildCompleteChime();
      } else {
        soundscape.playAgentChime(updatedAgent.rank);
      }

      if (completedBuildingInfo) {
        dispatchBridgeNotification(
          'build_complete',
          `${completedBuildingInfo.label} Completed!`,
          `${completedBuildingInfo.builder} finished building ${completedBuildingInfo.label} on ${PLOT_META[completedBuildingInfo.plotId].label}.`,
        );
      }
      if (tier3BuildingInfo) {
        dispatchBridgeNotification(
          'building_tier_3',
          `${tier3BuildingInfo.label} Reached Tier 3!`,
          `${tier3BuildingInfo.builder} upgraded ${tier3BuildingInfo.label} on ${PLOT_META[tier3BuildingInfo.plotId].label} to Masterwork Tier 3.`,
        );
      }
      if (weatherShift) {
        const eff = getWeatherSeasonEffect(weatherShift.weather, nextStructures);
        dispatchBridgeNotification(
          'weather_shift',
          `Season Shifted to ${eff.label}`,
          eff.shiftHeadline,
        );
      }

      if (snap.user) {
        await persistAgentTurn(
          snap.user.uid,
          nextTurnNumber,
          nextAgentIndex,
          nextMetrics,
          nextTimeOfDay,
          updatedAgent,
          logEntry,
          structureMutation,
          weatherShift,
          hiredPayload,
        );
      }
    } catch (error) {
      setErrorBanner(
        error instanceof Error ? error.message : 'Unable to complete agent turn.',
      );
    } finally {
      inFlightRef.current = false;
      setIsThinking(false);
    }
  }, [dispatchBridgeNotification]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      if (inFlightRef.current) return;
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void runTurn();
          return stateRef.current.turnIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, runTurn]);

  const handleSaveRemoteBridge = (nextConfig: RemoteBridgeConfig) => {
    setRemoteBridgeConfig(nextConfig);
    try {
      window.localStorage.setItem(REMOTE_BRIDGE_STORAGE_KEY, JSON.stringify(nextConfig));
    } catch {
      // Ignore localStorage failures
    }
  };

  const handleSaveProvider = (nextConfig: AIProviderConfig, nextWebhookUrl: string) => {
    setProviderConfig(nextConfig);
    setErrorBanner(null);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(nextConfig));
    } catch {
      // Ignore localStorage failures
    }
    if (nextWebhookUrl !== remoteBridgeConfig.webhookUrl) {
      handleSaveRemoteBridge({
        ...remoteBridgeConfig,
        webhookUrl: nextWebhookUrl,
      });
    }
  };

  const handleIssueDecree = useCallback(async (decreeText: string) => {
    const snap = stateRef.current;
    const nextTurn = snap.turnCount + 1;
    const now = Date.now();
    const decreeLog: TownLogItem = {
      id: `decree-${nextTurn}-${now}`,
      turnNumber: nextTurn,
      agentId: 'god_decree',
      agentName: 'Civic Decree',
      rank: 0,
      location: 'plaza',
      targetAgent: 'Mayor Sterling',
      thought: 'High-priority civic directive issued from above.',
      dialogue: decreeText,
      newTask: 'Mayor Sterling to enact decree',
      timestampMs: now,
    };

    setActiveDecree(decreeText);
    setTurnCount(nextTurn);
    setActiveAgentIndex(0);
    setLogs((prev) => [decreeLog, ...prev].slice(0, 50));
    setSelectedAgentId('mayor_sterling');
    setFocusRequest({ type: 'agent', id: 'mayor_sterling', nonce: now });
    soundscape.playDecreeGong();

    if (snap.user) {
      try {
        await persistGodDecree(snap.user.uid, decreeText, nextTurn, decreeLog);
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }, []);

  const handleSendAgentNote = async (agentId: AgentId, note: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, userNote: note } : a)),
    );
    if (user) {
      try {
        await persistAgentNote(user.uid, agentId, note);
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const handleHireWorker = useCallback(async (promptText: string): Promise<string | null> => {
    const cleaned = promptText.trim();
    const snap = stateRef.current;
    if (!cleaned) return null;
    if (snap.agents.length >= MAX_TOWN_AGENTS) {
      const msg = `Alderbrook is at full capacity (${MAX_TOWN_AGENTS}/${MAX_TOWN_AGENTS} active villagers).`;
      setErrorBanner(msg);
      return null;
    }

    setIsHiring(true);
    setErrorBanner(null);

    try {
      const res = await fetch('/api/town/hire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-base-url': snap.providerConfig.baseUrl.trim(),
          'x-ai-model-name': snap.providerConfig.modelName.trim(),
          'x-ai-api-key': snap.providerConfig.apiKey.trim(),
        },
        body: JSON.stringify({
          prompt: cleaned,
          agents: snap.agents,
          structures: snap.structures,
          weather: snap.weather,
          timeOfDay: snap.timeOfDay,
        }),
      });

      const payload = (await res.json()) as {
        workers?: HiredWorkerSpec[];
        error?: string;
        code?: string;
      };

      if (!res.ok || !Array.isArray(payload.workers) || payload.workers.length === 0) {
        if (payload.code === 'MISSING_API_KEY') {
          setSettingsOpen(true);
        }
        setErrorBanner(payload.error || 'Could not recruit worker.');
        return null;
      }

      const slotsLeft = MAX_TOWN_AGENTS - snap.agents.length;
      const existingIds = new Set(snap.agents.map((a) => a.id));
      const now = Date.now();
      const newWorkers = payload.workers
        .slice(0, slotsLeft)
        .map((spec, idx) => createHiredAgentRecord(spec, existingIds, now + idx));

      const welcomeLogs: TownLogItem[] = newWorkers.map((w, idx) => ({
        id: `hire-${snap.turnCount}-${now + idx}`,
        turnNumber: snap.turnCount,
        agentId: w.id,
        agentName: w.name,
        rank: 3,
        location: 'plaza',
        targetAgent: w.supervisor,
        thought: `Arrived at Alderbrook Square as ${w.role} (${w.personality || 'Ready to serve'}).`,
        dialogue: w.dialogue,
        newTask: w.currentTask,
        timestampMs: now + idx,
      }));

      setAgents((prev) => [...prev, ...newWorkers].slice(0, MAX_TOWN_AGENTS));
      setLogs((prev) => [...welcomeLogs.slice().reverse(), ...prev].slice(0, 50));
      setSelectedAgentId(newWorkers[0].id);
      setSelectedPlotId(null);
      setFollowActive(false);
      setFocusRequest({ type: 'reset', nonce: now });
      soundscape.playBuildCompleteChime();

      if (snap.user) {
        try {
          await persistHiredWorkers(snap.user.uid, newWorkers, welcomeLogs);
        } catch (err) {
          setAsyncError(err instanceof Error ? err : new Error(String(err)));
        }
      }

      return newWorkers.map((w) => `${w.name} (${w.role})`).join(', ');
    } catch (error) {
      setErrorBanner(
        error instanceof Error ? error.message : 'Unable to hire AI worker.',
      );
      return null;
    } finally {
      setIsHiring(false);
    }
  }, []);

  const handleChangeTimeOfDay = async (tod: TimeOfDay) => {
    setTimeOfDay(tod);
    if (user) {
      try {
        await persistEnvironmentSettings(user.uid, { timeOfDay: tod });
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const handleChangeTownTheme = async (nextTheme: TownTheme) => {
    const preferredTod = TOWN_THEME_META[nextTheme].preferredTimeOfDay;
    setTownTheme(nextTheme);
    setTimeOfDay(preferredTod);
    if (user) {
      try {
        await persistEnvironmentSettings(user.uid, {
          theme: nextTheme,
          timeOfDay: preferredTod,
        });
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const handleCycleTownTheme = () => {
    const idx = ALL_TOWN_THEMES.indexOf(townTheme);
    const nextTheme = ALL_TOWN_THEMES[(idx + 1) % ALL_TOWN_THEMES.length];
    void handleChangeTownTheme(nextTheme);
  };

  const handleChangeWeather = useCallback(
    async (w: WeatherMode) => {
      const snap = stateRef.current;
      if (w === snap.weather) return;
      const now = Date.now();
      const shiftLog = createWeatherShiftLog(w, snap.structures, snap.turnCount, now);
      const eff = getWeatherSeasonEffect(w, snap.structures);
      setWeather(w);
      setLogs((prev) => [shiftLog, ...prev].slice(0, 50));
      dispatchBridgeNotification('weather_shift', `Weather Shifted to ${eff.label}`, eff.shiftHeadline);
      if (snap.user) {
        try {
          await persistWeatherShift(snap.user.uid, w, shiftLog);
        } catch (err) {
          setAsyncError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
    [dispatchBridgeNotification],
  );

  // Real-time Firestore Remote Command Listener (onSnapshot)
  useEffect(() => {
    if (!user) return;

    const executeRemoteCommand = async (cmd: RemoteCommandRecord) => {
      const snap = stateRef.current;
      const now = Date.now();
      const sourceLabel = cmd.source?.trim() || 'Telegram / Agent';
      let execStatus: 'executed' | 'failed' = 'executed';
      let resultMessage = '';

      try {
        if (cmd.type === 'set_weather') {
          const rawWeather =
            typeof cmd.payload === 'object' && cmd.payload
              ? (cmd.payload as Record<string, unknown>).weather ?? (cmd.payload as Record<string, unknown>).value
              : cmd.value ?? cmd.payload;
          const nextWeather = parseRemoteWeatherInput(rawWeather);
          if (!nextWeather) {
            execStatus = 'failed';
            resultMessage = `Unsupported weather value "${String(rawWeather ?? '')}". Use summer, rain, or winter.`;
          } else {
            await handleChangeWeather(nextWeather);
            resultMessage = `Weather set to ${nextWeather.toUpperCase()} via ${sourceLabel}.`;
          }
        } else if (cmd.type === 'god_decree') {
          const rawDecree =
            typeof cmd.payload === 'object' && cmd.payload
              ? String((cmd.payload as Record<string, unknown>).decree ?? (cmd.payload as Record<string, unknown>).value ?? '')
              : String(cmd.value ?? cmd.payload ?? '');
          const decreeText = rawDecree.trim().slice(0, 260);
          if (!decreeText) {
            execStatus = 'failed';
            resultMessage = 'Remote god_decree command had an empty decree message.';
          } else {
            await handleIssueDecree(decreeText);
            resultMessage = `Issued Civic Decree: "${decreeText}"`;
          }
        } else if (cmd.type === 'hire_worker') {
          const rawHire =
            typeof cmd.payload === 'object' && cmd.payload
              ? String((cmd.payload as Record<string, unknown>).prompt ?? (cmd.payload as Record<string, unknown>).value ?? '')
              : String(cmd.value ?? cmd.payload ?? '');
          const hirePrompt = rawHire.trim().slice(0, 220);
          if (!hirePrompt) {
            execStatus = 'failed';
            resultMessage = 'Remote hire_worker command needed a worker description.';
          } else {
            const recruited = await handleHireWorker(hirePrompt);
            if (recruited) {
              resultMessage = `Recruited ${recruited} from remote request.`;
            } else {
              execStatus = 'failed';
              resultMessage = `Could not recruit worker for "${hirePrompt}".`;
            }
          }
        } else if (cmd.type === 'build_structure' || cmd.type === 'build_plot') {
          const target = parseRemoteBuildTarget(cmd, snap.structures);
          if (!target) {
            execStatus = 'failed';
            resultMessage = 'No available plot or upgradable building found for build command.';
          } else {
            const existing = snap.structures.find((s) => s.plotId === target.plotId);
            const label = STRUCTURE_META[existing?.structureType || target.structureType].label;
            const plotLabel = PLOT_META[target.plotId].label;

            if (!existing) {
              const created: TownStructure = {
                plotId: target.plotId,
                structureType: target.structureType,
                status: 'building',
                progress: 25,
                tier: 1,
                proposedBy: `Remote (${sourceLabel})`,
                lastBuilder: `Remote (${sourceLabel})`,
                updatedAtMs: now,
              };
              setStructures((prev) => [...prev, created]);
              setSelectedPlotId(created.plotId);
              setFocusRequest({ type: 'plot', id: created.plotId, nonce: now });
              soundscape.playAgentChime(2);
              await persistRemoteStructureAction(user.uid, 'create', created);
              resultMessage = `Staked ${label} on ${plotLabel} (${target.plotId}) at 25%.`;
            } else if (existing.status === 'building') {
              const nextProgress = Math.min(100, existing.progress + 50);
              const finished = nextProgress >= 100;
              const progressed: TownStructure = {
                ...existing,
                progress: nextProgress,
                status: finished ? 'complete' : 'building',
                lastBuilder: `Remote (${sourceLabel})`,
                updatedAtMs: now,
              };
              setStructures((prev) =>
                prev.map((s) => (s.plotId === progressed.plotId ? progressed : s)),
              );
              setSelectedPlotId(progressed.plotId);
              setFocusRequest({ type: 'plot', id: progressed.plotId, nonce: now });
              if (finished) {
                soundscape.playBuildCompleteChime();
                dispatchBridgeNotification(
                  'build_complete',
                  `${label} Completed!`,
                  `Remote construction finished ${label} on ${plotLabel}.`,
                );
              } else {
                soundscape.playAgentChime(3);
              }
              await persistRemoteStructureAction(user.uid, 'progress', progressed);
              resultMessage = finished
                ? `Completed ${label} on ${plotLabel}!`
                : `Advanced ${label} on ${plotLabel} to ${nextProgress}%.`;
            } else if (existing.tier < 3) {
              const upgraded: TownStructure = {
                ...existing,
                tier: existing.tier + 1,
                lastBuilder: `Remote (${sourceLabel})`,
                updatedAtMs: now,
              };
              setStructures((prev) =>
                prev.map((s) => (s.plotId === upgraded.plotId ? upgraded : s)),
              );
              setSelectedPlotId(upgraded.plotId);
              setFocusRequest({ type: 'plot', id: upgraded.plotId, nonce: now });
              soundscape.playBuildCompleteChime();
              if (upgraded.tier === 3) {
                dispatchBridgeNotification(
                  'building_tier_3',
                  `${label} Reached Tier 3!`,
                  `Remote upgrade elevated ${label} on ${plotLabel} to Tier 3.`,
                );
              }
              await persistRemoteStructureAction(user.uid, 'upgrade', upgraded);
              resultMessage = `Upgraded ${label} on ${plotLabel} to Tier ${upgraded.tier}.`;
            } else {
              resultMessage = `${label} on ${plotLabel} is already Tier 3.`;
            }
          }
        }
      } catch (err) {
        execStatus = 'failed';
        resultMessage = err instanceof Error ? err.message : 'Remote command failed.';
      }

      const remoteLog: TownLogItem = {
        id: `remote-${cmd.id.slice(0, 16)}-${now}`,
        turnNumber: stateRef.current.turnCount,
        agentId: 'remote_command',
        agentName: '[Remote Command] · Telegram / Agent',
        rank: 0,
        location: 'plaza',
        targetAgent: null,
        thought: `Source: ${sourceLabel} · Action: ${cmd.type} (${cmd.value || (typeof cmd.payload === 'string' ? cmd.payload : 'payload')})`,
        dialogue: resultMessage,
        newTask: `Status: ${execStatus}`,
        timestampMs: now,
      };

      setLogs((prev) => [remoteLog, ...prev].slice(0, 50));
      if (execStatus === 'executed') {
        setRemoteExecutedCount((c) => c + 1);
        dispatchBridgeNotification(
          'remote_command',
          `Remote Command Executed (${cmd.type})`,
          resultMessage,
        );
      }

      try {
        await markRemoteCommandStatus(user.uid, cmd.id, execStatus, resultMessage, remoteLog);
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'Failed to update remote command status in Firestore.',
        );
      }
    };

    const unsub = subscribePendingRemoteCommands(
      user.uid,
      (pendingCommands) => {
        for (const cmd of pendingCommands) {
          if (processingCommandIdsRef.current.has(cmd.id)) continue;
          processingCommandIdsRef.current.add(cmd.id);
          void executeRemoteCommand(cmd);
        }
      },
      (err) => {
        setErrorBanner(err.message);
      },
    );

    return () => {
      unsub();
    };
  }, [user, handleChangeWeather, handleIssueDecree, handleHireWorker, dispatchBridgeNotification]);

  const handleChangeTurnInterval = (seconds: number) => {
    setTurnIntervalSeconds(seconds);
    setSecondsLeft(seconds);
  };

  const handleChangeGraphicsQuality = (nextQuality: GraphicsQuality) => {
    setGraphicsQuality(nextQuality);
    try {
      window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, nextQuality);
    } catch {
      // Ignore storage failures
    }
  };

  const handleCycleGraphicsQuality = () => {
    const idx = QUALITY_CYCLE.indexOf(graphicsQuality);
    const nextQuality = QUALITY_CYCLE[(idx + 1) % QUALITY_CYCLE.length];
    handleChangeGraphicsQuality(nextQuality);
  };

  const handleResetTown = async () => {
    setIsPlaying(false);
    setSecondsLeft(turnIntervalSeconds);
    setErrorBanner(null);
    setFollowActive(false);
    setSelectedPlotId(null);

    if (user) {
      try {
        const fresh = await resetTownInFirestore(user.uid);
        setTurnCount(fresh.turnCount);
        setActiveAgentIndex(fresh.activeAgentIndex);
        setActiveDecree(fresh.activeDecree);
        setMetrics(fresh.metrics);
        setTimeOfDay(fresh.timeOfDay);
        setWeather(fresh.weather);
        setTownTheme(fresh.theme);
        setAgents(fresh.agents);
        setStructures(fresh.structures);
        setLogs(fresh.logs);
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    } else {
      setTurnCount(0);
      setActiveAgentIndex(0);
      setActiveDecree('');
      setMetrics({ ...DEFAULT_TOWN_METRICS });
      setTimeOfDay('day');
      setWeather('summer');
      setTownTheme('meadow');
      setAgents(createInitialAgents());
      setStructures([]);
      setLogs(createInitialLogs());
    }
    setFocusRequest({ type: 'reset', nonce: Date.now() });
  };

  const handleAuthToggle = async () => {
    setAuthBusy(true);
    try {
      if (user) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, googleAuthProvider);
      }
    } catch (error) {
      setErrorBanner(
        error instanceof Error ? error.message : 'Sign-in could not be completed.',
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundscape.setEnabled(next);
  };

  const handleSelectAgent = (id: AgentId) => {
    setSelectedAgentId(id);
    setSelectedPlotId(null);
    setFollowActive(false);
    setFocusRequest({ type: 'agent', id, nonce: Date.now() });
  };

  const handleFocusLocation = (id: LocationId) => {
    setSelectedPlotId(null);
    setFollowActive(false);
    setFocusRequest({ type: 'location', id, nonce: Date.now() });
  };

  const handleSelectPlot = (plotId: PlotId) => {
    setSelectedPlotId(plotId);
    setFollowActive(false);
    setFocusRequest({ type: 'plot', id: plotId, nonce: Date.now() });
  };

  const handleWhisperBuildPlot = (plotId: PlotId, isUpgrade: boolean) => {
    const plotLabel = PLOT_META[plotId].label;
    const note = isUpgrade
      ? `Upgrade the completed building on ${plotId} (${plotLabel}) to the next tier.`
      : `Propose and start building a helpful town structure on ${plotId} (${plotLabel}).`;
    void handleSendAgentNote('architect_lyra', note);
    setSelectedAgentId('architect_lyra');
    setSelectedPlotId(null);
  };

  const handleMobileTabToggle = (tab: MobileTab) => {
    setMobileTab((prev) => (prev === tab ? null : tab));
  };

  const activeSpeaker = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Full-Screen 3D Town Canvas */}
      <TownViewport
        agents={agents}
        structures={structures}
        activeAgentId={activeAgentId}
        selectedAgentId={selectedAgentId}
        selectedPlotId={selectedPlotId}
        timeOfDay={timeOfDay}
        weather={weather}
        townTheme={townTheme}
        graphicsQuality={graphicsQuality}
        followActive={followActive}
        communicationEvent={communicationEvent}
        focusRequest={focusRequest}
        onSelectAgent={handleSelectAgent}
        onSelectLocation={(loc) => {
          handleFocusLocation(loc);
          setErrorBanner(null);
        }}
        onSelectPlot={handleSelectPlot}
        onDismissPlot={() => setSelectedPlotId(null)}
        onWhisperBuildPlot={handleWhisperBuildPlot}
        onMinimapUpdate={setMinimapCoords}
        onUserOrbitStart={() => setFollowActive(false)}
      />

      {/* Compact Floating Top Bar */}
      <header className="pointer-events-none fixed top-2.5 right-2.5 left-2.5 z-30 flex items-center justify-between gap-2 md:top-4 md:right-4 md:left-4">
        <div className="pointer-events-auto flex min-h-[48px] max-w-full flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-3.5 py-1.5 shadow-xl md:px-4">
          {/* Title & Unboxed Status Metadata */}
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="font-display text-base font-bold tracking-tight whitespace-nowrap text-white md:text-lg">
              Alderbrook
            </h1>
            <div className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
              <span className="font-mono-tabular text-slate-300">Turn {turnCount}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {isThinking
                  ? `${activeSpeaker?.name ?? 'Agent'} thinking`
                  : isPlaying
                    ? `Next in ${secondsLeft}s`
                    : `Up next: ${activeSpeaker?.name.split(' ')[1] ?? 'Sterling'}`}
              </span>
            </div>
          </div>

          {/* Primary Action Controls */}
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <button
              type="button"
              onClick={() => {
                setSecondsLeft(turnIntervalSeconds);
                setIsPlaying((p) => !p);
              }}
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
              className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold whitespace-nowrap transition-colors md:px-3.5 md:text-sm ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'border border-white/15 bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSecondsLeft(turnIntervalSeconds);
                void runTurn();
              }}
              disabled={isThinking}
              aria-label="Next Turn"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 px-3 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-slate-800 disabled:opacity-50 md:px-3.5 md:text-sm"
            >
              <FastForward className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isThinking ? 'Thinking...' : 'Next Turn'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFollowActive((f) => !f)}
              title="Follow Active Agent Camera"
              aria-label={followActive ? 'Stop following active agent' : 'Follow active agent'}
              className={`hidden min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors md:inline-flex ${
                followActive
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Video className="h-4 w-4" />
              <span className="hidden lg:inline">Follow</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSound}
              title={soundEnabled ? 'Mute town audio' : 'Enable town chimes & breeze'}
              aria-label={soundEnabled ? 'Mute town audio' : 'Enable town audio'}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors ${
                soundEnabled
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleAuthToggle}
              disabled={authBusy}
              title={user ? `Signed in as ${user.email}` : 'Sign in with Google to sync town to cloud'}
              aria-label={user ? 'Sign out of cloud sync' : 'Sign in for cloud sync'}
              className="hidden min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-800 md:inline-flex"
            >
              {user ? <LogOut className="h-4 w-4 text-emerald-400" /> : <Cloud className="h-4 w-4" />}
              <span>{user ? 'Synced' : 'Cloud Save'}</span>
            </button>

            <button
              type="button"
              onClick={() => setBridgeOpen(true)}
              title="Remote Bridge (Firestore Listener, Webhook & Telegram Alerts)"
              aria-label="Remote Bridge Settings"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 px-2.5 text-xs font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-800 hover:text-white md:px-3"
            >
              <Radio
                className={`h-4 w-4 ${
                  user || remoteBridgeConfig.webhookUrl || remoteBridgeConfig.telegramBotToken
                    ? 'text-emerald-400'
                    : 'text-slate-300'
                }`}
              />
              <span className="hidden lg:inline">Bridge</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="AI Providers Settings"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 px-2.5 text-xs font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-800 hover:text-white md:px-3"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden lg:inline">AI Providers</span>
            </button>

            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Help & AI Integration Guide"
              aria-label="Help & AI Integration Guide"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-amber-300 transition-colors hover:bg-slate-800 hover:text-amber-200"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Actionable Error Banner */}
      {errorBanner && (
        <div className="fixed top-18 right-3 left-3 z-30 mx-auto max-w-lg rounded-xl border border-rose-500/40 bg-slate-950/95 px-4 py-2.5 text-xs text-rose-200 shadow-xl md:top-20">
          <div className="flex items-center justify-between gap-3">
            <span>{errorBanner}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="min-h-[36px] rounded-lg bg-rose-500/20 px-2.5 font-semibold text-rose-100 hover:bg-rose-500/30"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="min-h-[36px] rounded-lg px-2 text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Town Radar Minimap + Quick Camera Controls (Bottom-Center Desktop, Floating Corner Mobile) */}
      <div className="fixed right-3 bottom-16 z-20 flex flex-col items-end gap-2 md:right-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:items-center">
        {showMinimap && (
          <TownMinimap
            agents={agents}
            structures={structures}
            coords={minimapCoords}
            activeAgentId={activeAgentId}
            selectedAgentId={selectedAgentId}
            selectedPlotId={selectedPlotId}
            onSelectAgent={handleSelectAgent}
            onFocusLocation={handleFocusLocation}
            onSelectPlot={handleSelectPlot}
          />
        )}
        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/90 p-1 shadow-xl">
          <button
            type="button"
            onClick={() => setShowMinimap((m) => !m)}
            aria-label={showMinimap ? 'Hide town radar' : 'Show town radar'}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
              showMinimap
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MapIcon className="h-4 w-4" />
            <span>Radar</span>
          </button>
          <button
            type="button"
            onClick={() => setFollowActive((f) => !f)}
            aria-label={followActive ? 'Disable follow cam' : 'Enable follow cam'}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors md:hidden ${
              followActive
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCycleTownTheme}
            title={`World Theme: ${TOWN_THEME_META[townTheme].label} (tap to switch)`}
            aria-label={`World Theme: ${TOWN_THEME_META[townTheme].label}. Tap to switch theme`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Palette className="h-4 w-4 text-amber-300" />
            <span>{TOWN_THEME_META[townTheme].shortLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleCycleGraphicsQuality}
            title={`Graphics Quality: ${graphicsQuality} (tap to cycle)`}
            aria-label={`Graphics Quality: ${graphicsQuality}. Tap to cycle Low, Medium, High`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Gauge className="h-4 w-4 text-amber-300" />
            <span>
              {graphicsQuality === 'low' ? 'Low' : graphicsQuality === 'medium' ? 'Med' : 'High'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFollowActive(false);
              setFocusRequest({ type: 'reset', nonce: Date.now() });
            }}
            aria-label="Reset camera view"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden md:inline">Center</span>
          </button>
        </div>
      </div>

      {/* DESKTOP: Left Floating Translucent HUD Sidebar (Hierarchy & Town Pulse) */}
      <aside className="pointer-events-none fixed top-20 bottom-4 left-4 z-20 hidden md:flex">
        {leftOpen ? (
          <div className="pointer-events-auto flex h-full w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-white">
                  Town Hierarchy
                </h2>
                <p className="text-xs text-slate-400">
                  {agents.length} villagers · {LOCATION_LABELS[activeSpeaker?.location ?? 'town_hall']} active
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                aria-label="Collapse hierarchy panel"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <HierarchyPanel
                agents={agents}
                structures={structures}
                metrics={metrics}
                weather={weather}
                activeAgentId={activeAgentId}
                selectedAgentId={selectedAgentId}
                isHiring={isHiring}
                onSelectAgent={handleSelectAgent}
                onSendAgentNote={handleSendAgentNote}
                onHireWorker={handleHireWorker}
                onFocusLocation={handleFocusLocation}
                onSelectPlot={handleSelectPlot}
                onResetCamera={() => {
                  setFollowActive(false);
                  setSelectedPlotId(null);
                  setFocusRequest({ type: 'reset', nonce: Date.now() });
                }}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="pointer-events-auto flex h-11 items-center gap-2 self-start rounded-xl border border-white/10 bg-slate-950/90 px-3.5 text-xs font-semibold text-slate-200 shadow-lg hover:bg-slate-900 hover:text-white"
          >
            <Users className="h-4 w-4" />
            <span>Hierarchy</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </aside>

      {/* DESKTOP: Right Floating Translucent HUD Sidebar (Town Log + God Decree & Atmosphere) */}
      <aside className="pointer-events-none fixed top-20 right-4 bottom-4 z-20 hidden md:flex">
        {rightOpen ? (
          <div className="pointer-events-auto flex h-full w-88 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-white">
                  Town Log & Decrees
                </h2>
                <p className="text-xs text-slate-400">
                  {providerConfig.modelName} · Turn {turnCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                aria-label="Collapse town log panel"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <TownLogPanel logs={logs} />
            </div>

            <div className="hud-scroll max-h-[48%] shrink-0 overflow-y-auto border-t border-white/10 bg-slate-950/95">
              <DecreePanel
                activeDecree={activeDecree}
                timeOfDay={timeOfDay}
                weather={weather}
                townTheme={townTheme}
                graphicsQuality={graphicsQuality}
                turnIntervalSeconds={turnIntervalSeconds}
                onIssueDecree={handleIssueDecree}
                onChangeTimeOfDay={handleChangeTimeOfDay}
                onChangeWeather={handleChangeWeather}
                onChangeTownTheme={handleChangeTownTheme}
                onChangeGraphicsQuality={handleChangeGraphicsQuality}
                onChangeTurnInterval={handleChangeTurnInterval}
                onResetTown={handleResetTown}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            className="pointer-events-auto flex h-11 items-center gap-2 self-start rounded-xl border border-white/10 bg-slate-950/90 px-3.5 text-xs font-semibold text-slate-200 shadow-lg hover:bg-slate-900 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Town Log</span>
            <ScrollText className="h-4 w-4" />
          </button>
        )}
      </aside>

      {/* MOBILE (< 768px): Collapsible Bottom Drawer & Tab Bar */}
      <div className="fixed right-0 bottom-0 left-0 z-30 md:hidden">
        {mobileTab && (
          <div className="flex max-h-[60dvh] flex-col rounded-t-3xl border-t border-white/15 bg-slate-950/95 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
              <span className="font-display text-sm font-semibold text-white">
                {mobileTab === 'hierarchy'
                  ? 'Town Hierarchy'
                  : mobileTab === 'log'
                    ? `Town Log · Turn ${turnCount}`
                    : 'God Decree & Atmosphere'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAuthToggle}
                  disabled={authBusy}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-300 hover:text-white"
                >
                  <Cloud className={`h-4 w-4 ${user ? 'text-emerald-400' : ''}`} />
                  <span>{user ? 'Synced' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab(null)}
                  aria-label="Minimize drawer"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {mobileTab === 'hierarchy' && (
                <HierarchyPanel
                  agents={agents}
                  structures={structures}
                  metrics={metrics}
                  weather={weather}
                  activeAgentId={activeAgentId}
                  selectedAgentId={selectedAgentId}
                  isHiring={isHiring}
                  onSelectAgent={handleSelectAgent}
                  onSendAgentNote={handleSendAgentNote}
                  onHireWorker={handleHireWorker}
                  onFocusLocation={(loc) => {
                    handleFocusLocation(loc);
                    setMobileTab(null);
                  }}
                  onSelectPlot={(plotId) => {
                    handleSelectPlot(plotId);
                    setMobileTab(null);
                  }}
                  onResetCamera={() => {
                    setFollowActive(false);
                    setSelectedPlotId(null);
                    setFocusRequest({ type: 'reset', nonce: Date.now() });
                    setMobileTab(null);
                  }}
                />
              )}
              {mobileTab === 'log' && <TownLogPanel logs={logs} />}
              {mobileTab === 'decree' && (
                <DecreePanel
                  activeDecree={activeDecree}
                  timeOfDay={timeOfDay}
                  weather={weather}
                  townTheme={townTheme}
                  graphicsQuality={graphicsQuality}
                  turnIntervalSeconds={turnIntervalSeconds}
                  onIssueDecree={(text) => {
                    void handleIssueDecree(text);
                    setMobileTab(null);
                  }}
                  onChangeTimeOfDay={handleChangeTimeOfDay}
                  onChangeWeather={handleChangeWeather}
                  onChangeTownTheme={handleChangeTownTheme}
                  onChangeGraphicsQuality={handleChangeGraphicsQuality}
                  onChangeTurnInterval={handleChangeTurnInterval}
                  onResetTown={() => {
                    void handleResetTown();
                    setMobileTab(null);
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Town panels"
          className="grid grid-cols-3 border-t border-white/10 bg-slate-950/95 px-2 py-1"
        >
          <button
            type="button"
            onClick={() => handleMobileTabToggle('hierarchy')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'hierarchy'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Hierarchy</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileTabToggle('log')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'log'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ScrollText className="h-4 w-4" />
            <span>Town Log</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileTabToggle('decree')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'decree'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <MessageSquareText className="h-4 w-4" />
            <span>God Decree</span>
          </button>
        </nav>
      </div>

      {/* AI Providers Settings Modal */}
      <AIProvidersModal
        isOpen={settingsOpen}
        config={providerConfig}
        webhookUrl={remoteBridgeConfig.webhookUrl}
        hasServerDefaultKey={hasServerDefaultKey}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveProvider}
        onOpenRemoteBridge={() => setBridgeOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Remote Bridge Modal (Firestore Listener + Webhook & Telegram Alerts) */}
      <RemoteBridgeModal
        isOpen={bridgeOpen}
        config={remoteBridgeConfig}
        uid={user?.uid ?? null}
        recentRemoteCount={remoteExecutedCount}
        onClose={() => setBridgeOpen(false)}
        onSave={handleSaveRemoteBridge}
        onSimulateCommand={async (type: RemoteCommandType, value: string) => {
          if (!user) return;
          await enqueueRemoteCommand(user.uid, type, value, 'telegram');
        }}
      />

      {/* Help & AI Integration Guide Modal */}
      <HelpGuideModal
        isOpen={helpOpen}
        uid={user?.uid ?? null}
        appOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000'}
        onClose={() => setHelpOpen(false)}
        onOpenRemoteBridge={() => setBridgeOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>
  );
}
