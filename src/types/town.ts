export type LocationId = 'town_hall' | 'workshop' | 'market' | 'park';

export type BiomeId = 'forest' | 'desert' | 'cave';

export const ALL_BIOME_IDS: BiomeId[] = ['forest', 'desert', 'cave'];

export type PlotId =
  | 'plot_nw'
  | 'plot_ne'
  | 'plot_sw'
  | 'plot_se'
  | 'plot_n_west'
  | 'plot_n_east'
  | 'plot_s_west'
  | 'plot_s_east'
  | 'plot_forest_1'
  | 'plot_forest_2'
  | 'plot_forest_3'
  | 'plot_forest_4'
  | 'plot_outer_nw'
  | 'plot_outer_n'
  | 'plot_desert_1'
  | 'plot_desert_2'
  | 'plot_desert_3'
  | 'plot_desert_4'
  | 'plot_outer_s'
  | 'plot_outer_sw'
  | 'plot_cave_1'
  | 'plot_cave_2'
  | 'plot_cave_3'
  | 'plot_cave_4'
  | 'plot_outer_ne'
  | 'plot_outer_w';

export type CustomBuildingStyle =
  | 'lab'
  | 'observatory'
  | 'cafe'
  | 'tavern'
  | 'forge'
  | 'guild'
  | 'cabin'
  | 'tower';

export type StructureType =
  | 'bakery'
  | 'watchtower'
  | 'greenhouse'
  | 'windmill'
  | 'library'
  | 'granary'
  | 'pavilion'
  | 'clock_tower'
  | 'custom';

export type StructureStatus = 'building' | 'complete';

export type BuildAction = 'none' | 'propose' | 'construct' | 'upgrade';

export type TimeOfDay = 'dawn' | 'day' | 'twilight' | 'night';

export type WeatherMode = 'summer' | 'rain' | 'winter';

export type TownTheme = 'meadow' | 'fantasy_night' | 'solarpunk_oasis';

export const ALL_TOWN_THEMES: TownTheme[] = ['meadow', 'fantasy_night', 'solarpunk_oasis'];

export function normalizeTownTheme(val: unknown): TownTheme {
  if (val === 'fantasy_night') return 'fantasy_night';
  if (val === 'solarpunk_oasis') return 'solarpunk_oasis';
  return 'meadow';
}

export interface TownThemeMeta {
  id: TownTheme;
  label: string;
  shortLabel: string;
  summary: string;
  preferredTimeOfDay: TimeOfDay;
  swatches: [string, string, string];
}

export const TOWN_THEME_META: Record<TownTheme, TownThemeMeta> = {
  meadow: {
    id: 'meadow',
    label: 'Alderbrook Meadow',
    shortLabel: 'Meadow',
    summary: 'Sunlit pastoral hills, warm oak timber, and classic slate roofs',
    preferredTimeOfDay: 'day',
    swatches: ['#739558', '#d97706', '#312e81'],
  },
  fantasy_night: {
    id: 'fantasy_night',
    label: 'Fantasy Night',
    shortLabel: 'Fantasy',
    summary: 'Silver moonlit stone, arcane violet lanterns, and glowing windows',
    preferredTimeOfDay: 'night',
    swatches: ['#0b1029', '#a855f7', '#fbbf24'],
  },
  solarpunk_oasis: {
    id: 'solarpunk_oasis',
    label: 'Solarpunk Oasis',
    shortLabel: 'Solarpunk',
    summary: 'Golden-hour sandstone, terracotta terraces, and cyan solar waters',
    preferredTimeOfDay: 'day',
    swatches: ['#e6c79c', '#0d9488', '#22d3ee'],
  },
};

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
  /** Optional custom procedural building nameplate (e.g. "Research Lab", "Cafe Shop") */
  customLabel?: string;
  /** Visual architecture preset for custom procedural buildings */
  customStyle?: CustomBuildingStyle;
}

export interface TownSummary {
  id: string;
  name: string;
  isMain: boolean;
  updatedAtMs: number;
  buildingCount: number;
  population: number;
}

export interface TownExpansionState {
  townName: string;
  unlockedBiomes: BiomeId[];
  roads: string[];
  railSpurBuilt: boolean;
  autoMode: boolean;
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
  /** Local-only inference metadata (not written to Firestore) */
  modelUsed?: string;
  providerUsed?: string;
  providerLabel?: string;
  keySlot?: number;
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
export type AIKeyStrategy = 'round_robin' | 'failover_only';
export const EXTERNAL_CLI_PROVIDER_ID = 'external_cli' as const;

export interface AIProviderEntry {
  /** Stable unique ID (e.g. 'gemini', 'groq', 'openrouter', 'openai', 'custom_173...') */
  id: string;
  preset: AIProviderPreset;
  name: string;
  baseUrl: string;
  defaultModel: string;
  /** Pool of 1 or more API keys for this provider (rotated & failed-over automatically) */
  apiKeys: string[];
  keyStrategy?: AIKeyStrategy;
}

export interface CharacterModelOverride {
  /** Matches an AIProviderEntry.id */
  providerId: string;
  model: string;
}

export interface SavedProviderCredentials {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
}

export interface AIProviderConfig {
  /** Active global default provider entry ID (matches an entry in providers[]) */
  defaultProviderId?: string;
  /** Multiple configured AI providers, each supporting multiple API keys */
  providers?: AIProviderEntry[];
  /** Mirrored global default fields kept in sync for backward compatibility */
  preset: AIProviderPreset;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  /** Legacy cached per-provider credentials (migrated automatically into providers[]) */
  providerCredentials?: Partial<Record<AIProviderPreset, SavedProviderCredentials>>;
  /** Optional per-character provider/model overrides; unset or null falls back to global default */
  characterModels?: Record<string, CharacterModelOverride | null>;
}

export interface ProviderPresetMeta {
  id: AIProviderPreset;
  label: string;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
}

export const CORE_PLOT_IDS: PlotId[] = [
  'plot_nw',
  'plot_ne',
  'plot_sw',
  'plot_se',
  'plot_n_west',
  'plot_n_east',
  'plot_s_west',
  'plot_s_east',
];

export const BIOME_PLOT_IDS: Record<BiomeId, PlotId[]> = {
  forest: [
    'plot_forest_1',
    'plot_forest_2',
    'plot_forest_3',
    'plot_forest_4',
    'plot_outer_nw',
    'plot_outer_n',
  ],
  desert: [
    'plot_desert_1',
    'plot_desert_2',
    'plot_desert_3',
    'plot_desert_4',
    'plot_outer_s',
    'plot_outer_sw',
  ],
  cave: [
    'plot_cave_1',
    'plot_cave_2',
    'plot_cave_3',
    'plot_cave_4',
    'plot_outer_ne',
    'plot_outer_w',
  ],
};

export const ALL_PLOT_IDS: PlotId[] = [
  ...CORE_PLOT_IDS,
  ...BIOME_PLOT_IDS.forest,
  ...BIOME_PLOT_IDS.desert,
  ...BIOME_PLOT_IDS.cave,
];

export function getAvailablePlotIds(unlockedBiomes: BiomeId[]): PlotId[] {
  const plots: PlotId[] = [...CORE_PLOT_IDS];
  for (const b of unlockedBiomes) {
    if (BIOME_PLOT_IDS[b]) {
      plots.push(...BIOME_PLOT_IDS[b]);
    }
  }
  return plots;
}

export interface BiomeMeta {
  id: BiomeId;
  label: string;
  shortLabel: string;
  direction: string;
  center: { x: number; z: number };
  color: string;
  roadId: string;
  plots: PlotId[];
  summary: string;
}

export const BIOME_META: Record<BiomeId, BiomeMeta> = {
  forest: {
    id: 'forest',
    label: 'Dense Forest',
    shortLabel: 'Forest',
    direction: 'North-West',
    center: { x: -28, z: -24 },
    color: '#16a34a',
    roadId: 'plaza_to_forest',
    plots: BIOME_PLOT_IDS.forest,
    summary: 'Deep pine timber groves, mossy boulders, and 6 outer woodland & north-ring build plots.',
  },
  desert: {
    id: 'desert',
    label: 'Desert Dunes',
    shortLabel: 'Desert',
    direction: 'South-East',
    center: { x: 28, z: 24 },
    color: '#d97706',
    roadId: 'plaza_to_desert',
    plots: BIOME_PLOT_IDS.desert,
    summary: 'Sun-baked golden dunes, saguaro cacti, sandstone arches, and 6 southern frontier plots.',
  },
  cave: {
    id: 'cave',
    label: 'Crystal Mountain Cave',
    shortLabel: 'Crystal Cave',
    direction: 'North-East',
    center: { x: 28, z: -25 },
    color: '#06b6d4',
    roadId: 'plaza_to_cave',
    plots: BIOME_PLOT_IDS.cave,
    summary: 'Hollow see-inside mountain cavern with glowing crystals and 6 highland & outer plots.',
  },
};

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

export const PLOT_META: Record<
  PlotId,
  { label: string; shortLabel: string; x: number; z: number; biome?: BiomeId }
> = {
  plot_nw: { label: 'Northwest Corner', shortLabel: 'NW', x: -8.6, z: -8.4 },
  plot_ne: { label: 'Northeast Corner', shortLabel: 'NE', x: 8.6, z: -8.4 },
  plot_sw: { label: 'Southwest Corner', shortLabel: 'SW', x: -8.6, z: 8.2 },
  plot_se: { label: 'Southeast Corner', shortLabel: 'SE', x: 8.6, z: 8.2 },
  plot_n_west: { label: 'North-West Terrace', shortLabel: 'NWT', x: -5.2, z: -13.4 },
  plot_n_east: { label: 'North-East Terrace', shortLabel: 'NET', x: 5.2, z: -13.4 },
  plot_s_west: { label: 'South-West Meadow', shortLabel: 'SWM', x: -5.2, z: 13.0 },
  plot_s_east: { label: 'South-East Meadow', shortLabel: 'SEM', x: 5.2, z: 13.0 },
  plot_forest_1: { label: 'Pine Glade Clearing', shortLabel: 'F1', x: -24.8, z: -22.2, biome: 'forest' },
  plot_forest_2: { label: 'Deepwood Timber Yard', shortLabel: 'F2', x: -30.5, z: -17.0, biome: 'forest' },
  plot_forest_3: { label: 'Deep Pine Overlook', shortLabel: 'F3', x: -36.2, z: -26.4, biome: 'forest' },
  plot_forest_4: { label: 'North Timber Terrace', shortLabel: 'F4', x: -20.5, z: -34.2, biome: 'forest' },
  plot_outer_nw: { label: 'Whispering Woods West', shortLabel: 'ONW', x: -35.4, z: -9.2, biome: 'forest' },
  plot_outer_n: { label: 'Northern Meadow Ridge', shortLabel: 'ON', x: -9.5, z: -34.6, biome: 'forest' },
  plot_desert_1: { label: 'Sunstone Outpost', shortLabel: 'D1', x: 25.2, z: 22.4, biome: 'desert' },
  plot_desert_2: { label: 'Dune Caravan Pad', shortLabel: 'D2', x: 30.8, z: 16.8, biome: 'desert' },
  plot_desert_3: { label: 'Suncrest Oasis Terrace', shortLabel: 'D3', x: 36.8, z: 25.8, biome: 'desert' },
  plot_desert_4: { label: 'South Caravan Plateau', shortLabel: 'D4', x: 19.6, z: 34.2, biome: 'desert' },
  plot_outer_s: { label: 'Southern Frontier Green', shortLabel: 'OS', x: -10.8, z: 34.0, biome: 'desert' },
  plot_outer_sw: { label: 'Southwest Meadow Glade', shortLabel: 'OSW', x: -34.8, z: 21.8, biome: 'desert' },
  plot_cave_1: { label: 'Crystal Cavern Floor', shortLabel: 'C1', x: 27.6, z: -24.6, biome: 'cave' },
  plot_cave_2: { label: 'Mountain Ridge Outpost', shortLabel: 'C2', x: 21.8, z: -28.8, biome: 'cave' },
  plot_cave_3: { label: 'High Crystal Terrace', shortLabel: 'C3', x: 36.5, z: -26.2, biome: 'cave' },
  plot_cave_4: { label: 'Northeast Foothill Pad', shortLabel: 'C4', x: 11.8, z: -34.6, biome: 'cave' },
  plot_outer_ne: { label: 'Eastern Frontier Vista', shortLabel: 'ONE', x: 37.4, z: -15.6, biome: 'cave' },
  plot_outer_w: { label: 'West Frontier Commons', shortLabel: 'OW', x: -35.8, z: 6.8, biome: 'cave' },
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
  custom: {
    label: 'Custom Civic Hall',
    category: 'Custom Project',
    color: '#06b6d4',
    bonus: { prosperity: 3, order: 2, morale: 3 },
  },
};

export const CUSTOM_STYLE_COLORS: Record<CustomBuildingStyle, string> = {
  lab: '#06b6d4',
  observatory: '#6366f1',
  cafe: '#d97706',
  tavern: '#b45309',
  forge: '#ea580c',
  guild: '#8b5cf6',
  cabin: '#16a34a',
  tower: '#3b82f6',
};

export function getStructureDisplayLabel(
  structure: Pick<TownStructure, 'structureType' | 'customLabel'>,
): string {
  if (structure.structureType === 'custom' && structure.customLabel?.trim()) {
    return structure.customLabel.trim();
  }
  return STRUCTURE_META[structure.structureType]?.label ?? 'Civic Structure';
}

export function getStructureColor(
  structure: Pick<TownStructure, 'structureType' | 'customStyle'>,
): string {
  if (structure.structureType === 'custom' && structure.customStyle) {
    return CUSTOM_STYLE_COLORS[structure.customStyle] ?? STRUCTURE_META.custom.color;
  }
  return STRUCTURE_META[structure.structureType]?.color ?? '#06b6d4';
}

export function inferCustomBuildingSpec(rawName: string): {
  label: string;
  style: CustomBuildingStyle;
  suggestedRole: string;
  suggestedWorkerPrompt: string;
} {
  const cleaned = rawName
    .replace(/^(a|an|the|new|custom|my)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 36);
  const label = cleaned
    ? cleaned
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Research Lab';
  const low = label.toLowerCase();

  if (/(research|lab|science|clinic|hospital|alchemy|tech|studio|academy)/i.test(low)) {
    return {
      label,
      style: 'lab',
      suggestedRole: 'Lead Researcher',
      suggestedWorkerPrompt: `Hire a brilliant Lead Researcher to run the ${label}`,
    };
  }
  if (/(observatory|star|astro|planetarium|telescope|beacon)/i.test(low)) {
    return {
      label,
      style: 'observatory',
      suggestedRole: 'Chief Astronomer',
      suggestedWorkerPrompt: `Hire a keen Chief Astronomer to staff the ${label}`,
    };
  }
  if (/(cafe|coffee|tea|bistro|espresso|roaster)/i.test(low)) {
    return {
      label,
      style: 'cafe',
      suggestedRole: 'Master Barista',
      suggestedWorkerPrompt: `Hire a friendly Master Barista to brew at the ${label}`,
    };
  }
  if (/(tavern|inn|pub|hotel|lodge|restaurant|diner)/i.test(low)) {
    return {
      label,
      style: 'tavern',
      suggestedRole: 'Head Innkeeper',
      suggestedWorkerPrompt: `Hire a warm Head Innkeeper to manage the ${label}`,
    };
  }
  if (/(forge|smith|foundry|mine|smelter|factory|foundry|mill)/i.test(low)) {
    return {
      label,
      style: 'forge',
      suggestedRole: 'Master Blacksmith',
      suggestedWorkerPrompt: `Hire a skilled Master Blacksmith for the ${label}`,
    };
  }
  if (/(guild|bank|museum|theater|school|hall|market|depot|station)/i.test(low)) {
    return {
      label,
      style: 'guild',
      suggestedRole: 'Guild Steward',
      suggestedWorkerPrompt: `Hire a capable Guild Steward to oversee the ${label}`,
    };
  }
  if (/(tower|citadel|fort|outpost|spire|lighthouse)/i.test(low)) {
    return {
      label,
      style: 'tower',
      suggestedRole: 'Outpost Ranger',
      suggestedWorkerPrompt: `Hire a vigilant Outpost Ranger to watch over the ${label}`,
    };
  }
  return {
    label,
    style: 'cabin',
    suggestedRole: `${label.split(' ')[0]} Specialist`,
    suggestedWorkerPrompt: `Hire a dedicated specialist to operate the ${label}`,
  };
}

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
  | 'build_plot'
  | 'villager_speak'
  | 'assign_task'
  | 'set_theme'
  | 'trigger_train';

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

export interface CliAgentActivity {
  agentName: string;
  lastAction: string;
  summary: string;
  lastSeenMs: number;
}

export interface SignalRelayConfig {
  baseUrl: string;
  customTownId: string;
  agentSecret: string;
}

export const DEFAULT_SIGNAL_RELAY_CONFIG: SignalRelayConfig = {
  baseUrl: '',
  customTownId: '',
  agentSecret: '',
};

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

