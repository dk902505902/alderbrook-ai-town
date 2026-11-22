import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Cpu,
  Crown,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  Send,
  Settings,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  advanceProviderKeyCursor,
  buildInferenceHeaders,
  formatCompactModelName,
  resolveInferenceConfig,
} from '../lib/aiRouting.ts';
import {
  executeWebSearch,
  hasAnySearchApiKey,
  MAYOR_WEB_SEARCH_TOGGLE_KEY,
  type WebSearchConfig,
  type WebSearchResult,
} from '../lib/webSearch.ts';
import {
  ALL_BIOME_IDS,
  BIOME_META,
  getAvailablePlotIds,
  getStructureDisplayLabel,
  getWeatherSeasonEffect,
  inferCustomBuildingSpec,
  MAX_TOWN_AGENTS,
  STRUCTURE_META,
  type AgentRecord,
  type AIProviderConfig,
  type BiomeId,
  type CustomBuildingStyle,
  type StructureType,
  type TimeOfDay,
  type TownLogItem,
  type TownMetrics,
  type TownStructure,
  type TownSummary,
  type WeatherMode,
} from '../types/town.ts';

export interface MayorBuildResult {
  ok: boolean;
  badge: string;
  detail: string;
}

export interface ResearchDispatchResult {
  scoutName: string;
  hiredNew: boolean;
}

interface MayorChatModalProps {
  isOpen: boolean;
  isPlaying: boolean;
  townName: string;
  activeTownId: string;
  savedTowns: TownSummary[];
  unlockedBiomes: BiomeId[];
  roads: string[];
  railSpurBuilt: boolean;
  autoMode: boolean;
  agents: AgentRecord[];
  structures: TownStructure[];
  logs: TownLogItem[];
  metrics: TownMetrics;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  activeDecree: string;
  providerConfig: AIProviderConfig;
  webSearchConfig: WebSearchConfig;
  hasServerDefaultKey: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onToggleAutoMode: (next?: boolean) => void;
  onSwitchTown: (townId: string) => Promise<void>;
  onCreateTown: (name: string) => Promise<MayorBuildResult>;
  onExpandBiome: (biome: BiomeId) => Promise<MayorBuildResult>;
  onBuildRoad: (targetHint?: string) => Promise<MayorBuildResult>;
  onExtendRail: () => Promise<MayorBuildResult>;
  onBuildStructure: (
    structureType: StructureType,
    displayLabel?: string,
    customStyle?: CustomBuildingStyle,
    preferredBiome?: BiomeId,
  ) => Promise<MayorBuildResult>;
  onHireWorker: (prompt: string) => Promise<string | null>;
  onIssueDecree: (decree: string) => Promise<void>;
  onDispatchResearcher: (topic: string) => Promise<ResearchDispatchResult>;
  onMayorSpeak: (dialogue: string) => void;
  onOpenWebSearchSettings: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'player' | 'mayor';
  text: string;
  badge?: string;
  modelTag?: string;
  sources?: WebSearchResult[];
  needsSearchSetup?: boolean;
  timestampMs: number;
}

interface MayorActionPlan {
  type:
    | 'none'
    | 'build'
    | 'hire'
    | 'decree'
    | 'create_town'
    | 'expand_biome'
    | 'build_road'
    | 'extend_rail'
    | 'toggle_auto';
  target?: string;
  workerPrompt?: string;
  decree?: string;
  townName?: string;
  biome?: BiomeId;
  roadTarget?: string;
  autoEnabled?: boolean;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const BASE_STARTER_CHIPS = [
  'Build a Research Lab',
  'Expand map to Cave',
  'Build a road',
  'Extend train track',
  'Status report',
];

const MAX_CHAT_MESSAGES = 30;

function loadWebSearchEnabled(config: WebSearchConfig): boolean {
  try {
    const saved = window.localStorage.getItem(MAYOR_WEB_SEARCH_TOGGLE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Ignore storage issues
  }
  return hasAnySearchApiKey(config);
}

function detectMentionedBiome(text: string): BiomeId | undefined {
  const lower = text.toLowerCase();
  if (/\b(cave|crystal|cavern|mine|mountain)\b/.test(lower)) return 'cave';
  if (/\b(desert|dune|oasis|sand|cactus|canyon)\b/.test(lower)) return 'desert';
  if (/\b(forest|woods|pine|timber|grove|jungle)\b/.test(lower)) return 'forest';
  return undefined;
}

function extractBuildingName(rawText: string): string {
  const cleaned = rawText
    .replace(/^(mayor\s*,?\s*)/i, '')
    .replace(
      /^(please\s+)?(can you\s+)?(build|construct|erect|open|add|make|create|upgrade|put)\s+(me\s+)?(a|an|the|new)?\s*/i,
      '',
    )
    .replace(/\b(in the|near the|at the|by the|inside the)\s+(forest|dense forest|desert|desert dunes|cave|crystal cave|mountain cave|town)\b.*$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  return cleaned.slice(0, 36);
}

function mapBuildingRequest(rawText: string): {
  structureType: StructureType;
  displayLabel: string;
  customStyle?: CustomBuildingStyle;
  preferredBiome?: BiomeId;
} {
  const lower = rawText.toLowerCase();
  const preferredBiome = detectMentionedBiome(rawText);

  // Explicit custom buildings (Research Lab, Observatory, Cafe Shop, Tavern, Forge, Guild, Cabin, etc.)
  if (
    /\b(research|lab|laboratory|science|academy|university|observatory|telescope|astro|planetarium|cafe|coffee|espresso|tea|bistro|tavern|inn|pub|forge|smith|foundry|smithy|workshop|guild|hall|clinic|hospital|museum|studio|cabin|lodge|outpost|camp)\b/.test(
      lower,
    )
  ) {
    const extracted = extractBuildingName(rawText) || rawText.trim();
    const spec = inferCustomBuildingSpec(extracted);
    return {
      structureType: 'custom',
      displayLabel: spec.label,
      customStyle: spec.style,
      preferredBiome,
    };
  }

  if (/\b(bakery|bread|pastry)\b/.test(lower)) {
    return { structureType: 'bakery', displayLabel: STRUCTURE_META.bakery.label, preferredBiome };
  }
  if (/\b(watchtower|guard tower|fort)\b/.test(lower)) {
    return {
      structureType: 'watchtower',
      displayLabel: STRUCTURE_META.watchtower.label,
      preferredBiome,
    };
  }
  if (/\b(greenhouse|farm|garden|botanic)\b/.test(lower)) {
    return {
      structureType: 'greenhouse',
      displayLabel: STRUCTURE_META.greenhouse.label,
      preferredBiome,
    };
  }
  if (/\b(windmill|mill|wind)\b/.test(lower)) {
    return { structureType: 'windmill', displayLabel: STRUCTURE_META.windmill.label, preferredBiome };
  }
  if (/\b(library|book|archive)\b/.test(lower)) {
    return { structureType: 'library', displayLabel: STRUCTURE_META.library.label, preferredBiome };
  }
  if (/\b(granary|barn|silo|storage)\b/.test(lower)) {
    return { structureType: 'granary', displayLabel: STRUCTURE_META.granary.label, preferredBiome };
  }
  if (/\b(pavilion|stage|music|gazebo)\b/.test(lower)) {
    return { structureType: 'pavilion', displayLabel: STRUCTURE_META.pavilion.label, preferredBiome };
  }
  if (/\b(clock|bell)\b/.test(lower)) {
    return {
      structureType: 'clock_tower',
      displayLabel: STRUCTURE_META.clock_tower.label,
      preferredBiome,
    };
  }

  // Any other named building becomes a procedural custom building with its own nameplate!
  const extracted = extractBuildingName(rawText);
  if (extracted && !/^(building|plot|something|anything|one|house)$/i.test(extracted)) {
    const spec = inferCustomBuildingSpec(extracted);
    return {
      structureType: 'custom',
      displayLabel: spec.label,
      customStyle: spec.style,
      preferredBiome,
    };
  }

  return { structureType: 'bakery', displayLabel: STRUCTURE_META.bakery.label, preferredBiome };
}

function buildLiveStatusSummary(
  townName: string,
  weather: WeatherMode,
  timeOfDay: TimeOfDay,
  metrics: TownMetrics,
  agents: AgentRecord[],
  structures: TownStructure[],
  logs: TownLogItem[],
  unlockedBiomes: BiomeId[],
  roads: string[],
  railSpurBuilt: boolean,
  autoMode: boolean,
): string {
  const eff = getWeatherSeasonEffect(weather, structures);
  const built = structures.filter((s) => s.status === 'complete').length;
  const building = structures.filter((s) => s.status === 'building');
  const totalPlots = getAvailablePlotIds(unlockedBiomes).length;
  const latestLog = logs.find((l) => l.dialogue && l.agentId !== 'weather_shift');

  const sitePart =
    building.length > 0
      ? `${getStructureDisplayLabel(building[0])} is at ${building[0].progress}% construction`
      : built > 0
        ? `${built}/${totalPlots} town buildings are open`
        : `all ${totalPlots} plots are ready for your first project`;

  const frontierPart =
    unlockedBiomes.length > 0
      ? `Biomes unlocked: ${unlockedBiomes.map((b) => BIOME_META[b].shortLabel).join(', ')}`
      : '3 outer biomes (Forest, Desert, Cave) await expansion';

  const infraPart = `${roads.length} road${roads.length === 1 ? '' : 's'}, rail spur ${railSpurBuilt ? 'active' : 'not yet built'}, Auto Mode ${autoMode ? 'ON' : 'OFF'}`;
  const pulsePart = `Pulse: Prosperity ${metrics.prosperity}, Order ${metrics.orderLevel}, Morale ${metrics.morale}`;
  const activityPart = latestLog
    ? `Latest: ${latestLog.agentName} said "${latestLog.dialogue.slice(0, 68)}"`
    : 'Everyone is awaiting orders';

  return `${townName} is in ${timeOfDay} (${eff.label}) with ${agents.length}/${MAX_TOWN_AGENTS} villagers — ${sitePart}. ${frontierPart} (${infraPart}). ${pulsePart}. ${activityPart}.`;
}

function isSimpleGreeting(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[!?.,']/g, '').trim();
  return /^(hi|hello|hey|howdy|yo|greetings|good morning|good afternoon|good evening|hi mayor|hello mayor|hey mayor|mayor sterling|mayor)$/.test(
    cleaned,
  );
}

function isSimpleStatusCheck(text: string): boolean {
  const lower = text.toLowerCase();
  const hasActionVerb =
    /\b(build|construct|make|open|hire|recruit|employ|decree|announce|festival|news|search|weather in|expand|unlock|extend|rail|train|road|path|town|city|automatic|auto)\b/.test(
      lower,
    );
  if (hasActionVerb) return false;
  return /\b(what'?s happening|what is happening|status|report|how is (the )?town|how are things|whats up|what's up|town update|brief me)\b/.test(
    lower,
  );
}

function isLiveWebResearchQuery(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(build|construct|hire|recruit|upgrade|expand|unlock|road|rail|train|town|city|automatic)\b/.test(
      lower,
    ) &&
    !/\b(news|search|look up|internet|web|headlines|latest)\b/.test(lower)
  ) {
    return false;
  }
  return /\b(world news|5 world news|news|headlines|search|look up|lookup|google|latest|breaking|weather in|forecast in|price of|stock|bitcoin|crypto|score|who won|what happened in|today'?s|live info|internet|online)\b/.test(
    lower,
  );
}

function cleanSearchQueryFromMessage(text: string): string {
  const stripped = text
    .replace(/^🌐\s*/u, '')
    .replace(/^(mayor\s*,?\s*)/i, '')
    .replace(/^(give me|tell me|can you|please|search for|search|look up|find)\s+/i, '')
    .trim();
  if (/^5\s+world\s+news$/i.test(stripped) || /^world\s+news$/i.test(stripped)) {
    return 'top 5 world news headlines today';
  }
  return stripped.slice(0, 180) || 'top 5 world news headlines today';
}

function titleCaseWords(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .slice(0, 48);
}

function parseNewTownName(text: string): string | null {
  const cleaned = text.replace(/^(mayor\s*,?\s*)/i, '').replace(/[.!?]+$/g, '').trim();
  const calledMatch = cleaned.match(
    /(?:called|named)\s+["']?([a-zA-Z0-9][a-zA-Z0-9\s'-]{0,36})["']?/i,
  );
  if (calledMatch?.[1]) {
    const val = calledMatch[1].trim();
    if (val && !/^(for|to|with|please|now)$/i.test(val)) return titleCaseWords(val);
  }

  // e.g. "Create moon city", "Start a Starlight town", "Make Neo Village"
  const prefixNameMatch = cleaned.match(
    /(?:create|start|found|charter|make|build|open)\s+(?:a\s+)?(?:new\s+)?([a-zA-Z0-9][a-zA-Z0-9\s'-]{0,28}?)\s+(town|city|village|settlement)\b/i,
  );
  if (prefixNameMatch?.[1]) {
    const base = prefixNameMatch[1]
      .replace(/^(a|an|the|new|another|second|my)\s+/i, '')
      .trim();
    const kind = prefixNameMatch[2];
    if (base && !/^(a|an|the|new|another|second|my|one)$/i.test(base)) {
      return titleCaseWords(`${base} ${kind}`);
    }
  }

  // e.g. "Create new town Moon", "Start city Solaris"
  const suffixNameMatch = cleaned.match(
    /(?:new\s+)?(?:town|city|village|settlement)\s+["']?([a-zA-Z0-9][a-zA-Z0-9\s'-]{0,32})["']?/i,
  );
  if (suffixNameMatch?.[1]) {
    const val = suffixNameMatch[1].trim();
    if (val && !/^(for|to|with|please|now|hall|square|log|center)$/i.test(val)) {
      return titleCaseWords(val);
    }
  }

  return null;
}

export function parseLocalIntent(
  text: string,
  unlockedBiomes: BiomeId[],
): { reply: string; action: MayorActionPlan } | null {
  const lower = text.toLowerCase();

  // 1) Automatic City-Builder Mode toggle
  if (
    /\b(automatic|auto mode|autopilot|self[- ]?build|autonomous)\b/.test(lower) &&
    /\b(go|start|enable|turn on|activate|on|stop|disable|turn off|off|pause)\b/.test(lower)
  ) {
    const turnOff = /\b(stop|disable|turn off|off|pause)\b/.test(lower);
    return {
      reply: turnOff
        ? 'Automatic City-Builder mode paused. I await your manual orders!'
        : 'Automatic City-Builder mode ENGAGED! I will plan buildings, unlock outer biomes, lay roads, and recruit staff automatically.',
      action: { type: 'toggle_auto', autoEnabled: !turnOff },
    };
  }

  // 2) Create a NEW saved town / city (non-destructive) — handles "Create moon city", "Create a new town called New Haven", etc.
  if (
    /\b(create|start|found|charter|make|open|build)\b/.test(lower) &&
    /\b(town|city|village|settlement)\b/.test(lower) &&
    !/\b(town hall|town log|town pulse|town status|city hall|in town|in the town|for the town)\b/.test(
      lower,
    )
  ) {
    const parsedName = parseNewTownName(text) || 'New Haven';
    return {
      reply: `Chartering a brand-new saved town called ${parsedName} with a clean empty map! Your existing town stays safely saved in your Town Switcher.`,
      action: { type: 'create_town', townName: parsedName },
    };
  }

  // 3) Extend Train Track / Railway Spur
  if (
    /\b(train|rail|railway|track|tracks|spur|depot|express)\b/.test(lower) &&
    /\b(extend|build|add|expand|lay|connect|spur|new stop|station)\b/.test(lower)
  ) {
    return {
      reply:
        'Right away! Our track crew is laying the East Frontier Railway Spur and building a secondary wooden Depot stop.',
      action: { type: 'extend_rail' },
    };
  }

  // 4) Build Cobblestone Roads
  if (
    /\b(road|roads|path|street|cobblestone|highway|trail|lane)\b/.test(lower) &&
    /\b(build|lay|make|add|connect|extend|pave|create)\b/.test(lower)
  ) {
    const targetHint = text
      .replace(/^(mayor\s*,?\s*)/i, '')
      .replace(/^.*?\b(?:to|toward|towards|for)\b\s*/i, '')
      .trim()
      .slice(0, 64);
    return {
      reply: `Sending our stone masons out to pave a cobblestone road${targetHint ? ` to ${targetHint}` : ''} right now!`,
      action: { type: 'build_road', roadTarget: targetHint || text },
    };
  }

  // 5) Expand / Unlock Outer Biomes (Dense Forest, Desert Dunes, Crystal Mountain Cave)
  if (
    /\b(expand|unlock|open|explore|discover|reveal|add)\b/.test(lower) &&
    /\b(map|biome|biomes|frontier|forest|woods|desert|dunes|cave|crystal|mountain|outer|territory)\b/.test(
      lower,
    )
  ) {
    const mentioned = detectMentionedBiome(text);
    const nextLocked = ALL_BIOME_IDS.find((b) => !unlockedBiomes.includes(b));
    const chosenBiome = mentioned ?? nextLocked ?? 'forest';
    return {
      reply: `Surveyors dispatched! We are expanding the frontier into the ${BIOME_META[chosenBiome].label} and opening new outer building plots.`,
      action: { type: 'expand_biome', biome: chosenBiome },
    };
  }

  // 6) Build / Construct ANY preset or custom building (Research Lab, Observatory, Cafe Shop, etc.)
  if (
    /\b(build|construct|erect|open|add|make|create|upgrade)\b/.test(lower) &&
    !/\b(worker|villager|staff)\b/.test(lower) &&
    /\b(labs?|laborator(?:y|ies)|research|observator(?:y|ies)|cafes?|coffee|shops?|baker(?:y|ies)|watchtowers?|towers?|greenhouses?|farms?|windmills?|mills?|librar(?:y|ies)|granar(?:y|ies)|pavilions?|clocks?|taverns?|inns?|forges?|smith(?:y|ies)?|guilds?|clinics?|museums?|studios?|cabins?|outposts?|buildings?|plots?|stores?|houses?|schools?|markets?|fountains?|wells?|statues?|bridges?|monuments?|theat(?:er|re)s?|plazas?|gardens?|orchards?|banks?|docks?|piers?|temples?|shrin(?:e|es)|arenas?|lighthouses?|spires?|citadels?|barracks?)\b/.test(
      lower,
    )
  ) {
    const mapped = mapBuildingRequest(text);
    return {
      reply: `Splendid idea! I'm rallying Architect Lyra and our builders to get the ${mapped.displayLabel} underway right away.`,
      action: { type: 'build', target: mapped.displayLabel, biome: mapped.preferredBiome },
    };
  }

  // 7) Hire / Recruit worker
  if (/\b(hire|recruit|employ|bring in|add a worker|need a|get a)\b/.test(lower)) {
    const cleanedPrompt = text
      .replace(/^(mayor\s*,?\s*)/i, '')
      .trim()
      .slice(0, 180);
    return {
      reply: `On it! I'm sending word to the Guild Hall to recruit for "${cleanedPrompt}".`,
      action: { type: 'hire', workerPrompt: cleanedPrompt || 'Hire a skilled town worker' },
    };
  }

  // 8) Town Decree
  if (/\b(decree|proclaim|announce|festival|celebrate|declare)\b/.test(lower)) {
    const cleanedDecree = text.replace(/^(mayor\s*,?\s*)/i, '').trim().slice(0, 220);
    return {
      reply: `By order of Town Hall, I'll proclaim this across town immediately!`,
      action: { type: 'decree', decree: cleanedDecree },
    };
  }

  // 9) Generic build request in plain English ("build me a fountain") → procedural custom building
  if (
    /\b(build|construct|erect|create|add|place|put up|open|make)\b/.test(lower) &&
    !/\b(worker|villager|staff|plan|sure|it|this|that|things?|money|gold|timber|stone|food|better|worse|happy|sad)\b/.test(
      lower,
    ) &&
    extractBuildingName(text).length >= 3
  ) {
    const mapped = mapBuildingRequest(text);
    return {
      reply: `On it! Architect Lyra is drafting plans for the ${mapped.displayLabel} right now.`,
      action: {
        type: 'build',
        target: mapped.displayLabel,
        biome: mapped.preferredBiome,
      },
    };
  }

  return null;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function MayorChatModal({
  isOpen,
  isPlaying,
  townName,
  activeTownId,
  savedTowns,
  unlockedBiomes,
  roads,
  railSpurBuilt,
  autoMode,
  agents,
  structures,
  logs,
  metrics,
  weather,
  timeOfDay,
  activeDecree,
  providerConfig,
  webSearchConfig,
  hasServerDefaultKey,
  onClose,
  onTogglePlay,
  onToggleAutoMode,
  onSwitchTown,
  onCreateTown,
  onExpandBiome,
  onBuildRoad,
  onExtendRail,
  onBuildStructure,
  onHireWorker,
  onIssueDecree,
  onDispatchResearcher,
  onMayorSpeak,
  onOpenWebSearchSettings,
}: MayorChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'mayor-welcome',
      sender: 'mayor',
      text: `Welcome to ${townName} Town Hall! Ask me to build a Research Lab or Cafe Shop, expand into Forest/Desert/Cave, pave cobblestone roads, extend the train track, toggle Auto mode, or create a brand-new saved town.`,
      modelTag: 'Instant · 0 tokens',
      timestampMs: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('Mayor Sterling is checking the town ledger…');
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() =>
    loadWebSearchEnabled(webSearchConfig),
  );
  const [voiceReadout, setVoiceReadout] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [creatingTownInline, setCreatingTownInline] = useState(false);
  const [newTownDraft, setNewTownDraft] = useState('');

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const resolvedMayorModel = useMemo(
    () => resolveInferenceConfig(providerConfig, 'mayor_sterling'),
    [providerConfig],
  );

  const speechInputSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const speechOutputSupported = useMemo(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    [],
  );

  const hasUsableMayorLlm =
    !resolvedMayorModel.isExternalCli &&
    (resolvedMayorModel.apiKeys.length > 0 ||
      (resolvedMayorModel.providerId === 'gemini' && hasServerDefaultKey));

  const modelBadgeLabel = resolvedMayorModel.isExternalCli
    ? 'External CLI · 0 tokens'
    : hasUsableMayorLlm
      ? formatCompactModelName(resolvedMayorModel.modelName)
      : 'Fast Local Mode · 0 tokens';

  const starterChips = useMemo(
    () => (webSearchEnabled ? ['🌐 5 World News', ...BASE_STARTER_CHIPS] : BASE_STARTER_CHIPS),
    [webSearchEnabled],
  );

  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen) {
      recognitionRef.current?.stop();
      setIsListening(false);
      if (speechOutputSupported) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen, speechOutputSupported]);

  if (!isOpen) return null;

  const handleToggleWebSearch = () => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MAYOR_WEB_SEARCH_TOGGLE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const speakMayorReply = (text: string) => {
    if (!voiceReadout || !speechOutputSupported) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      utter.pitch = 0.96;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore browser TTS issues
    }
  };

  const appendMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg].slice(-MAX_CHAT_MESSAGES));
  };

  const executeMayorAction = async (
    action: MayorActionPlan,
    fallbackText: string,
  ): Promise<{ badge?: string; extraNote?: string }> => {
    if (action.type === 'toggle_auto') {
      const nextVal = typeof action.autoEnabled === 'boolean' ? action.autoEnabled : !autoMode;
      onToggleAutoMode(nextVal);
      return {
        badge: nextVal ? '⚡ Auto City-Builder: ON' : '⚡ Auto City-Builder: OFF',
      };
    }

    if (action.type === 'create_town') {
      const requestedName =
        (action.townName || parseNewTownName(fallbackText) || 'New Haven').trim();
      const res = await onCreateTown(requestedName);
      return {
        badge: res.ok ? `🏙️ ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'expand_biome') {
      const chosenBiome: BiomeId =
        action.biome ||
        detectMentionedBiome(fallbackText) ||
        ALL_BIOME_IDS.find((b) => !unlockedBiomes.includes(b)) ||
        'forest';
      const res = await onExpandBiome(chosenBiome);
      return {
        badge: res.ok ? `🗺️ ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'build_road') {
      const res = await onBuildRoad(action.roadTarget || fallbackText);
      return {
        badge: res.ok ? `🛣️ ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'extend_rail') {
      const res = await onExtendRail();
      return {
        badge: res.ok ? `🚂 ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'build') {
      const mapped = mapBuildingRequest(action.target || fallbackText);
      const res = await onBuildStructure(
        mapped.structureType,
        mapped.displayLabel,
        mapped.customStyle,
        action.biome || mapped.preferredBiome,
      );
      return {
        badge: res.ok ? `🏗️ ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'hire') {
      if (agents.length >= MAX_TOWN_AGENTS) {
        return {
          badge: `⚠️ Town Full (${MAX_TOWN_AGENTS}/${MAX_TOWN_AGENTS})`,
          extraNote: `We're already at our ${MAX_TOWN_AGENTS}-villager capacity for smooth mobile performance.`,
        };
      }
      const prompt = (action.workerPrompt || fallbackText).trim();
      const recruited = await onHireWorker(prompt);
      if (recruited) {
        return { badge: `👷 Hired: ${recruited}` };
      }
      return {
        badge: '⚠️ Hiring needs an AI key in Settings',
        extraNote:
          'Open AI Providers settings to configure a key if you want custom AI-generated workers.',
      };
    }

    if (action.type === 'decree') {
      const decreeText = (action.decree || fallbackText).trim().slice(0, 220);
      if (decreeText) {
        await onIssueDecree(decreeText);
        return {
          badge: `📜 Decree: ${decreeText.slice(0, 42)}${decreeText.length > 42 ? '…' : ''}`,
        };
      }
    }

    return {};
  };

  const handleSend = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setInput('');
    const now = Date.now();
    appendMessage({
      id: `player-${now}`,
      sender: 'player',
      text: trimmed,
      timestampMs: now,
    });

    setIsSending(true);
    setStatusNotice('Mayor Sterling is checking the town ledger…');

    try {
      // 1) Live Web Research Path (when Web Search is ON and user asks for live info)
      if (webSearchEnabled && isLiveWebResearchQuery(trimmed)) {
        if (!hasAnySearchApiKey(webSearchConfig)) {
          const setupReply =
            'Web Search is turned ON, but I need a Search API key (Tavily, Exa, Serper, or Brave Search) before my scouts can check the outside world.';
          onMayorSpeak(setupReply);
          appendMessage({
            id: `mayor-${Date.now()}`,
            sender: 'mayor',
            text: setupReply,
            badge: '🌐 Add a Web Search API Key',
            modelTag: 'Web Search Setup · 0 tokens',
            needsSearchSetup: true,
            timestampMs: Date.now(),
          });
          return;
        }

        const searchQuery = cleanSearchQueryFromMessage(trimmed);
        setStatusNotice(`Dispatching News Scout to research "${searchQuery.slice(0, 40)}"…`);

        const [dispatchRes, searchRes] = await Promise.all([
          onDispatchResearcher(searchQuery),
          executeWebSearch(webSearchConfig, searchQuery, 5),
        ]);

        if (!searchRes.ok || searchRes.results.length === 0) {
          const failReply = `My scout ${dispatchRes.scoutName} tried searching via ${searchRes.providerName}, but hit a snag: ${
            searchRes.error || 'no results returned'
          }.`;
          onMayorSpeak(failReply.slice(0, 180));
          appendMessage({
            id: `mayor-${Date.now()}`,
            sender: 'mayor',
            text: failReply,
            badge: `⚠️ Search failed (${searchRes.providerName})`,
            modelTag: searchRes.providerName,
            needsSearchSetup: true,
            timestampMs: Date.now(),
          });
          return;
        }

        const topResults = searchRes.results.slice(0, 5);
        let summaryReply = '';
        let usedTag = `${searchRes.providerName} · 0 LLM tokens`;

        if (hasUsableMayorLlm) {
          setStatusNotice(
            `Mayor Sterling is summarizing ${topResults.length} reports from ${dispatchRes.scoutName}…`,
          );
          try {
            advanceProviderKeyCursor(resolvedMayorModel);
            const res = await fetch('/api/town/mayor-chat', {
              method: 'POST',
              headers: buildInferenceHeaders(resolvedMayorModel),
              body: JSON.stringify({
                message: trimmed,
                townName,
                weather,
                timeOfDay,
                activeDecree,
                unlockedBiomes,
                roads,
                railSpurBuilt,
                autoMode,
                metrics,
                agents: agents.slice(0, 6).map((a) => ({
                  name: a.name,
                  role: a.role,
                  currentTask: a.currentTask,
                  location: a.location,
                })),
                structures: structures.map((s) => ({
                  plotId: s.plotId,
                  structureType: s.structureType,
                  customLabel: s.customLabel,
                  status: s.status,
                  tier: s.tier,
                })),
                webResults: topResults,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { reply?: string; modelUsed?: string };
              if (data.reply) {
                summaryReply = data.reply;
                usedTag = `${formatCompactModelName(data.modelUsed || resolvedMayorModel.modelName)} + ${searchRes.providerName}`;
              }
            }
          } catch {
            // Fall back to zero-token summary below
          }
        }

        if (!summaryReply) {
          summaryReply = `${dispatchRes.scoutName} just returned from the wire with ${topResults.length} fresh dispatches:\n${topResults
            .map((r, i) => `${i + 1}. ${r.title} (${r.source}) — ${r.snippet}`)
            .join('\n')}`;
        }

        const scoutBadge = dispatchRes.hiredNew
          ? `🌐 Hired & Dispatched ${dispatchRes.scoutName} · ${topResults.length} sources (${searchRes.providerName})`
          : `🌐 Researched by ${dispatchRes.scoutName} · ${topResults.length} sources (${searchRes.providerName})`;

        onMayorSpeak(
          `${dispatchRes.scoutName} brought back ${topResults.length} fresh reports on "${searchQuery.slice(0, 48)}"!`,
        );
        speakMayorReply(summaryReply.slice(0, 320));
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: summaryReply,
          badge: scoutBadge,
          modelTag: usedTag,
          sources: topResults,
          timestampMs: Date.now(),
        });
        return;
      }

      // 2) Zero-Token Fast Path: simple greetings & status reports
      if (isSimpleGreeting(trimmed)) {
        const eff = getWeatherSeasonEffect(weather, structures);
        const reply = `Good day from ${townName}! We're in ${eff.label} (${timeOfDay}) with ${agents.length} villagers. Tell me to build a Research Lab, expand to the Cave, lay roads, extend the train track, or switch on Auto mode!`;
        onMayorSpeak(reply);
        speakMayorReply(reply);
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: reply,
          modelTag: 'Instant · 0 tokens',
          timestampMs: Date.now(),
        });
        return;
      }

      if (isSimpleStatusCheck(trimmed)) {
        const reply = buildLiveStatusSummary(
          townName,
          weather,
          timeOfDay,
          metrics,
          agents,
          structures,
          logs,
          unlockedBiomes,
          roads,
          railSpurBuilt,
          autoMode,
        );
        onMayorSpeak(reply.slice(0, 180));
        speakMayorReply(reply);
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: reply,
          modelTag: 'Live Status · 0 tokens',
          timestampMs: Date.now(),
        });
        return;
      }

      // 3) Single-Call LLM Path (when Mayor Sterling has an active AI provider key)
      let replyText = '';
      let actionPlan: MayorActionPlan = { type: 'none' };
      let modelTag = 'Local Intent · 0 tokens';

      if (hasUsableMayorLlm) {
        try {
          advanceProviderKeyCursor(resolvedMayorModel);
          const res = await fetch('/api/town/mayor-chat', {
            method: 'POST',
            headers: buildInferenceHeaders(resolvedMayorModel),
            body: JSON.stringify({
              message: trimmed,
              history: messages.slice(-4).map((m) => ({ role: m.sender, text: m.text })),
              townName,
              weather,
              timeOfDay,
              activeDecree,
              unlockedBiomes,
              roads,
              railSpurBuilt,
              autoMode,
              metrics,
              agents: agents.map((a) => ({
                name: a.name,
                role: a.role,
                currentTask: a.currentTask,
                location: a.location,
              })),
              structures: structures.map((s) => ({
                plotId: s.plotId,
                structureType: s.structureType,
                customLabel: s.customLabel,
                status: s.status,
                tier: s.tier,
              })),
              recentLogs: logs.slice(0, 4).map((l) => ({
                agentName: l.agentName,
                dialogue: l.dialogue,
              })),
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              reply?: string;
              action?: MayorActionPlan;
              modelUsed?: string;
            };
            if (data.reply) {
              replyText = data.reply;
              actionPlan = data.action ?? { type: 'none' };
              modelTag = formatCompactModelName(data.modelUsed || resolvedMayorModel.modelName);
            }
          }
        } catch {
          // Fall back cleanly to local intent parser below
        }
      }

      // 4) Local Intent Fallback (guaranteed action execution even offline / zero-token mode)
      if (!replyText) {
        const localIntent = parseLocalIntent(trimmed, unlockedBiomes);
        if (localIntent) {
          replyText = localIntent.reply;
          actionPlan = localIntent.action;
        } else {
          replyText = `Heard loud and clear! ${buildLiveStatusSummary(
            townName,
            weather,
            timeOfDay,
            metrics,
            agents,
            structures,
            logs,
            unlockedBiomes,
            roads,
            railSpurBuilt,
            autoMode,
          )} Try "Build a Research Lab", "Expand map to Cave", "Extend the train track", or "Mayor go automatic".`;
        }
      } else if (actionPlan.type === 'none') {
        const fallbackIntent = parseLocalIntent(trimmed, unlockedBiomes);
        if (fallbackIntent) {
          actionPlan = fallbackIntent.action;
        }
      }

      const execOutcome = await executeMayorAction(actionPlan, trimmed);
      const finalReply = execOutcome.extraNote
        ? `${replyText} ${execOutcome.extraNote}`
        : replyText;

      onMayorSpeak(finalReply.slice(0, 180));
      speakMayorReply(finalReply);
      appendMessage({
        id: `mayor-${Date.now()}`,
        sender: 'mayor',
        text: finalReply,
        badge: execOutcome.badge,
        modelTag,
        timestampMs: Date.now(),
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateTownInlineSubmit = async () => {
    const clean = newTownDraft.trim();
    if (!clean || isSending) return;
    setCreatingTownInline(false);
    setNewTownDraft('');
    const res = await onCreateTown(clean);
    appendMessage({
      id: `mayor-town-${Date.now()}`,
      sender: 'mayor',
      text: res.ok
        ? `Welcome to ${clean}! Your previous town stays safely saved — switch back anytime using the Town Switcher.`
        : res.detail,
      badge: res.ok ? `🏙️ ${res.badge}` : `⚠️ ${res.badge}`,
      modelTag: 'Town Charter · 0 tokens',
      timestampMs: Date.now(),
    });
  };

  const handleToggleMic = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput(transcript);
          void handleSend(transcript);
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mayor-chat-title"
    >
      <div className="flex h-[88dvh] max-h-[740px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-900 shadow-2xl">
        {/* Header Bar with Auto Mode + Web Search + Pause/Play */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
              <Crown className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="mayor-chat-title"
                className="truncate font-display text-sm font-semibold text-white"
              >
                Mayor Sterling
              </h2>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Cpu className="h-3 w-3 shrink-0 text-amber-300/80" />
                <span className="truncate font-mono">{modelBadgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {/* Automatic City-Builder Toggle */}
            <button
              type="button"
              onClick={() => onToggleAutoMode()}
              aria-pressed={autoMode}
              title={
                autoMode
                  ? 'Automatic City-Builder is ON — Mayor autonomously builds, expands & hires'
                  : 'Turn ON Automatic City-Builder mode'
              }
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition-colors ${
                autoMode
                  ? 'border-violet-400/60 bg-violet-500/25 text-violet-100 hover:bg-violet-500/35'
                  : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-slate-200'
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span>Auto: {autoMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Web Search ON/OFF Toggle */}
            <button
              type="button"
              onClick={handleToggleWebSearch}
              aria-pressed={webSearchEnabled}
              title={
                webSearchEnabled
                  ? 'Web Search is ON — Mayor can look up live internet news'
                  : 'Web Search is OFF — tap to enable live internet search'
              }
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition-colors ${
                webSearchEnabled
                  ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                  : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-slate-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span>Web: {webSearchEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Pause / Play Town Toggle */}
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause town simulation' : 'Play town simulation'}
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              }`}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {speechOutputSupported && (
              <button
                type="button"
                onClick={() => {
                  const next = !voiceReadout;
                  setVoiceReadout(next);
                  if (!next) window.speechSynthesis.cancel();
                }}
                title={voiceReadout ? 'Mute Mayor voice readout' : 'Read Mayor replies aloud'}
                aria-label={voiceReadout ? 'Mute Mayor voice' : 'Enable Mayor voice'}
                className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border transition-colors ${
                  voiceReadout
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {voiceReadout ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Mayor chat"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Compact Non-Destructive Town Switcher Bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-950/60 px-3.5 py-2">
          {!creatingTownInline ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                <select
                  aria-label="Switch active saved town"
                  value={activeTownId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId === '__new__') {
                      setCreatingTownInline(true);
                      return;
                    }
                    void onSwitchTown(nextId);
                  }}
                  className="min-h-[32px] min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-slate-900 px-2 text-xs font-medium text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  {savedTowns.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.isMain ? `${t.name} (Main)` : t.name} · {t.buildingCount} bldgs · {t.population} pop
                    </option>
                  ))}
                  <option value="__new__">+ New Town…</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setCreatingTownInline(true)}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Town</span>
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateTownInlineSubmit();
              }}
              className="flex flex-1 items-center gap-1.5"
            >
              <input
                type="text"
                value={newTownDraft}
                onChange={(e) => setNewTownDraft(e.target.value)}
                maxLength={48}
                autoFocus
                placeholder="New town name (e.g. New Haven)…"
                className="min-h-[34px] min-w-0 flex-1 rounded-lg border border-amber-400/50 bg-slate-900 px-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newTownDraft.trim()}
                className="min-h-[34px] rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingTownInline(false);
                  setNewTownDraft('');
                }}
                className="min-h-[34px] rounded-lg px-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Live Back-and-Forth Chat Feed */}
        <div className="hud-scroll flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
          {messages.map((msg) => {
            const isPlayer = msg.sender === 'player';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isPlayer
                      ? 'rounded-br-sm bg-amber-500 font-medium text-slate-950'
                      : 'rounded-bl-sm border border-white/10 bg-slate-950/90 text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {msg.badge && (
                    <div className="mt-2 inline-flex items-center rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                      {msg.badge}
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2">
                      <div className="text-[10px] font-semibold tracking-wide text-cyan-300 uppercase">
                        Verified Web Sources
                      </div>
                      {msg.sources.map((src, idx) => (
                        <a
                          key={`${msg.id}-src-${idx}`}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                        >
                          <span className="truncate">
                            {idx + 1}. {src.title}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-slate-400">
                            <span>{src.source}</span>
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.needsSearchSetup && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenWebSearchSettings();
                      }}
                      className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Open Web Search Providers →</span>
                    </button>
                  )}
                </div>
                {!isPlayer && msg.modelTag && (
                  <span className="mt-1 px-1 font-mono text-[10px] text-slate-500">
                    Mayor Sterling · {msg.modelTag}
                  </span>
                )}
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-amber-200">
                {statusNotice}
              </div>
            </div>
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Starter Chips + Input Bar */}
        <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/95 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {starterChips.map((chip) => {
              const isWebChip = chip.startsWith('🌐');
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleSend(chip)}
                  className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    isWebChip
                      ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                      : 'border-white/10 bg-slate-900 text-slate-200 hover:border-amber-400/50 hover:text-amber-200'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend(input);
            }}
            className="flex items-center gap-1.5"
          >
            {speechInputSupported && (
              <button
                type="button"
                onClick={handleToggleMic}
                disabled={isSending}
                aria-label={isListening ? 'Stop voice input' : 'Speak to Mayor Sterling'}
                className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  isListening
                    ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                    : 'border-white/15 bg-slate-900 text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={260}
              disabled={isSending}
              placeholder={
                isListening
                  ? 'Listening… speak to Mayor Sterling'
                  : webSearchEnabled
                    ? 'Build Research Lab, expand Cave, or search live news…'
                    : 'Build Research Lab, expand Cave, pave roads, or go auto…'
              }
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-900 px-3 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!input.trim() || isSending}
              aria-label="Send message to Mayor Sterling"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
