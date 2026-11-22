import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Compass,
  Crown,
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
import { MayorChatModal, type MayorBuildResult } from './components/MayorChatModal.tsx';
import { RemoteBridgeModal } from './components/RemoteBridgeModal.tsx';
import { SignalRelayModal } from './components/SignalRelayModal.tsx';
import { TownLogPanel } from './components/TownLogPanel.tsx';
import { TownMinimap } from './components/TownMinimap.tsx';
import { TownViewport } from './components/TownViewport.tsx';
import {
  advanceProviderKeyCursor,
  buildInferenceHeaders,
  computeActualKeySlot,
  countCharacterOverrides,
  resolveInferenceConfig,
  sanitizeProviderConfig,
} from './lib/aiRouting.ts';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { soundscape } from './lib/soundscape.ts';
import {
  enqueueRemoteCommand,
  loadOrInitializeTown,
  markRemoteCommandStatus,
  persistAgentNote,
  persistAgentTurn,
  persistCliAgentUpdate,
  persistEnvironmentSettings,
  persistGodDecree,
  persistHiredWorkers,
  persistRemoteStructureAction,
  persistWeatherShift,
  resetTownInFirestore,
  subscribePendingRemoteCommands,
} from './lib/townStore.ts';
import {
  loadWebSearchConfig,
  saveWebSearchConfig,
  type WebSearchConfig,
} from './lib/webSearch.ts';
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
  DEFAULT_SIGNAL_RELAY_CONFIG,
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
  type CliAgentActivity,
  type GraphicsQuality,
  type HiredWorkerSpec,
  type LocationId,
  type PlotId,
  type RemoteBridgeConfig,
  type RemoteCommandRecord,
  type RemoteCommandType,
  type SignalRelayConfig,
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
const SIGNAL_RELAY_STORAGE_KEY = 'alderbrook_signal_relay_v1';
const LOCAL_TOWN_ID_STORAGE_KEY = 'alderbrook_local_town_id';
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
    if (!raw) return sanitizeProviderConfig(DEFAULT_PROVIDER_CONFIG);
    return sanitizeProviderConfig(JSON.parse(raw));
  } catch {
    return sanitizeProviderConfig(DEFAULT_PROVIDER_CONFIG);
  }
}

function loadSignalRelayConfig(): SignalRelayConfig {
  try {
    const raw = window.localStorage.getItem(SIGNAL_RELAY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SIGNAL_RELAY_CONFIG };
    const parsed = JSON.parse(raw) as Partial<SignalRelayConfig>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      customTownId: typeof parsed.customTownId === 'string' ? parsed.customTownId : '',
      agentSecret: typeof parsed.agentSecret === 'string' ? parsed.agentSecret : '',
    };
  } catch {
    return { ...DEFAULT_SIGNAL_RELAY_CONFIG };
  }
}

function loadOrCreateLocalTownId(): string {
  try {
    const saved = window.localStorage.getItem(LOCAL_TOWN_ID_STORAGE_KEY);
    if (saved && /^[a-zA-Z0-9_-]{4,64}$/.test(saved)) {
      return saved;
    }
    const generated = `alderbrook_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(LOCAL_TOWN_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'alderbrook_local';
  }
}

function parseRemotePayloadObject(cmd: RemoteCommandRecord): Record<string, unknown> {
  if (cmd.payload && typeof cmd.payload === 'object') {
    return cmd.payload as Record<string, unknown>;
  }
  if (typeof cmd.payload === 'string') {
    const trimmed = cmd.payload.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Ignore non-JSON string payloads
      }
    }
  }
  return {};
}

function parseRemoteLocation(raw: unknown): LocationId | null {
  const val = String(raw ?? '').trim().toLowerCase();
  if (val === 'town_hall' || val === 'workshop' || val === 'market' || val === 'park') {
    return val;
  }
  return null;
}

function resolveTargetVillager(
  agents: AgentRecord[],
  hintRaw: unknown,
): AgentRecord {
  const hint = String(hintRaw ?? '').trim().toLowerCase();
  if (hint) {
    const exactId = agents.find((a) => a.id.toLowerCase() === hint);
    if (exactId) return exactId;
    const byName = agents.find(
      (a) =>
        a.name.toLowerCase() === hint ||
        a.name.toLowerCase().includes(hint) ||
        a.role.toLowerCase().includes(hint),
    );
    if (byName) return byName;
  }
  return agents.find((a) => a.id === 'mayor_sterling') ?? agents[0];
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
    | { type: 'signal_relay'; nonce: number }
    | { type: 'reset'; nonce: number }
    | null
  >(null);

  // Desktop sidebar collapse states
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Mobile bottom drawer state
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);

  // AI Provider, Remote Bridge & Signal Relay (CLI Hub) settings
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>(() => loadProviderConfig());
  const [remoteBridgeConfig, setRemoteBridgeConfig] = useState<RemoteBridgeConfig>(() =>
    loadRemoteBridgeConfig(),
  );
  const [signalRelayConfig, setSignalRelayConfig] = useState<SignalRelayConfig>(() =>
    loadSignalRelayConfig(),
  );
  const [webSearchConfig, setWebSearchConfig] = useState<WebSearchConfig>(() =>
    loadWebSearchConfig(),
  );
  const [localTownId] = useState<string>(() => loadOrCreateLocalTownId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'llm' | 'search'>('llm');
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [signalRelayOpen, setSignalRelayOpen] = useState(false);
  const [mayorChatOpen, setMayorChatOpen] = useState(false);
  const [townHallPromptOpen, setTownHallPromptOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [remoteExecutedCount, setRemoteExecutedCount] = useState(0);
  const [signalRelayPulseNonce, setSignalRelayPulseNonce] = useState(0);
  const [triggerTrainNonce, setTriggerTrainNonce] = useState(0);
  const [recentCliAgents, setRecentCliAgents] = useState<CliAgentActivity[]>([]);
  const [relayServerOnline, setRelayServerOnline] = useState(false);
  const [hasServerDefaultKey, setHasServerDefaultKey] = useState(false);

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

  const effectiveBaseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const effectiveTownId =
    signalRelayConfig.customTownId.trim() || user?.uid || localTownId;

  const activeAgent = agents[activeAgentIndex % agents.length];
  const activeAgentId = activeAgent?.id ?? 'mayor_sterling';
  const inFlightRef = useRef(false);
  const processingCommandIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (res.ok) setRelayServerOnline(true);
        return res.json();
      })
      .then((data: { hasDefaultKey?: boolean }) => {
        setHasServerDefaultKey(Boolean(data.hasDefaultKey));
      })
      .catch(() => {
        setHasServerDefaultKey(false);
        setRelayServerOnline(false);
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

    const resolvedInference = resolveInferenceConfig(snap.providerConfig, currentAgent.id);

    // Zero-token External CLI Agent mode: skip LLM API calls completely for this villager
    if (resolvedInference.isExternalCli) {
      const nextIndex = (snap.activeAgentIndex + 1) % snap.agents.length;
      const now = Date.now();
      const cliWaitLog: TownLogItem = {
        id: `cli-wait-${currentAgent.id}-${now}`,
        turnNumber: snap.turnCount,
        agentId: currentAgent.id,
        agentName: currentAgent.name,
        rank: currentAgent.rank,
        location: currentAgent.location,
        targetAgent: null,
        thought: 'Assigned to External CLI Agent — skipped in-app LLM call (0 API tokens spent).',
        dialogue: 'Listening on The Signal Relay for external CLI orders.',
        newTask: currentAgent.currentTask,
        modelUsed: 'External CLI (0 tokens)',
        providerLabel: 'Signal Relay',
        timestampMs: now,
      };
      setActiveAgentIndex(nextIndex);
      setLogs((prev) => [cliWaitLog, ...prev].slice(0, 50));
      setSecondsLeft(snap.turnIntervalSeconds);
      inFlightRef.current = false;
      setIsThinking(false);
      return;
    }

    advanceProviderKeyCursor(resolvedInference);

    try {
      const res = await fetch('/api/town/turn', {
        method: 'POST',
        headers: buildInferenceHeaders(resolvedInference),
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
        modelUsed?: string;
        keyAttemptIndex?: number;
        error?: string;
        code?: string;
      };

      if (!res.ok || !payload.turnResult) {
        if (payload.code === 'MISSING_API_KEY') {
          setIsPlaying(false);
          setSettingsOpen(true);
        }
        const prefix = resolvedInference.isOverride
          ? `${currentAgent.name} (${resolvedInference.providerLabel}): `
          : '';
        setErrorBanner(`${prefix}${payload.error || 'Failed to advance simulation turn.'}`);
        return;
      }

      const result = payload.turnResult;
      const actualModelUsed = payload.modelUsed?.trim() || resolvedInference.modelName;
      const actualKeySlot = computeActualKeySlot(resolvedInference, payload.keyAttemptIndex);
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
        modelUsed: actualModelUsed,
        providerUsed: resolvedInference.providerId,
        providerLabel: resolvedInference.providerLabel,
        keySlot: actualKeySlot,
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
          modelUsed: actualModelUsed,
          providerUsed: resolvedInference.providerId,
          providerLabel: resolvedInference.providerLabel,
          keySlot: actualKeySlot,
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
    const cleanConfig = sanitizeProviderConfig(nextConfig);
    setProviderConfig(cleanConfig);
    setErrorBanner(null);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(cleanConfig));
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

    const resolvedInference = resolveInferenceConfig(snap.providerConfig, null);
    advanceProviderKeyCursor(resolvedInference);

    try {
      const res = await fetch('/api/town/hire', {
        method: 'POST',
        headers: buildInferenceHeaders(resolvedInference),
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
        modelUsed?: string;
        keyAttemptIndex?: number;
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

      const hireModelUsed = payload.modelUsed?.trim() || resolvedInference.modelName;
      const hireKeySlot = computeActualKeySlot(resolvedInference, payload.keyAttemptIndex);
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
        modelUsed: hireModelUsed,
        providerUsed: resolvedInference.providerId,
        providerLabel: resolvedInference.providerLabel,
        keySlot: hireKeySlot,
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

  const handleChangeTownTheme = useCallback(async (nextTheme: TownTheme) => {
    const preferredTod = TOWN_THEME_META[nextTheme].preferredTimeOfDay;
    setTownTheme(nextTheme);
    setTimeOfDay(preferredTod);
    const activeUser = stateRef.current.user;
    if (activeUser) {
      try {
        await persistEnvironmentSettings(activeUser.uid, {
          theme: nextTheme,
          timeOfDay: preferredTod,
        });
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }, []);

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

  const recordLocalCliActivity = useCallback(
    (agentName: string, lastAction: string, summary: string) => {
      const cleanName = agentName.trim().slice(0, 40) || 'cli_agent';
      const entry: CliAgentActivity = {
        agentName: cleanName,
        lastAction,
        summary: summary.slice(0, 140),
        lastSeenMs: Date.now(),
      };
      setRecentCliAgents((prev) =>
        [
          entry,
          ...prev.filter((item) => item.agentName.toLowerCase() !== cleanName.toLowerCase()),
        ].slice(0, 15),
      );
    },
    [],
  );

  // Unified Remote & External CLI Command Executor (Firestore onSnapshot + Signal Relay REST + Test Signal)
  const executeRemoteCommand = useCallback(
    async (cmd: RemoteCommandRecord, origin: 'firestore' | 'relay' | 'local_test') => {
      const snap = stateRef.current;
      const now = Date.now();
      const sourceLabel = cmd.source?.trim() || (origin === 'firestore' ? 'Telegram / Agent' : 'cli_agent');
      const payloadObj = parseRemotePayloadObject(cmd);
      let execStatus: 'executed' | 'failed' = 'executed';
      let resultMessage = '';
      let handledOwnLog = false;

      try {
        if (cmd.type === 'set_weather') {
          const rawWeather = payloadObj.weather ?? payloadObj.value ?? cmd.value ?? cmd.payload;
          const nextWeather = parseRemoteWeatherInput(rawWeather);
          if (!nextWeather) {
            execStatus = 'failed';
            resultMessage = `Unsupported weather value "${String(rawWeather ?? '')}". Use summer, rain, or winter.`;
          } else {
            await handleChangeWeather(nextWeather);
            resultMessage = `Weather set to ${nextWeather.toUpperCase()} via ${sourceLabel}.`;
          }
        } else if (cmd.type === 'set_theme') {
          const rawTheme = String(payloadObj.theme ?? payloadObj.value ?? cmd.value ?? '').trim().toLowerCase();
          const mappedTheme: TownTheme =
            rawTheme === 'fantasy' || rawTheme === 'fantasy_night'
              ? 'fantasy_night'
              : rawTheme === 'solarpunk' || rawTheme === 'solarpunk_oasis'
                ? 'solarpunk_oasis'
                : normalizeTownTheme(rawTheme);
          await handleChangeTownTheme(mappedTheme);
          resultMessage = `Theme switched to ${TOWN_THEME_META[mappedTheme].label} via ${sourceLabel}.`;
        } else if (cmd.type === 'trigger_train') {
          setTriggerTrainNonce(now);
          soundscape.playAgentChime(1);
          resultMessage = `Express Train summoned to Alderbrook Station by ${sourceLabel}.`;
        } else if (cmd.type === 'villager_speak') {
          const dialogue = String(
            payloadObj.dialogue ?? payloadObj.message ?? cmd.value ?? '',
          )
            .trim()
            .slice(0, 220);
          if (!dialogue) {
            execStatus = 'failed';
            resultMessage = 'villager_speak command required a non-empty dialogue string.';
          } else {
            const targetVillager = resolveTargetVillager(
              snap.agents,
              payloadObj.villagerId ?? payloadObj.agentId ?? payloadObj.villager ?? payloadObj.villagerName,
            );
            const nextLoc = parseRemoteLocation(payloadObj.location) ?? targetVillager.location;
            const targetAgentName =
              typeof payloadObj.targetAgent === 'string' && payloadObj.targetAgent.trim()
                ? payloadObj.targetAgent.trim().slice(0, 60)
                : null;
            const thoughtText =
              typeof payloadObj.thought === 'string' && payloadObj.thought.trim()
                ? payloadObj.thought.trim().slice(0, 240)
                : `External CLI agent (${sourceLabel}) spoke via The Signal Relay (0 API tokens).`;

            const updatedAgent: AgentRecord = {
              ...targetVillager,
              location: nextLoc,
              targetAgent: targetAgentName,
              thought: thoughtText,
              dialogue,
            };

            const cliLog: TownLogItem = {
              id: `cli-speak-${targetVillager.id}-${now}`,
              turnNumber: snap.turnCount,
              agentId: targetVillager.id,
              agentName: `${targetVillager.name} [CLI:${sourceLabel}]`.slice(0, 60),
              rank: targetVillager.rank,
              location: nextLoc,
              targetAgent: targetAgentName,
              thought: thoughtText,
              dialogue,
              newTask: targetVillager.currentTask,
              modelUsed: `CLI · ${sourceLabel}`,
              providerLabel: 'Signal Relay',
              timestampMs: now,
            };

            setAgents((prev) => prev.map((a) => (a.id === updatedAgent.id ? updatedAgent : a)));
            setLogs((prev) => [cliLog, ...prev].slice(0, 50));
            setSelectedAgentId(updatedAgent.id);
            setCommunicationEvent({
              speakerId: updatedAgent.id,
              targetAgentName,
              accentColor: updatedAgent.accentColor,
              nonce: now,
            });
            soundscape.playAgentChime(updatedAgent.rank);
            if (snap.user) {
              await persistCliAgentUpdate(snap.user.uid, updatedAgent, cliLog);
            }
            handledOwnLog = true;
            resultMessage = `${updatedAgent.name} (${sourceLabel}): "${dialogue}"`;
          }
        } else if (cmd.type === 'assign_task') {
          const taskText = String(
            payloadObj.task ?? payloadObj.instruction ?? cmd.value ?? '',
          )
            .trim()
            .slice(0, 220);
          if (!taskText) {
            execStatus = 'failed';
            resultMessage = 'assign_task command required a non-empty task string.';
          } else {
            const targetVillager = resolveTargetVillager(
              snap.agents,
              payloadObj.villagerId ?? payloadObj.agentId ?? payloadObj.villager ?? payloadObj.villagerName,
            );
            const nextLoc = parseRemoteLocation(payloadObj.location) ?? targetVillager.location;
            const updatedAgent: AgentRecord = {
              ...targetVillager,
              location: nextLoc,
              currentTask: taskText,
              userNote: `CLI (${sourceLabel}): ${taskText}`.slice(0, 180),
              thought: `Task assigned via Signal Relay by ${sourceLabel}.`,
              dialogue: `Copy that, ${sourceLabel} — on it!`,
            };

            const cliLog: TownLogItem = {
              id: `cli-task-${targetVillager.id}-${now}`,
              turnNumber: snap.turnCount,
              agentId: targetVillager.id,
              agentName: `${targetVillager.name} [CLI:${sourceLabel}]`.slice(0, 60),
              rank: targetVillager.rank,
              location: nextLoc,
              targetAgent: null,
              thought: `Assigned task via ${sourceLabel} (0 API tokens).`,
              dialogue: `New task from ${sourceLabel}: ${taskText}`.slice(0, 280),
              newTask: taskText,
              modelUsed: `CLI · ${sourceLabel}`,
              providerLabel: 'Signal Relay',
              timestampMs: now,
            };

            setAgents((prev) => prev.map((a) => (a.id === updatedAgent.id ? updatedAgent : a)));
            setLogs((prev) => [cliLog, ...prev].slice(0, 50));
            setSelectedAgentId(updatedAgent.id);
            soundscape.playAgentChime(updatedAgent.rank);
            if (snap.user) {
              await persistCliAgentUpdate(snap.user.uid, updatedAgent, cliLog);
            }
            handledOwnLog = true;
            resultMessage = `Assigned ${updatedAgent.name} (${sourceLabel}): ${taskText}`;
          }
        } else if (cmd.type === 'god_decree') {
          const rawDecree = String(payloadObj.decree ?? payloadObj.value ?? cmd.value ?? cmd.payload ?? '');
          const decreeText = rawDecree.trim().slice(0, 260);
          if (!decreeText) {
            execStatus = 'failed';
            resultMessage = 'Remote god_decree command had an empty decree message.';
          } else {
            await handleIssueDecree(decreeText);
            resultMessage = `Issued Civic Decree: "${decreeText}"`;
          }
        } else if (cmd.type === 'hire_worker') {
          const rawHire = String(payloadObj.prompt ?? payloadObj.value ?? cmd.value ?? cmd.payload ?? '');
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
              if (snap.user) {
                await persistRemoteStructureAction(snap.user.uid, 'create', created);
              }
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
              if (snap.user) {
                await persistRemoteStructureAction(snap.user.uid, 'progress', progressed);
              }
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
              if (snap.user) {
                await persistRemoteStructureAction(snap.user.uid, 'upgrade', upgraded);
              }
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

      const remoteLog: TownLogItem | null = handledOwnLog
        ? null
        : {
            id: `remote-${cmd.id.slice(0, 16)}-${now}`,
            turnNumber: stateRef.current.turnCount,
            agentId: 'remote_command',
            agentName: `[Signal Relay · ${sourceLabel}]`.slice(0, 60),
            rank: 0,
            location: 'plaza',
            targetAgent: null,
            thought: `Source: ${sourceLabel} · Action: ${cmd.type} (${cmd.value || (typeof cmd.payload === 'string' ? cmd.payload : 'payload')})`,
            dialogue: resultMessage,
            newTask: `Status: ${execStatus}`,
            modelUsed: `CLI · ${sourceLabel}`,
            providerLabel: 'Signal Relay',
            timestampMs: now,
          };

      if (remoteLog) {
        setLogs((prev) => [remoteLog, ...prev].slice(0, 50));
      }

      if (execStatus === 'executed') {
        setRemoteExecutedCount((c) => c + 1);
        setSignalRelayPulseNonce(now);
        recordLocalCliActivity(sourceLabel, cmd.type, resultMessage);
        dispatchBridgeNotification(
          'remote_command',
          `Signal Relay Executed (${cmd.type})`,
          resultMessage,
        );
      }

      if (origin === 'firestore' && snap.user) {
        try {
          await markRemoteCommandStatus(snap.user.uid, cmd.id, execStatus, resultMessage, remoteLog);
        } catch (err) {
          setErrorBanner(
            err instanceof Error ? err.message : 'Failed to update remote command status in Firestore.',
          );
        }
      }
    },
    [
      handleChangeWeather,
      handleChangeTownTheme,
      handleIssueDecree,
      handleHireWorker,
      dispatchBridgeNotification,
      recordLocalCliActivity,
    ],
  );

  // Real-time Firestore Remote Command Listener (onSnapshot)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribePendingRemoteCommands(
      user.uid,
      (pendingCommands) => {
        for (const cmd of pendingCommands) {
          if (processingCommandIdsRef.current.has(cmd.id)) continue;
          processingCommandIdsRef.current.add(cmd.id);
          void executeRemoteCommand(cmd, 'firestore');
        }
      },
      (err) => {
        setErrorBanner(err.message);
      },
    );

    return () => {
      unsub();
    };
  }, [user, executeRemoteCommand]);

  // Sync compact town state to Signal Relay REST endpoint (debounced, fails silently on static hosts)
  useEffect(() => {
    const townId = effectiveTownId;
    if (!townId) return;
    const timer = window.setTimeout(() => {
      const eff = getWeatherSeasonEffect(weather, structures);
      const compactState = {
        weather,
        season: eff.label,
        theme: townTheme,
        timeOfDay,
        turnCount,
        activeDecree,
        pulse: {
          prosperity: metrics.prosperity,
          order: metrics.orderLevel,
          morale: metrics.morale,
        },
        resources: {
          population: agents.length,
          maxPopulation: MAX_TOWN_AGENTS,
          completedBuildings: structures.filter((s) => s.status === 'complete').length,
          totalPlots: ALL_PLOT_IDS.length,
        },
        buildings: structures.map((s) => ({
          plotId: s.plotId,
          type: s.structureType,
          label: STRUCTURE_META[s.structureType].label,
          status: s.status,
          progress: s.progress,
          tier: s.tier,
        })),
        villagers: agents.map((a) => ({
          id: a.id,
          name: a.name,
          rank: a.rank,
          role: a.role,
          location: a.location,
          currentTask: a.currentTask,
          dialogue: a.dialogue,
        })),
        lastLogs: logs.slice(0, 5).map((l) => ({
          turn: l.turnNumber,
          agent: l.agentName,
          dialogue: l.dialogue,
          task: l.newTask,
          timestampMs: l.timestampMs,
        })),
      };

      fetch(`/api/town/${encodeURIComponent(townId)}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: signalRelayConfig.agentSecret.trim(),
          state: compactState,
        }),
      })
        .then((res) => {
          if (res.ok) setRelayServerOnline(true);
        })
        .catch(() => {
          // Static hosting (e.g., Hugging Face Spaces) — silent no-op
        });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    effectiveTownId,
    signalRelayConfig.agentSecret,
    weather,
    townTheme,
    timeOfDay,
    turnCount,
    activeDecree,
    metrics,
    agents,
    structures,
    logs,
  ]);

  // Lightweight Signal Relay command poller (2.5s when tab is visible)
  useEffect(() => {
    const townId = effectiveTownId;
    if (!townId) return;
    let cancelled = false;

    const pollRelay = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const headers: Record<string, string> = {};
        if (signalRelayConfig.agentSecret.trim()) {
          headers['x-town-secret'] = signalRelayConfig.agentSecret.trim();
        }
        const res = await fetch(`/api/town/${encodeURIComponent(townId)}/commands`, {
          headers,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          commands?: RemoteCommandRecord[];
          recentAgents?: CliAgentActivity[];
        };
        if (cancelled) return;
        setRelayServerOnline(true);
        if (Array.isArray(data.recentAgents) && data.recentAgents.length > 0) {
          setRecentCliAgents((prev) => {
            const merged = new Map<string, CliAgentActivity>();
            for (const item of [...data.recentAgents!, ...prev]) {
              const key = item.agentName.toLowerCase();
              const existing = merged.get(key);
              if (!existing || item.lastSeenMs > existing.lastSeenMs) {
                merged.set(key, item);
              }
            }
            return Array.from(merged.values())
              .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
              .slice(0, 15);
          });
        }
        if (Array.isArray(data.commands)) {
          for (const cmd of data.commands) {
            if (processingCommandIdsRef.current.has(cmd.id)) continue;
            processingCommandIdsRef.current.add(cmd.id);
            void executeRemoteCommand(cmd, 'relay');
          }
        }
      } catch {
        // Silent on static hosting
      }
    };

    const intervalId = window.setInterval(() => {
      void pollRelay();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [effectiveTownId, signalRelayConfig.agentSecret, executeRemoteCommand]);

  const handleUpdateSignalRelayConfig = (next: SignalRelayConfig) => {
    setSignalRelayConfig(next);
    try {
      window.localStorage.setItem(SIGNAL_RELAY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures
    }
  };

  const handleSelectSignalRelay = () => {
    setSelectedPlotId(null);
    setFollowActive(false);
    setMobileTab(null);
    setFocusRequest({ type: 'signal_relay', nonce: Date.now() });
    setSignalRelayOpen(true);
  };

  const handleTestSignalRelay = async (): Promise<{ ok: boolean; message: string }> => {
    const pingDialogue = 'Signal Relay online — ready for external CLI agents!';
    const secret = signalRelayConfig.agentSecret.trim();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['x-town-secret'] = secret;
      const res = await fetch(`/api/town/${encodeURIComponent(effectiveTownId)}/act`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'villager_speak',
          agentName: 'signal_test',
          villagerId: 'mayor_sterling',
          dialogue: pingDialogue,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { commandId?: string };
        const cmdId = data.commandId || `local_ping_${Date.now()}`;
        if (!processingCommandIdsRef.current.has(cmdId)) {
          processingCommandIdsRef.current.add(cmdId);
          await executeRemoteCommand(
            {
              id: cmdId,
              type: 'villager_speak',
              value: pingDialogue,
              payload: { villagerId: 'mayor_sterling', dialogue: pingDialogue },
              source: 'signal_test',
              status: 'pending',
              createdAtMs: Date.now(),
            },
            'relay',
          );
        }
        return {
          ok: true,
          message: 'Live Signal Relay ping accepted! Beacon pulsed and Town Log updated.',
        };
      }
    } catch {
      // Fallback for static hosting below
    }

    const fallbackId = `local_ping_${Date.now()}`;
    processingCommandIdsRef.current.add(fallbackId);
    await executeRemoteCommand(
      {
        id: fallbackId,
        type: 'villager_speak',
        value: pingDialogue,
        payload: { villagerId: 'mayor_sterling', dialogue: pingDialogue },
        source: 'signal_test',
        status: 'pending',
        createdAtMs: Date.now(),
      },
      'local_test',
    );
    return {
      ok: true,
      message: 'Simulated CLI ping executed locally! Beacon pulsed and Town Log updated.',
    };
  };

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
    setTownHallPromptOpen(false);
    setFollowActive(false);
    setFocusRequest({ type: 'agent', id, nonce: Date.now() });
  };

  const handleFocusLocation = (id: LocationId) => {
    setSelectedPlotId(null);
    setTownHallPromptOpen(id === 'town_hall');
    setFollowActive(false);
    setFocusRequest({ type: 'location', id, nonce: Date.now() });
  };

  const handleMayorBuildStructure = useCallback(
    async (structureType: StructureType, displayLabel?: string): Promise<MayorBuildResult> => {
      const snap = stateRef.current;
      const now = Date.now();
      const label = displayLabel || STRUCTURE_META[structureType].label;
      const target = parseRemoteBuildTarget(
        { id: `mayor_${now}`, type: 'build_structure', value: structureType, status: 'pending' },
        snap.structures,
      );
      if (!target) {
        return {
          ok: false,
          badge: 'All 8 plots at Tier 3',
          detail: 'Every plot in Alderbrook is already built and upgraded to Tier 3.',
        };
      }
      const existing = snap.structures.find((s) => s.plotId === target.plotId);
      const plotLabel = PLOT_META[target.plotId].shortLabel;
      let nextStruct: TownStructure;
      let actionKind: 'create' | 'progress' | 'upgrade';
      let badge: string;

      if (!existing) {
        nextStruct = {
          plotId: target.plotId,
          structureType,
          status: 'building',
          progress: 25,
          tier: 1,
          proposedBy: 'Mayor Sterling',
          lastBuilder: 'Mayor Sterling',
          updatedAtMs: now,
        };
        actionKind = 'create';
        badge = `Queued: ${label} (${plotLabel})`;
        setStructures((prev) => [...prev, nextStruct]);
        soundscape.playAgentChime(1);
      } else if (existing.status === 'building') {
        const nextProgress = Math.min(100, existing.progress + 50);
        const done = nextProgress >= 100;
        nextStruct = {
          ...existing,
          progress: nextProgress,
          status: done ? 'complete' : 'building',
          lastBuilder: 'Mayor Sterling',
          updatedAtMs: now,
        };
        actionKind = 'progress';
        badge = done ? `Completed: ${label} (${plotLabel})` : `Built: ${label} ${nextProgress}%`;
        setStructures((prev) => prev.map((s) => (s.plotId === nextStruct.plotId ? nextStruct : s)));
        if (done) soundscape.playBuildCompleteChime();
        else soundscape.playAgentChime(2);
      } else {
        nextStruct = {
          ...existing,
          tier: Math.min(3, existing.tier + 1),
          lastBuilder: 'Mayor Sterling',
          updatedAtMs: now,
        };
        actionKind = 'upgrade';
        badge = `Upgraded: ${label} to Tier ${nextStruct.tier}`;
        setStructures((prev) => prev.map((s) => (s.plotId === nextStruct.plotId ? nextStruct : s)));
        soundscape.playBuildCompleteChime();
      }

      const logItem: TownLogItem = {
        id: `mayor-build-${now}`,
        turnNumber: snap.turnCount,
        agentId: 'mayor_sterling',
        agentName: 'Mayor Sterling',
        rank: 1,
        location: 'town_hall',
        targetAgent: 'Architect Lyra',
        thought: `Player requested ${label} in Mayor Chat.`,
        dialogue: `${badge} — builders are mobilized!`,
        newTask: badge,
        timestampMs: now,
      };
      setLogs((prev) => [logItem, ...prev].slice(0, 50));
      setSelectedPlotId(target.plotId);
      setFocusRequest({ type: 'plot', id: target.plotId, nonce: now });
      if (snap.user) {
        try {
          await persistRemoteStructureAction(snap.user.uid, actionKind, nextStruct);
        } catch {
          // Non-fatal in chat
        }
      }
      return { ok: true, badge, detail: `${badge} on ${PLOT_META[target.plotId].label}.` };
    },
    [],
  );

  const handleMayorSpeak = useCallback((dialogue: string) => {
    const clean = dialogue.trim().slice(0, 200);
    if (!clean) return;
    setAgents((prev) =>
      prev.map((a) => (a.id === 'mayor_sterling' ? { ...a, dialogue: clean } : a)),
    );
  }, []);

  const handleSaveWebSearchConfig = useCallback((nextConfig: WebSearchConfig) => {
    const saved = saveWebSearchConfig(nextConfig);
    setWebSearchConfig(saved);
  }, []);

  const handleDispatchResearcher = useCallback(
    async (topic: string): Promise<{ scoutName: string; hiredNew: boolean }> => {
      const snap = stateRef.current;
      const now = Date.now();
      const existingScout = snap.agents.find((a) =>
        /scout|archivist|research|news|reporter|scribe/i.test(`${a.name} ${a.role}`),
      );

      let scoutName = existingScout?.name ?? 'Architect Lyra';
      let hiredNew = false;

      if (!existingScout && snap.agents.length < MAX_TOWN_AGENTS) {
        const hired = await handleHireWorker(
          'News Scout to gather live world news and research dispatches for Town Hall',
        );
        if (hired) {
          scoutName = hired;
          hiredNew = true;
        }
      }

      const taskSummary = `Live Web Research: "${topic.slice(0, 90)}"`;
      const researchLog: TownLogItem = {
        id: `web-research-${now}`,
        turnNumber: snap.turnCount,
        agentId: existingScout?.id ?? 'mayor_sterling',
        agentName: scoutName.slice(0, 60),
        rank: existingScout?.rank ?? 2,
        location: 'town_hall',
        targetAgent: 'Mayor Sterling',
        thought: `Dispatched by Mayor Sterling to look up live web information on "${topic.slice(0, 100)}".`,
        dialogue: `Checking live dispatches on "${topic.slice(0, 68)}" for Town Hall!`,
        newTask: taskSummary,
        providerLabel: 'Web Search',
        timestampMs: now,
      };
      setLogs((prev) => [researchLog, ...prev].slice(0, 50));
      soundscape.playAgentChime(2);
      return { scoutName, hiredNew };
    },
    [handleHireWorker],
  );

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
        signalRelayPulseNonce={signalRelayPulseNonce}
        triggerTrainNonce={triggerTrainNonce}
        onSelectAgent={handleSelectAgent}
        onSelectLocation={(loc) => {
          handleFocusLocation(loc);
          setErrorBanner(null);
        }}
        onSelectPlot={handleSelectPlot}
        onSelectSignalRelay={handleSelectSignalRelay}
        onDismissPlot={() => setSelectedPlotId(null)}
        onWhisperBuildPlot={handleWhisperBuildPlot}
        onMinimapUpdate={setMinimapCoords}
        onUserOrbitStart={() => setFollowActive(false)}
      />

      {/* Town Hall Quick Action Banner ("Talk to Mayor") */}
      {townHallPromptOpen && !mayorChatOpen && (
        <div className="fixed top-18 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-amber-400/40 bg-slate-950/95 px-3.5 py-2 shadow-2xl md:top-20">
          <span className="text-xs font-semibold text-white">Town Hall</span>
          <button
            type="button"
            onClick={() => {
              setTownHallPromptOpen(false);
              setMayorChatOpen(true);
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Crown className="h-3.5 w-3.5" />
            <span>Talk to Mayor</span>
          </button>
          <button
            type="button"
            onClick={() => setTownHallPromptOpen(false)}
            aria-label="Dismiss Town Hall prompt"
            className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

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
              onClick={() => {
                setTownHallPromptOpen(false);
                setMayorChatOpen(true);
              }}
              aria-label="Talk to Mayor Sterling"
              className="hidden min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-400/45 bg-amber-500/15 px-3 text-xs font-semibold whitespace-nowrap text-amber-200 transition-colors hover:bg-amber-500/25 md:inline-flex"
            >
              <Crown className="h-4 w-4" />
              <span>Talk to Mayor</span>
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
            onSelectSignalRelay={handleSelectSignalRelay}
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
                providerConfig={providerConfig}
                activeAgentId={activeAgentId}
                selectedAgentId={selectedAgentId}
                isHiring={isHiring}
                onSelectAgent={handleSelectAgent}
                onSendAgentNote={handleSendAgentNote}
                onHireWorker={handleHireWorker}
                onFocusLocation={handleFocusLocation}
                onSelectPlot={handleSelectPlot}
                onSelectSignalRelay={handleSelectSignalRelay}
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
                  {providerConfig.modelName}
                  {countCharacterOverrides(providerConfig) > 0
                    ? ` (+${countCharacterOverrides(providerConfig)} custom)`
                    : ''}{' '}
                  · Turn {turnCount}
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
                  providerConfig={providerConfig}
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
                  onSelectSignalRelay={handleSelectSignalRelay}
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
          className="grid grid-cols-4 border-t border-white/10 bg-slate-950/95 px-1.5 py-1"
        >
          <button
            type="button"
            onClick={() => {
              setMobileTab(null);
              setTownHallPromptOpen(false);
              setMayorChatOpen(true);
            }}
            className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors ${
              mayorChatOpen
                ? 'bg-amber-500 text-slate-950'
                : 'text-amber-300 hover:bg-amber-500/15'
            }`}
          >
            <Crown className="h-4 w-4" />
            <span>Mayor</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileTabToggle('hierarchy')}
            className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'hierarchy'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Town</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileTabToggle('log')}
            className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'log'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ScrollText className="h-4 w-4" />
            <span>Log</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileTabToggle('decree')}
            className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors ${
              mobileTab === 'decree'
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <MessageSquareText className="h-4 w-4" />
            <span>Decree</span>
          </button>
        </nav>
      </div>

      {/* AI Providers & Web Search Settings Modal */}
      <AIProvidersModal
        isOpen={settingsOpen}
        config={providerConfig}
        webSearchConfig={webSearchConfig}
        initialTab={settingsInitialTab}
        agents={agents}
        webhookUrl={remoteBridgeConfig.webhookUrl}
        hasServerDefaultKey={hasServerDefaultKey}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsInitialTab('llm');
        }}
        onSave={handleSaveProvider}
        onSaveWebSearchConfig={handleSaveWebSearchConfig}
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

      {/* The Signal Relay (CLI Agent Hub) Building Modal */}
      <SignalRelayModal
        isOpen={signalRelayOpen}
        config={signalRelayConfig}
        effectiveBaseUrl={effectiveBaseUrl}
        effectiveTownId={effectiveTownId}
        agents={agents}
        recentCliAgents={recentCliAgents}
        relayServerOnline={relayServerOnline}
        onClose={() => setSignalRelayOpen(false)}
        onUpdateConfig={handleUpdateSignalRelayConfig}
        onTestSignal={handleTestSignalRelay}
        onOpenAIProviders={() => {
          setSettingsInitialTab('llm');
          setSettingsOpen(true);
        }}
      />

      {/* Interactive Mayor Mode Chat Modal */}
      <MayorChatModal
        isOpen={mayorChatOpen}
        isPlaying={isPlaying}
        agents={agents}
        structures={structures}
        logs={logs}
        metrics={metrics}
        weather={weather}
        timeOfDay={timeOfDay}
        activeDecree={activeDecree}
        providerConfig={providerConfig}
        webSearchConfig={webSearchConfig}
        hasServerDefaultKey={hasServerDefaultKey}
        onClose={() => setMayorChatOpen(false)}
        onTogglePlay={() => {
          setSecondsLeft(turnIntervalSeconds);
          setIsPlaying((p) => !p);
        }}
        onBuildStructure={handleMayorBuildStructure}
        onHireWorker={handleHireWorker}
        onIssueDecree={handleIssueDecree}
        onDispatchResearcher={handleDispatchResearcher}
        onMayorSpeak={handleMayorSpeak}
        onOpenWebSearchSettings={() => {
          setSettingsInitialTab('search');
          setSettingsOpen(true);
        }}
      />

      {/* Help & AI Integration Guide Modal */}
      <HelpGuideModal
        isOpen={helpOpen}
        uid={user?.uid ?? null}
        appOrigin={effectiveBaseUrl}
        onClose={() => setHelpOpen(false)}
        onOpenRemoteBridge={() => setBridgeOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>
  );
}
