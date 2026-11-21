export type LocationId = 'town_hall' | 'workshop' | 'market' | 'park';

export type PlotId =
  | 'plot_nw'
  | 'plot_ne'
  | 'plot_sw'
  | 'plot_se'
  | 'plot_n_west'
  | 'plot_n_east'
  | 'plot_s_west'
  | 'plot_s_east';

export type StructureType =
  | 'bakery'
  | 'watchtower'
  | 'greenhouse'
  | 'windmill'
  | 'library'
  | 'granary'
  | 'pavilion'
  | 'clock_tower';

export type StructureStatus = 'building' | 'complete';

export type BuildAction = 'none' | 'propose' | 'construct' | 'upgrade';

export type TimeOfDay = 'dawn' | 'day' | 'twilight' | 'night';

export type WeatherMode = 'summer' | 'rain' | 'winter';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export function detectDefaultGraphicsQuality(): GraphicsQuality {
  if (typeof window === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isSmallScreen = window.innerWidth < 768;
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  const isLowRam = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  if (isSmallScreen || isMobileUa || isLowRam) {
    return 'medium';
  }
  return 'high';
}

export function normalizeWeatherMode(val: unknown): WeatherMode {
  if (val === 'rain') return 'rain';
  if (val === 'winter') return 'winter';
  return 'summer';
}

export const MAX_TOWN_AGENTS = 15;

export const CORE_AGENT_IDS = [
  'mayor_sterling',
  'commander_vance',
  'architect_lyra',
  'worker_kai',
  'worker_pip',
] as const;

export type CoreAgentId = (typeof CORE_AGENT_IDS)[number];
export type AgentId = string;

export type HatStyle = 'straw' | 'cap' | 'helmet' | 'hood' | 'beret';

export interface OutfitPalette {
  coat: string;
  pants: string;
  hat: string;
  trim: string;
}

export interface HiredWorkerSpec {
  name: string;
  role: string;
  department: string;
  supervisor: string;
  personality: string;
  location: LocationId;
  assignedPlotId: PlotId | null;
  accentColor: string;
  outfitColors: OutfitPalette;
  hatStyle: HatStyle;
  dialogue: string;
  currentTask: string;
  thought: string;
}

export interface TownMetrics {
  prosperity: number;
  orderLevel: number;
  morale: number;
}

export interface TownStructure {
  plotId: PlotId;
  structureType: StructureType;
  status: StructureStatus;
  progress: number; // 0-100
  tier: number; // 1-3
  proposedBy: string;
  lastBuilder: string;
  updatedAtMs: number;
}

export interface AgentRecord {
  id: AgentId;
  name: string;
  rank: 1 | 2 | 3;
  role: string;
  department: string;
  supervisor: string | null;
  subordinates: string[];
  accentColor: string;
  personality?: string;
  assignedPlotId?: PlotId | null;
  hatStyle?: HatStyle;
  outfitColors?: OutfitPalette;
  isHired?: boolean;
  location: LocationId;
  activePlotId: PlotId | null;
  targetAgent: string | null;
  thought: string;
  dialogue: string;
  currentTask: string;
  userNote: string;
  updatedAtMs: number;
}

export interface TownLogItem {
  id: string;
  turnNumber: number;
  agentId: string;
  agentName: string;
  rank: 0 | 1 | 2 | 3; // 0 = God Decree
  location: LocationId | 'plaza';
  targetAgent: string | null;
  thought: string;
  dialogue: string;
  newTask: string;
  timestampMs: number;
}

export interface BuildOrderResult {
  action: BuildAction;
  plot_id: PlotId | null;
  structure_type: StructureType | null;
}

export interface AgentTurnResponse {
  thought: string;
  target_location: LocationId;
  target_agent: string | null;
  dialogue: string;
  new_task: string;
  metrics_delta: {
    prosperity: number;
    order: number;
    morale: number;
  };
  build_order?: BuildOrderResult;
  visit_plot_id?: PlotId | null;
  hired_worker?: HiredWorkerSpec | null;
}

export interface WeatherSeasonEffect {
  weather: WeatherMode;
  label: string;
  badgeText: string;
  tone: 'amber' | 'sky' | 'indigo';
  constructionMultiplier: number;
  hasWinterProtection: boolean;
  hasBakery: boolean;
  hasGreenhouseOrGranary: boolean;
  hasWindmill: boolean;
  hasPavilion: boolean;
  shiftHeadline: string;
  shiftDetail: string;
}

export function getWeatherSeasonEffect(
  weather: WeatherMode,
  structures: TownStructure[],
): WeatherSeasonEffect {
  const completed = structures.filter((s) => s.status === 'complete');
  const hasWatchtower = completed.some((s) => s.structureType === 'watchtower');
  const hasTier2Plus = completed.some((s) => s.tier >= 2);
  const hasWinterProtection = hasWatchtower || hasTier2Plus;
  const hasBakery = completed.some((s) => s.structureType === 'bakery');
  const hasGreenhouseOrGranary = completed.some(
    (s) => s.structureType === 'greenhouse' || s.structureType === 'granary',
  );
  const hasWindmill = completed.some((s) => s.structureType === 'windmill');
  const hasPavilion = completed.some((s) => s.structureType === 'pavilion');

  if (weather === 'rain') {
    return {
      weather,
      label: 'Rain',
      badgeText: hasGreenhouseOrGranary
        ? 'Rain · Greenhouse/Granary +25%'
        : 'Rain · Shelter Seekers',
      tone: 'sky',
      constructionMultiplier: 1.0,
      hasWinterProtection,
      hasBakery,
      hasGreenhouseOrGranary,
      hasWindmill,
      hasPavilion,
      shiftHeadline: 'Steady rains arrive across Alderbrook Square.',
      shiftDetail:
        'Greenhouse and Granary output rises +25%; villagers seek brief shelter under the Pavilion or indoors while Bakery ovens steam.',
    };
  }

  if (weather === 'winter') {
    const parts: string[] = [];
    parts.push(hasWinterProtection ? 'Watchtower Guarded' : 'Build -20%');
    parts.push(hasBakery ? 'Bakery Warmth' : 'Needs Bakery');
    return {
      weather,
      label: 'Winter',
      badgeText: `Winter · ${parts.join(' · ')}`,
      tone: 'indigo',
      constructionMultiplier: hasWinterProtection ? 1.0 : 0.8,
      hasWinterProtection,
      hasBakery,
      hasGreenhouseOrGranary,
      hasWindmill,
      hasPavilion,
      shiftHeadline: 'Winter snowstorms sweep into Alderbrook.',
      shiftDetail: hasWinterProtection
        ? 'Watchtower & upgraded structures shield builders from frost; Bakery warmth demand increases.'
        : 'Outdoor construction slows 20% without a Guard Watchtower or Tier 2+ structure; Bakery warmth is needed.',
    };
  }

  return {
    weather: 'summer',
    label: 'Summer',
    badgeText: hasWindmill
      ? 'Summer · Windmill +35% & Lively Plaza'
      : 'Summer · Lively Plaza Breeze',
    tone: 'amber',
    constructionMultiplier: 1.0,
    hasWinterProtection,
    hasBakery,
    hasGreenhouseOrGranary,
    hasWindmill,
    hasPavilion,
    shiftHeadline: 'Warm Summer sunshine returns to Alderbrook.',
    shiftDetail:
      'Grain Windmill efficiency climbs and villagers socialize briskly around the Garden Pavilion and Town Square fountain.',
  };
}

export type AIProviderPreset = 'gemini' | 'openrouter' | 'groq' | 'openai' | 'custom';

export interface AIProviderConfig {
  preset: AIProviderPreset;
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

export interface ProviderPresetMeta {
  id: AIProviderPreset;
  label: string;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
}

export const ALL_PLOT_IDS: PlotId[] = [
  'plot_nw',
  'plot_ne',
  'plot_sw',
  'plot_se',
  'plot_n_west',
  'plot_n_east',
  'plot_s_west',
  'plot_s_east',
];

export const ALL_STRUCTURE_TYPES: StructureType[] = [
  'bakery',
  'watchtower',
  'greenhouse',
  'windmill',
  'library',
  'granary',
  'pavilion',
  'clock_tower',
];

export const PLOT_META: Record<PlotId, { label: string; shortLabel: string; x: number; z: number }> = {
  plot_nw: { label: 'Northwest Corner', shortLabel: 'NW', x: -8.6, z: -8.4 },
  plot_ne: { label: 'Northeast Corner', shortLabel: 'NE', x: 8.6, z: -8.4 },
  plot_sw: { label: 'Southwest Corner', shortLabel: 'SW', x: -8.6, z: 8.2 },
  plot_se: { label: 'Southeast Corner', shortLabel: 'SE', x: 8.6, z: 8.2 },
  plot_n_west: { label: 'North-West Terrace', shortLabel: 'NWT', x: -5.2, z: -13.4 },
  plot_n_east: { label: 'North-East Terrace', shortLabel: 'NET', x: 5.2, z: -13.4 },
  plot_s_west: { label: 'South-West Meadow', shortLabel: 'SWM', x: -5.2, z: 13.0 },
  plot_s_east: { label: 'South-East Meadow', shortLabel: 'SEM', x: 5.2, z: 13.0 },
};

export const STRUCTURE_META: Record<
  StructureType,
  {
    label: string;
    category: string;
    color: string;
    bonus: { prosperity: number; order: number; morale: number };
  }
> = {
  bakery: {
    label: 'Artisan Bakery',
    category: 'Prosperity & Warmth',
    color: '#f59e0b',
    bonus: { prosperity: 3, order: 0, morale: 3 },
  },
  watchtower: {
    label: 'Guard Watchtower',
    category: 'Civic Order',
    color: '#3b82f6',
    bonus: { prosperity: 0, order: 5, morale: 1 },
  },
  greenhouse: {
    label: 'Glass Greenhouse',
    category: 'Botanical Growth',
    color: '#10b981',
    bonus: { prosperity: 2, order: 0, morale: 4 },
  },
  windmill: {
    label: 'Grain Windmill',
    category: 'Economy & Harvest',
    color: '#eab308',
    bonus: { prosperity: 5, order: 1, morale: 1 },
  },
  library: {
    label: 'Civic Archive',
    category: 'Order & Culture',
    color: '#6366f1',
    bonus: { prosperity: 1, order: 3, morale: 3 },
  },
  granary: {
    label: 'Timber Granary',
    category: 'Supply Reserves',
    color: '#ea580c',
    bonus: { prosperity: 4, order: 2, morale: 0 },
  },
  pavilion: {
    label: 'Garden Pavilion',
    category: 'Community Morale',
    color: '#14b8a6',
    bonus: { prosperity: 1, order: 0, morale: 5 },
  },
  clock_tower: {
    label: 'Civic Clock Tower',
    category: 'Town Landmark',
    color: '#a855f7',
    bonus: { prosperity: 2, order: 3, morale: 2 },
  },
};

export const AI_PROVIDER_PRESETS: ProviderPresetMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.1-flash-lite',
    suggestedModels: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-4-neon'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    suggestedModels: ['google/gemini-2.5-flash', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    defaultModel: '',
    suggestedModels: [],
  },
];

export const DEFAULT_PROVIDER_CONFIG: AIProviderConfig = {
  preset: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  modelName: 'gemini-3.1-flash-lite',
  apiKey: '',
};

export const DEFAULT_TOWN_METRICS: TownMetrics = {
  prosperity: 72,
  orderLevel: 78,
  morale: 75,
};

export const LOCATION_LABELS: Record<LocationId | 'plaza', string> = {
  town_hall: 'Town Hall',
  workshop: 'Workshop',
  market: 'Market',
  park: 'Park',
  plaza: 'Town Square',
};

export const AGENT_TURN_ORDER: AgentId[] = [
  'mayor_sterling',
  'commander_vance',
  'architect_lyra',
  'worker_kai',
  'worker_pip',
];

export function createInitialAgents(): AgentRecord[] {
  const now = Date.now();
  return [
    {
      id: 'mayor_sterling',
      name: 'Mayor Sterling',
      rank: 1,
      role: 'Town Mayor',
      department: 'Executive',
      supervisor: null,
      subordinates: ['Commander Vance', 'Architect Lyra'],
      accentColor: '#6366f1',
      location: 'town_hall',
      activePlotId: null,
      targetAgent: 'Architect Lyra',
      thought: 'Reviewing town expansion plots and awaiting proposals from Vance and Lyra.',
      dialogue: 'Survey the open corner plots and plan our next civic building.',
      currentTask: 'Reviewing town growth goals at Town Hall',
      userNote: '',
      updatedAtMs: now,
    },
    {
      id: 'commander_vance',
      name: 'Commander Vance',
      rank: 2,
      role: 'Security & Logistics',
      department: 'Security & Supply',
      supervisor: 'Mayor Sterling',
      subordinates: ['Worker Kai'],
      accentColor: '#3b82f6',
      location: 'market',
      activePlotId: null,
      targetAgent: 'Worker Kai',
      thought: 'Market supply crates need tallying before we haul timber to new building plots.',
      dialogue: 'Kai, check the Market timber stock for upcoming town construction.',
      currentTask: 'Coordinating supply logistics',
      userNote: '',
      updatedAtMs: now,
    },
    {
      id: 'architect_lyra',
      name: 'Architect Lyra',
      rank: 2,
      role: 'Builder & Economy',
      department: 'Civic Works',
      supervisor: 'Mayor Sterling',
      subordinates: ['Worker Pip'],
      accentColor: '#14b8a6',
      location: 'workshop',
      activePlotId: null,
      targetAgent: 'Worker Pip',
      thought: 'Open plots around the square are staked and ready for fresh blueprints.',
      dialogue: 'Pip, ready your mallet—let us draft our first building on an open plot.',
      currentTask: 'Drafting civic blueprints',
      userNote: '',
      updatedAtMs: now,
    },
    {
      id: 'worker_kai',
      name: 'Worker Kai',
      rank: 3,
      role: 'Guard & Hauler',
      department: 'Security & Supply',
      supervisor: 'Commander Vance',
      subordinates: [],
      accentColor: '#f59e0b',
      location: 'market',
      activePlotId: null,
      targetAgent: 'Commander Vance',
      thought: 'Hauling timber beams and checking perimeter stakes as Vance ordered.',
      dialogue: 'On it, Commander! Timber and stone beams are stacked for building.',
      currentTask: 'Hauling timber at Market',
      userNote: '',
      updatedAtMs: now,
    },
    {
      id: 'worker_pip',
      name: 'Worker Pip',
      rank: 3,
      role: 'Artisan & Gatherer',
      department: 'Civic Works',
      supervisor: 'Architect Lyra',
      subordinates: [],
      accentColor: '#ea580c',
      location: 'park',
      activePlotId: null,
      targetAgent: 'Architect Lyra',
      thought: 'Gathering smooth river stones near the Park fountain for new foundations.',
      dialogue: 'Foundation stone is ready whenever Architect Lyra stakes a plot!',
      currentTask: 'Gathering materials at Park',
      userNote: '',
      updatedAtMs: now,
    },
  ];
}

export function createInitialLogs(): TownLogItem[] {
  return [
    {
      id: 'init-0',
      turnNumber: 0,
      agentId: 'mayor_sterling',
      agentName: 'Mayor Sterling',
      rank: 1,
      location: 'town_hall',
      targetAgent: null,
      thought: 'Eight open plots around Alderbrook Square await self-directed expansion.',
      dialogue: 'Alderbrook council is in session. Managers, plan our town expansion.',
      newTask: 'Presiding at Town Hall',
      timestampMs: Date.now(),
    },
  ];
}

export function createHiredAgentRecord(
  spec: HiredWorkerSpec,
  existingIds: Set<string>,
  nowMs = Date.now(),
): AgentRecord {
  const slug = spec.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18) || 'worker';
  let id = `hire_${slug}`;
  let suffix = 1;
  while (existingIds.has(id) || id.length > 38) {
    const tag = `${suffix++}`;
    id = `hire_${slug.slice(0, 30 - tag.length)}_${tag}`;
  }
  existingIds.add(id);

  return {
    id,
    name: spec.name,
    rank: 3,
    role: spec.role,
    department: spec.department,
    supervisor: spec.supervisor,
    subordinates: [],
    accentColor: spec.accentColor || spec.outfitColors.coat,
    personality: spec.personality,
    assignedPlotId: spec.assignedPlotId,
    hatStyle: spec.hatStyle,
    outfitColors: spec.outfitColors,
    isHired: true,
    location: spec.location,
    activePlotId: spec.assignedPlotId,
    targetAgent: spec.supervisor,
    thought: spec.thought,
    dialogue: spec.dialogue,
    currentTask: spec.currentTask,
    userNote: '',
    updatedAtMs: nowMs,
  };
}

export type RemoteCommandType =
  | 'set_weather'
  | 'hire_worker'
  | 'god_decree'
  | 'build_structure'
  | 'build_plot';

export interface RemoteCommandRecord {
  id: string;
  type: RemoteCommandType;
  value?: string;
  payload?: string | Record<string, unknown>;
  source?: string;
  status: 'pending' | 'executed' | 'failed';
  resultMessage?: string;
  createdAtMs?: number;
}

export interface RemoteBridgeConfig {
  webhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  notifyOnBuildComplete: boolean;
  notifyOnTier3: boolean;
  notifyOnWeatherShift: boolean;
  notifyOnRemoteCommand: boolean;
}

export const DEFAULT_REMOTE_BRIDGE_CONFIG: RemoteBridgeConfig = {
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  notifyOnBuildComplete: true,
  notifyOnTier3: true,
  notifyOnWeatherShift: true,
  notifyOnRemoteCommand: false,
};

