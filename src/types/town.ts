export type LocationId = 'town_hall' | 'workshop' | 'market' | 'park';

export type BiomeId = 'forest' | 'desert' | 'cave' | 'alpine' | 'river' | 'canyon';

export const ALL_BIOME_IDS: BiomeId[] = [
  'forest',
  'desert',
  'cave',
  'alpine',
  'river',
  'canyon',
];

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
  | 'plot_outer_w'
  | 'plot_alpine_1'
  | 'plot_alpine_2'
  | 'plot_alpine_3'
  | 'plot_river_1'
  | 'plot_river_2'
  | 'plot_river_3'
  | 'plot_canyon_1'
  | 'plot_canyon_2'
  | 'plot_canyon_3';

export type CustomBuildingStyle =
  | 'lab'
  | 'observatory'
  | 'cafe'
  | 'tavern'
  | 'forge'
  | 'guild'
  | 'cabin'
  | 'tower';

export type BuildingRoofStyle = 'gable' | 'dome' | 'flat_helipad' | 'pagoda' | 'spire';

export interface BuildingBlueprint {
  name: string;
  floors: number; // 1..6
  width: number; // 1.8..3.4
  depth: number; // 1.8..3.0
  roofStyle: BuildingRoofStyle;
  primaryColor: string; // hex #RRGGBB
  accentColor: string; // hex #RRGGBB
  windowGlow: string; // hex #RRGGBB
  hasBalconies: boolean;
  apartmentCapacity: number; // 0..48 dummy citizens housed
}

export type TrainStyle = 'steam' | 'bullet' | 'freight' | 'neon';

export interface TrainBlueprint {
  id: string;
  name: string;
  style: TrainStyle;
  locomotiveColor: string;
  carriageColor: string;
  carCount: number; // 1..5
  speed: number; // 0.6..2.2 multiplier
}

export interface ImaginedTownBlueprint {
  name: string;
  theme: TownTheme;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  unlockedBiomes: BiomeId[];
  starterBuildings: BuildingBlueprint[];
  train: TrainBlueprint;
  greeting: string;
}

export type StructureType =
  | 'bakery'
  | 'watchtower'
  | 'greenhouse'
  | 'windmill'
  | 'library'
  | 'granary'
  | 'pavilion'
  | 'clock_tower'
  | 'hospital'
  | 'defense_wall'
  | 'triple_gun_tower'
  | 'apartment'
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
  /** Optional custom nameplate (works for both custom and renamed preset buildings) */
  customLabel?: string;
  /** Visual architecture preset for custom procedural buildings */
  customStyle?: CustomBuildingStyle;
  /** AI-imagined procedural architecture blueprint (floors, roof, colors, balconies, apartment housing) */
  blueprint?: BuildingBlueprint;
}

export type CameraMode =
  | 'orbit'
  | 'villager_pov'
  | 'train_cab'
  | 'train_passenger'
  | 'bus_window'
  | 'bus_driver'
  | 'free_roam'
  | 'tour';

export interface TownRelationship {
  pairKey: string;
  agentA: AgentId;
  agentB: AgentId;
  score: number; // 0-100
  interactions: number;
  lastNote: string;
  updatedAtMs: number;
}

export interface BuildingEconomyRow {
  plotId: PlotId;
  label: string;
  district: string;
  tier: number;
  goldPerTurn: number;
  staffed: boolean;
  note: string;
}

export interface TownEconomySummary {
  treasuryGold: number;
  civicBaseTax: number;
  railwayBonus: number;
  buildingRevenue: number;
  workerUpkeep: number;
  netPerTurn: number;
  topBuildings: BuildingEconomyRow[];
}

export interface TownEventOption {
  id: string;
  label: string;
  effectSummary: string;
  goldDelta: number;
  metricsDelta: Partial<TownMetrics>;
  triggerTrain?: boolean;
  boostAllBonds?: number;
  logOutcome: string;
}

export interface TownEvent {
  id: string;
  title: string;
  summary: string;
  category: 'trade' | 'festival' | 'civic' | 'weather' | 'discovery';
  options: TownEventOption[];
  triggeredAtMs?: number;
}

export interface TownGazetteEdition {
  editionNumber: number;
  townName: string;
  headline: string;
  subheadline: string;
  weatherSummary: string;
  stories: Array<{ title: string; body: string; meta: string }>;
}

export interface TownResources {
  timber: number;
  stone: number;
  harvest: number;
  crystal: number;
}

export interface TownResourceRates {
  timber: number;
  stone: number;
  harvest: number;
  crystal: number;
}

export type PolicyId = 'open_trade' | 'night_shift' | 'free_bread' | 'green_charter';

export interface TownPolicyMeta {
  id: PolicyId;
  label: string;
  benefit: string;
  tradeoff: string;
}

export type DecorPackId =
  | 'lantern_boulevard'
  | 'flower_gardens'
  | 'market_bunting'
  | 'fountain_statues';

export interface DecorPackMeta {
  id: DecorPackId;
  label: string;
  costGold: number;
  moraleBonus: number;
  summary: string;
}

export type MilestoneId =
  | 'first_building'
  | 'masterwork_t3'
  | 'frontier_biome'
  | 'all_biomes'
  | 'steam_loop'
  | 'treasury_1000'
  | 'bustling_council'
  | 'trusted_partners';

export interface TownMilestone {
  id: MilestoneId;
  title: string;
  description: string;
  rewardGold: number;
  unlocked: boolean;
}

export interface TownRankInfo {
  level: number;
  title: string;
  nextTitle: string | null;
  progressPct: number;
  nextRequirement: string;
}

export interface CouncilProposal {
  id: string;
  proposerId: AgentId;
  proposerName: string;
  proposerRole: string;
  title: string;
  summary: string;
  actionType: 'build' | 'upgrade' | 'expand_biome' | 'extend_rail' | 'festival';
  structureType?: StructureType;
  customLabel?: string;
  biome?: BiomeId;
  costGold: number;
  votes: number;
  supporters: string[];
}

export interface TownHistoryPoint {
  turn: number;
  treasuryGold: number;
  prosperity: number;
  orderLevel: number;
  morale: number;
  population: number;
  buildings: number;
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
  interTownRailBuilt?: boolean;
  interTownRailTarget?: string;
  autoMode: boolean;
}

export type AgentHealthStatus = 'healthy' | 'injured';

export type RaiderTactic =
  | 'shell_perimeter'
  | 'target_workers'
  | 'siege_plaza'
  | 'air_strike'
  | 'loot_raid'
  | 'regroup';

export type EnemyBuildingId =
  | 'warlord_citadel'
  | 'munitions_foundry'
  | 'war_depot'
  | 'airfield'
  | 'enemy_turret_north'
  | 'enemy_turret_south'
  | 'supply_railway';

export interface EnemyBuildingRecord {
  id: EnemyBuildingId;
  label: string;
  category: 'command' | 'industry' | 'storage' | 'airforce' | 'defense' | 'rail';
  built: boolean;
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
}

export interface EnemyHierarchyUnit {
  id: string;
  name: string;
  rank: 1 | 2 | 3;
  role: string;
  department: string;
  supervisor: string | null;
  status: string;
  lastAction: string;
}

export interface EnemyCityState {
  name: string;
  gold: number;
  food: number;
  totalGoldLootedFromUs: number;
  totalFoodLootedFromUs: number;
  totalGoldCounterLooted: number;
  totalFoodCounterLooted: number;
  buildings: EnemyBuildingRecord[];
  railBuilt: boolean;
  helicoptersReady: number;
  jetsReady: number;
  autonomousTurnCount: number;
  warlordDecision: string;
  warlordModelUsed: string;
  lastAutonomousTurnMs: number;
  hierarchy: EnemyHierarchyUnit[];
  counterRaidActive: boolean;
  counterRaidEndsAtMs: number | null;
  lastLootEvent: string;
}

export function createDefaultEnemyCityState(): EnemyCityState {
  return {
    name: 'Ironhold Bastion',
    gold: 260,
    food: 95,
    totalGoldLootedFromUs: 0,
    totalFoodLootedFromUs: 0,
    totalGoldCounterLooted: 0,
    totalFoodCounterLooted: 0,
    buildings: [
      {
        id: 'warlord_citadel',
        label: 'Warlord Citadel',
        category: 'command',
        built: true,
        level: 1,
        maxLevel: 3,
        hp: 160,
        maxHp: 160,
      },
      {
        id: 'munitions_foundry',
        label: 'Munitions Foundry',
        category: 'industry',
        built: false,
        level: 0,
        maxLevel: 3,
        hp: 0,
        maxHp: 110,
      },
      {
        id: 'war_depot',
        label: 'War Loot Depot',
        category: 'storage',
        built: false,
        level: 0,
        maxLevel: 3,
        hp: 0,
        maxHp: 120,
      },
      {
        id: 'airfield',
        label: 'Airfield Helipad & Runway',
        category: 'airforce',
        built: false,
        level: 0,
        maxLevel: 3,
        hp: 0,
        maxHp: 130,
      },
      {
        id: 'enemy_turret_north',
        label: 'North Bastion Turret',
        category: 'defense',
        built: false,
        level: 0,
        maxLevel: 3,
        hp: 0,
        maxHp: 100,
      },
      {
        id: 'enemy_turret_south',
        label: 'South Bastion Turret',
        category: 'defense',
        built: false,
        level: 0,
        maxLevel: 3,
        hp: 0,
        maxHp: 100,
      },
      {
        id: 'supply_railway',
        label: 'Armored Ore Railway',
        category: 'rail',
        built: false,
        level: 0,
        maxLevel: 1,
        hp: 0,
        maxHp: 100,
      },
    ],
    railBuilt: false,
    helicoptersReady: 0,
    jetsReady: 0,
    autonomousTurnCount: 0,
    warlordDecision: 'Surveying the southwest ridge and stockpiling ore inside Ironhold Bastion.',
    warlordModelUsed: 'Instant Tactics · 0 tokens',
    lastAutonomousTurnMs: 0,
    hierarchy: [
      {
        id: 'warlord_malakor',
        name: 'Supreme Warlord Malakor',
        rank: 1,
        role: 'Supreme Warlord',
        department: 'Bastion Command',
        supervisor: null,
        status: 'Planning autonomous fortress expansion',
        lastAction: 'Established Ironhold Citadel on the SW frontier',
      },
      {
        id: 'engineer_vex',
        name: 'Chief Siege Engineer Vex',
        rank: 2,
        role: 'Factories, Defenses & Rail',
        department: 'Ironworks Corps',
        supervisor: 'Supreme Warlord Malakor',
        status: 'Drafting Munitions Foundry & Rail blueprints',
        lastAction: 'Fortified Citadel outer walls',
      },
      {
        id: 'marshal_kael',
        name: 'Air Marshal Kael',
        rank: 2,
        role: 'Helicopter & Jet Wing',
        department: 'Crimson Air Force',
        supervisor: 'Supreme Warlord Malakor',
        status: 'Awaiting Airfield Helipad & Runway construction',
        lastAction: 'Charted flight corridors over Alderbrook',
      },
      {
        id: 'ironhold_builders',
        name: 'Ironhold Sappers & Miners',
        rank: 3,
        role: 'Builders & Ore Miners',
        department: 'Ironworks Corps',
        supervisor: 'Chief Siege Engineer Vex',
        status: 'Hauling dark iron ore to Citadel',
        lastAction: 'Cleared foundation pads across SW ridge',
      },
      {
        id: 'crimson_pilots',
        name: 'Crimson Rotor & Jet Pilots',
        rank: 3,
        role: 'Attack Helicopter & Jet Pilots',
        department: 'Crimson Air Force',
        supervisor: 'Air Marshal Kael',
        status: 'Running pre-flight simulator checks',
        lastAction: 'Calibrating spark-rocket pods',
      },
      {
        id: 'ironjaw_squad',
        name: 'Ironjaw Raider Squad',
        rank: 3,
        role: 'Ground Siege & Loot Raiders',
        department: 'Bastion Command',
        supervisor: 'Supreme Warlord Malakor',
        status: 'Drilling beside the brass siege cannons',
        lastAction: 'Scouted Alderbrook granary & treasury routes',
      },
    ],
    counterRaidActive: false,
    counterRaidEndsAtMs: null,
    lastLootEvent: 'No cross-border looting yet.',
  };
}

export function sanitizeEnemyCityState(raw: unknown): EnemyCityState {
  const fallback = createDefaultEnemyCityState();
  if (!raw || typeof raw !== 'object') return fallback;
  const d = raw as Partial<EnemyCityState>;

  const rawBuildings = Array.isArray(d.buildings) ? d.buildings : [];
  const byId = new Map<string, Partial<EnemyBuildingRecord>>();
  for (const b of rawBuildings) {
    if (b && typeof b === 'object' && typeof b.id === 'string') {
      byId.set(b.id, b);
    }
  }
  const buildings: EnemyBuildingRecord[] = fallback.buildings.map((def) => {
    const saved = byId.get(def.id);
    if (!saved) return def;
    const built = def.id === 'warlord_citadel' ? true : Boolean(saved.built);
    const level = built
      ? Math.max(1, Math.min(def.maxLevel, Math.round(Number(saved.level) || 1)))
      : 0;
    const maxHp = Math.max(80, Math.round(Number(saved.maxHp) || def.maxHp));
    const hp = built ? Math.max(10, Math.min(maxHp, Math.round(Number(saved.hp) || maxHp))) : 0;
    return { ...def, built, level, hp, maxHp };
  });

  const railBld = buildings.find((b) => b.id === 'supply_railway');
  const railBuilt = Boolean(d.railBuilt || railBld?.built);
  if (railBld && railBuilt && !railBld.built) {
    railBld.built = true;
    railBld.level = 1;
    railBld.hp = railBld.maxHp;
  }

  const rawHier = Array.isArray(d.hierarchy) ? d.hierarchy : [];
  const hierById = new Map<string, Partial<EnemyHierarchyUnit>>();
  for (const u of rawHier) {
    if (u && typeof u === 'object' && typeof u.id === 'string') {
      hierById.set(u.id, u);
    }
  }
  const hierarchy: EnemyHierarchyUnit[] = fallback.hierarchy.map((def) => {
    const saved = hierById.get(def.id);
    if (!saved) return def;
    return {
      ...def,
      status:
        typeof saved.status === 'string' && saved.status.trim()
          ? saved.status.trim().slice(0, 140)
          : def.status,
      lastAction:
        typeof saved.lastAction === 'string' && saved.lastAction.trim()
          ? saved.lastAction.trim().slice(0, 140)
          : def.lastAction,
    };
  });

  return {
    name:
      typeof d.name === 'string' && d.name.trim()
        ? d.name.trim().slice(0, 48)
        : fallback.name,
    gold: Math.max(0, Math.round(Number.isFinite(Number(d.gold)) ? Number(d.gold) : fallback.gold)),
    food: Math.max(0, Math.round(Number.isFinite(Number(d.food)) ? Number(d.food) : fallback.food)),
    totalGoldLootedFromUs: Math.max(0, Math.round(Number(d.totalGoldLootedFromUs) || 0)),
    totalFoodLootedFromUs: Math.max(0, Math.round(Number(d.totalFoodLootedFromUs) || 0)),
    totalGoldCounterLooted: Math.max(0, Math.round(Number(d.totalGoldCounterLooted) || 0)),
    totalFoodCounterLooted: Math.max(0, Math.round(Number(d.totalFoodCounterLooted) || 0)),
    buildings,
    railBuilt,
    helicoptersReady: Math.max(0, Math.min(2, Math.round(Number(d.helicoptersReady) || 0))),
    jetsReady: Math.max(0, Math.min(2, Math.round(Number(d.jetsReady) || 0))),
    autonomousTurnCount: Math.max(0, Math.round(Number(d.autonomousTurnCount) || 0)),
    warlordDecision:
      typeof d.warlordDecision === 'string' && d.warlordDecision.trim()
        ? d.warlordDecision.trim().slice(0, 160)
        : fallback.warlordDecision,
    warlordModelUsed:
      typeof d.warlordModelUsed === 'string' && d.warlordModelUsed.trim()
        ? d.warlordModelUsed.trim().slice(0, 60)
        : fallback.warlordModelUsed,
    lastAutonomousTurnMs: Math.max(0, Number(d.lastAutonomousTurnMs) || 0),
    hierarchy,
    counterRaidActive: false,
    counterRaidEndsAtMs: null,
    lastLootEvent:
      typeof d.lastLootEvent === 'string' && d.lastLootEvent.trim()
        ? d.lastLootEvent.trim().slice(0, 160)
        : fallback.lastLootEvent,
  };
}

export interface EnemyRaidState {
  enabled: boolean;
  active: boolean;
  waveNumber: number;
  campHp: number;
  campMaxHp: number;
  tactic: RaiderTactic;
  commanderName: string;
  commanderOrder: string;
  modelUsed: string;
  raidsRepelled: number;
  lastEventMs: number;
  nextWaveAtMs?: number | null;
}

export function createDefaultEnemyRaidState(enabled = true): EnemyRaidState {
  return {
    enabled,
    active: false,
    waveNumber: 0,
    campHp: 120,
    campMaxHp: 120,
    tactic: 'shell_perimeter',
    commanderName: 'Warlord Malakor',
    commanderOrder: 'Ironhold Bastion stands ready across the southwest ridge.',
    modelUsed: 'Instant Tactics · 0 tokens',
    raidsRepelled: 0,
    lastEventMs: 0,
    nextWaveAtMs: enabled ? Date.now() + 12000 : null,
  };
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
  /** Local non-lethal rescue state — never causes permanent worker deletion */
  healthStatus?: AgentHealthStatus;
  injuredAtMs?: number;
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
  unhired_worker?: { agent_id: string; reason: string } | null;
  build_inter_town_rail?: { target_town: string; reason?: string } | null;
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
export const INSTANT_TACTICS_PROVIDER_ID = 'instant_tactics' as const;
export const ENEMY_RAIDER_AGENT_ID = 'enemy_raider_commander' as const;

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
  alpine: ['plot_alpine_1', 'plot_alpine_2', 'plot_alpine_3'],
  river: ['plot_river_1', 'plot_river_2', 'plot_river_3'],
  canyon: ['plot_canyon_1', 'plot_canyon_2', 'plot_canyon_3'],
};

export const ALL_PLOT_IDS: PlotId[] = [
  ...CORE_PLOT_IDS,
  ...BIOME_PLOT_IDS.forest,
  ...BIOME_PLOT_IDS.desert,
  ...BIOME_PLOT_IDS.cave,
  ...BIOME_PLOT_IDS.alpine,
  ...BIOME_PLOT_IDS.river,
  ...BIOME_PLOT_IDS.canyon,
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
  alpine: {
    id: 'alpine',
    label: 'Alpine Snow Peaks',
    shortLabel: 'Alpine',
    direction: 'Far North',
    center: { x: 2, z: -50 },
    color: '#cbd5e1',
    roadId: 'plaza_to_alpine',
    plots: BIOME_PLOT_IDS.alpine,
    summary: 'Snow-capped northern alpine ridge, frost-dusted pines, glacial stones, and 3 summit plots.',
  },
  river: {
    id: 'river',
    label: 'Turquoise River Crossing',
    shortLabel: 'River',
    direction: 'Far West',
    center: { x: -50, z: 2 },
    color: '#0ea5e9',
    roadId: 'plaza_to_river',
    plots: BIOME_PLOT_IDS.river,
    summary: 'Winding turquoise riverbanks, arched wooden bridge, reed meadows, and 3 riverside plots.',
  },
  canyon: {
    id: 'canyon',
    label: 'Red-Rock Canyon',
    shortLabel: 'Canyon',
    direction: 'Far South',
    center: { x: 2, z: 50 },
    color: '#ea580c',
    roadId: 'plaza_to_canyon',
    plots: BIOME_PLOT_IDS.canyon,
    summary: 'Stepped terracotta mesas, sunlit canyon arches, red spires, and 3 canyon floor plots.',
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
  'hospital',
  'defense_wall',
  'triple_gun_tower',
  'apartment',
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
  plot_alpine_1: { label: 'Alpine Summit Lodge Pad', shortLabel: 'A1', x: -11.5, z: -48.0, biome: 'alpine' },
  plot_alpine_2: { label: 'Glacier Pass Outpost', shortLabel: 'A2', x: 3.5, z: -51.5, biome: 'alpine' },
  plot_alpine_3: { label: 'Snowpine Ridge Terrace', shortLabel: 'A3', x: 15.5, z: -47.5, biome: 'alpine' },
  plot_river_1: { label: 'Riverbend Wharf Pad', shortLabel: 'R1', x: -47.5, z: -12.5, biome: 'river' },
  plot_river_2: { label: 'Turquoise Bridge Crossing', shortLabel: 'R2', x: -49.0, z: 2.5, biome: 'river' },
  plot_river_3: { label: 'Westbank Mill Terrace', shortLabel: 'R3', x: -46.5, z: 16.5, biome: 'river' },
  plot_canyon_1: { label: 'Red-Rock Mesa Pad', shortLabel: 'CY1', x: -13.5, z: 48.5, biome: 'canyon' },
  plot_canyon_2: { label: 'Canyon Spire Overlook', shortLabel: 'CY2', x: 2.5, z: 51.0, biome: 'canyon' },
  plot_canyon_3: { label: 'Sunbaked Gorge Outpost', shortLabel: 'CY3', x: 16.5, z: 47.5, biome: 'canyon' },
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
  hospital: {
    label: 'Town Hospital',
    category: 'Medical & Rescue',
    color: '#ef4444',
    bonus: { prosperity: 1, order: 2, morale: 5 },
  },
  defense_wall: {
    label: 'Defense Wall & Turret',
    category: 'Town Defense',
    color: '#475569',
    bonus: { prosperity: 0, order: 6, morale: 2 },
  },
  triple_gun_tower: {
    label: 'Triple-Gun Defense Tower',
    category: 'Heavy Defense',
    color: '#dc2626',
    bonus: { prosperity: 0, order: 8, morale: 2 },
  },
  apartment: {
    label: 'Multi-Story Apartments',
    category: 'Citizen Housing',
    color: '#0ea5e9',
    bonus: { prosperity: 4, order: 1, morale: 4 },
  },
  custom: {
    label: 'Custom Civic Hall',
    category: 'Custom Project',
    color: '#06b6d4',
    bonus: { prosperity: 3, order: 2, morale: 3 },
  },
};

export function isHospitalStructure(
  structure: Pick<TownStructure, 'structureType' | 'customLabel'>,
): boolean {
  if (structure.structureType === 'hospital') return true;
  return /\b(hospital|clinic|infirmary|medic)\b/i.test(structure.customLabel || '');
}

export function isDefenseStructure(
  structure: Pick<TownStructure, 'structureType' | 'customLabel'>,
): boolean {
  if (
    structure.structureType === 'defense_wall' ||
    structure.structureType === 'triple_gun_tower' ||
    structure.structureType === 'watchtower'
  ) {
    return true;
  }
  return /\b(defense|palisade|turret|fort|bastion|cannon|wall|triple[- ]?gun|3[- ]?gun|three[- ]?gun)\b/i.test(
    structure.customLabel || '',
  );
}

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
  structure: Pick<TownStructure, 'structureType' | 'customLabel' | 'blueprint'>,
): string {
  if (structure.blueprint?.name?.trim()) {
    return structure.blueprint.name.trim();
  }
  if (structure.customLabel?.trim()) {
    return structure.customLabel.trim();
  }
  return STRUCTURE_META[structure.structureType]?.label ?? 'Civic Structure';
}

export function getStructureColor(
  structure: Pick<TownStructure, 'structureType' | 'customStyle' | 'blueprint'>,
): string {
  if (structure.blueprint?.primaryColor) {
    return structure.blueprint.primaryColor;
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Procedural AI Buildings, Multi-Story Apartments, Dummy Crowd & Train Designers
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_DUMMY_CITIZENS = 140;
export const BASE_VILLAGE_HOUSING = 16;

const VALID_ROOF_STYLES = new Set<BuildingRoofStyle>([
  'gable',
  'dome',
  'flat_helipad',
  'pagoda',
  'spire',
]);

const VALID_TRAIN_STYLES = new Set<TrainStyle>(['steam', 'bullet', 'freight', 'neon']);

const BP_HEX_RE = /^#[0-9a-fA-F]{6}$/;

function cleanBpHex(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (BP_HEX_RE.test(t)) return t;
    if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  }
  return fallback;
}

function clampNum(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function sanitizeBuildingBlueprint(
  raw: unknown,
  fallbackName = 'Civic Tower',
): BuildingBlueprint {
  const fallback = generateFallbackBuildingBlueprint(fallbackName);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<BuildingBlueprint>;
  const name =
    typeof r.name === 'string' && r.name.trim()
      ? r.name.trim().slice(0, 38)
      : fallback.name;
  const floors = Math.round(clampNum(r.floors, 1, 6, fallback.floors));
  const width = Number(clampNum(r.width, 1.8, 3.4, fallback.width).toFixed(2));
  const depth = Number(clampNum(r.depth, 1.8, 3.0, fallback.depth).toFixed(2));
  const roofStyle: BuildingRoofStyle =
    typeof r.roofStyle === 'string' && VALID_ROOF_STYLES.has(r.roofStyle as BuildingRoofStyle)
      ? (r.roofStyle as BuildingRoofStyle)
      : fallback.roofStyle;
  const hasBalconies =
    typeof r.hasBalconies === 'boolean' ? r.hasBalconies : fallback.hasBalconies;
  const rawCap = r.apartmentCapacity;
  const apartmentCapacity = Number.isFinite(Number(rawCap))
    ? Math.max(0, Math.min(48, Math.round(Number(rawCap))))
    : fallback.apartmentCapacity;

  return {
    name,
    floors,
    width,
    depth,
    roofStyle,
    primaryColor: cleanBpHex(r.primaryColor, fallback.primaryColor),
    accentColor: cleanBpHex(r.accentColor, fallback.accentColor),
    windowGlow: cleanBpHex(r.windowGlow, fallback.windowGlow),
    hasBalconies,
    apartmentCapacity,
  };
}

export function generateFallbackBuildingBlueprint(promptOrName: string): BuildingBlueprint {
  const cleaned = promptOrName
    .replace(/^(build|construct|make|create|design|erect|add)\s+(a|an|the|new|some)?\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  const low = cleaned.toLowerCase();

  // Extract explicit floor count e.g. "5-story", "4 floor", "6-storey"
  const floorMatch = low.match(/\b([1-6])\s*[-]?\s*(?:story|stories|storey|storeys|floor|floors)\b/);
  const explicitFloors = floorMatch ? Number(floorMatch[1]) : null;

  const titleCase = (s: string) =>
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .slice(0, 38);

  const displayName = titleCase(cleaned || 'Civic Residence') || 'Civic Residence';

  if (/(apartment|condo|housing|flat|residence|residential|dorm|tenement|tower block)/i.test(low)) {
    const floors = explicitFloors ?? (/(tall|high|grand|mega|sky)/i.test(low) ? 5 : 4);
    const isCyber = /(cyber|neon|future|futuristic|glass|modern|solar)/i.test(low);
    return {
      name: displayName,
      floors,
      width: 2.85,
      depth: 2.35,
      roofStyle: isCyber ? 'flat_helipad' : 'gable',
      primaryColor: isCyber ? '#1e293b' : '#d6cfc2',
      accentColor: isCyber ? '#06b6d4' : '#b45309',
      windowGlow: isCyber ? '#38bdf8' : '#fde68a',
      hasBalconies: true,
      apartmentCapacity: Math.min(48, floors * 8),
    };
  }

  if (/(sky[- ]?tower|skyscraper|cyber|neon|futuristic|sci[- ]?fi|tech|hq|headquarters|hub|helipad)/i.test(low)) {
    const floors = explicitFloors ?? 5;
    return {
      name: displayName,
      floors,
      width: 2.4,
      depth: 2.2,
      roofStyle: /(helipad|pad|flat)/i.test(low) ? 'flat_helipad' : 'spire',
      primaryColor: '#1e293b',
      accentColor: '#38bdf8',
      windowGlow: '#22d3ee',
      hasBalconies: floors >= 3,
      apartmentCapacity: floors * 5,
    };
  }

  if (/(crystal|temple|shrine|cathedral|sanctuary|palace|observatory|dome|planetarium|arcane|wizard)/i.test(low)) {
    const floors = explicitFloors ?? 3;
    const isCrystal = /(crystal|ice|arcane|magic|prism|diamond)/i.test(low);
    return {
      name: displayName,
      floors,
      width: 2.7,
      depth: 2.5,
      roofStyle: /(spire|cathedral)/i.test(low) ? 'spire' : 'dome',
      primaryColor: isCrystal ? '#cffafe' : '#e2e8f0',
      accentColor: isCrystal ? '#8b5cf6' : '#f59e0b',
      windowGlow: isCrystal ? '#67e8f9' : '#fcd34d',
      hasBalconies: false,
      apartmentCapacity: 6,
    };
  }

  if (/(pagoda|dojo|tea\s*house|zen|eastern|lotus|dragon|bamboo|monastery)/i.test(low)) {
    const floors = explicitFloors ?? 4;
    return {
      name: displayName,
      floors,
      width: 2.55,
      depth: 2.45,
      roofStyle: 'pagoda',
      primaryColor: '#fef3c7',
      accentColor: '#dc2626',
      windowGlow: '#fbbf24',
      hasBalconies: true,
      apartmentCapacity: floors * 4,
    };
  }

  if (/(hotel|inn|resort|mansion|villa|plaza|mall|museum|academy|university|theater|cinema|arena|stadium)/i.test(low)) {
    const floors = explicitFloors ?? 3;
    return {
      name: displayName,
      floors,
      width: 3.0,
      depth: 2.45,
      roofStyle: /(arena|stadium|museum|planetarium)/i.test(low) ? 'dome' : 'flat_helipad',
      primaryColor: '#e7e5e4',
      accentColor: '#d97706',
      windowGlow: '#fde68a',
      hasBalconies: true,
      apartmentCapacity: floors * 6,
    };
  }

  // Deterministic hash-based color/style palette for any completely arbitrary prompt
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) {
    hash = (hash * 31 + displayName.charCodeAt(i)) >>> 0;
  }
  const palettes: Array<[string, string, string, BuildingRoofStyle]> = [
    ['#e2e8f0', '#0ea5e9', '#fde68a', 'spire'],
    ['#f5e6d3', '#b45309', '#fcd34d', 'gable'],
    ['#dbeafe', '#4f46e5', '#67e8f9', 'dome'],
    ['#fef3c7', '#dc2626', '#fbbf24', 'pagoda'],
    ['#334155', '#10b981', '#5eead4', 'flat_helipad'],
  ];
  const [primaryColor, accentColor, windowGlow, roofStyle] = palettes[hash % palettes.length];
  const floors = explicitFloors ?? (2 + (hash % 3));
  return {
    name: displayName,
    floors,
    width: 2.5,
    depth: 2.25,
    roofStyle,
    primaryColor,
    accentColor,
    windowGlow,
    hasBalconies: floors >= 3,
    apartmentCapacity: floors >= 3 ? floors * 4 : 4,
  };
}

export interface TownHousingStats {
  housingCapacity: number;
  dummyPopulation: number;
  apartmentCount: number;
}

export function computeTownHousingCapacity(structures: TownStructure[]): TownHousingStats {
  let apartmentCap = 0;
  let apartmentCount = 0;
  let completedCivic = 0;

  for (const s of structures) {
    if (s.status !== 'complete') continue;
    completedCivic += 1;
    const bpCap = s.blueprint?.apartmentCapacity ?? 0;
    if (s.structureType === 'apartment' || bpCap > 0) {
      const effectiveCap = bpCap > 0 ? bpCap : 20 + (s.tier - 1) * 8;
      apartmentCap += effectiveCap;
      if (s.structureType === 'apartment' || bpCap >= 12) {
        apartmentCount += 1;
      }
    } else {
      // Every completed regular building supports 3 ambient town visitors/residents
      apartmentCap += 3 + (s.tier - 1) * 2;
    }
  }

  const housingCapacity = Math.min(MAX_DUMMY_CITIZENS, BASE_VILLAGE_HOUSING + apartmentCap);
  // Active dummy population fills smoothly up to capacity (baseline 14 even in starter village)
  const fillRatio = completedCivic === 0 ? 0.85 : 0.94;
  const dummyPopulation = Math.min(
    MAX_DUMMY_CITIZENS,
    Math.max(12, Math.round(housingCapacity * fillRatio)),
  );

  return {
    housingCapacity,
    dummyPopulation,
    apartmentCount,
  };
}

export const DEFAULT_TRAIN_BLUEPRINT: TrainBlueprint = {
  id: 'train_alderbrook_express',
  name: 'Alderbrook Steam Express',
  style: 'steam',
  locomotiveColor: '#1e293b',
  carriageColor: '#0f766e',
  carCount: 2,
  speed: 1.0,
};

export function sanitizeTrainBlueprint(
  raw: unknown,
  fallbackPrompt = 'Alderbrook Express',
): TrainBlueprint {
  const fallback = generateFallbackTrainBlueprint(fallbackPrompt);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<TrainBlueprint>;
  const name =
    typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 38) : fallback.name;
  const style: TrainStyle =
    typeof r.style === 'string' && VALID_TRAIN_STYLES.has(r.style as TrainStyle)
      ? (r.style as TrainStyle)
      : fallback.style;
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim().slice(0, 42)
      : `train_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${Date.now().toString(36).slice(-4)}`;

  return {
    id,
    name,
    style,
    locomotiveColor: cleanBpHex(r.locomotiveColor, fallback.locomotiveColor),
    carriageColor: cleanBpHex(r.carriageColor, fallback.carriageColor),
    carCount: Math.round(clampNum(r.carCount, 1, 5, fallback.carCount)),
    speed: Number(clampNum(r.speed, 0.6, 2.2, fallback.speed).toFixed(2)),
  };
}

export function generateFallbackTrainBlueprint(promptOrName: string): TrainBlueprint {
  const low = (promptOrName || '').toLowerCase();
  const slug = low.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'express';
  const id = `train_${slug}_${Date.now().toString(36).slice(-4)}`;

  const carMatch = low.match(/\b([1-5])\s*(?:car|cars|carriage|carriages|coach|coaches|wagon|wagons)\b/);
  const explicitCars = carMatch ? Number(carMatch[1]) : null;

  let style: TrainStyle = 'steam';
  if (/(bullet|shinkansen|high[- ]?speed|maglev|hyper|jet|sleek|express)/i.test(low)) {
    style = 'bullet';
  } else if (/(neon|cyber|futuristic|laser|plasma|synth|glow|tron)/i.test(low)) {
    style = 'neon';
  } else if (/(cargo|freight|gold|ore|mining|heavy|supply|timber|coal)/i.test(low)) {
    style = 'freight';
  }

  let locomotiveColor =
    style === 'bullet'
      ? '#f8fafc'
      : style === 'neon'
        ? '#0f172a'
        : style === 'freight'
          ? '#b45309'
          : '#1e293b';
  let carriageColor =
    style === 'bullet'
      ? '#0284c7'
      : style === 'neon'
        ? '#a855f7'
        : style === 'freight'
          ? '#eab308'
          : '#0f766e';

  if (/\bgold|golden|amber\b/i.test(low)) {
    locomotiveColor = '#d97706';
    carriageColor = '#facc15';
  } else if (/\bred|crimson|ruby|scarlet\b/i.test(low)) {
    locomotiveColor = '#b91c1c';
    carriageColor = '#991b1b';
  } else if (/\bblue|cobalt|sapphire|ice|alpine\b/i.test(low)) {
    locomotiveColor = '#1d4ed8';
    carriageColor = '#38bdf8';
  } else if (/\bgreen|emerald|forest|jade\b/i.test(low)) {
    locomotiveColor = '#15803d';
    carriageColor = '#10b981';
  } else if (/\bpurple|violet|amethyst|cyber\b/i.test(low)) {
    locomotiveColor = '#4c1d95';
    carriageColor = '#c026d3';
  } else if (/\bblack|obsidian|shadow|night\b/i.test(low)) {
    locomotiveColor = '#0f172a';
    carriageColor = '#334155';
  } else if (/\bwhite|silver|chrome|pearl\b/i.test(low)) {
    locomotiveColor = '#f1f5f9';
    carriageColor = '#94a3b8';
  }

  const defaultName =
    style === 'bullet'
      ? 'Skyline Bullet Express'
      : style === 'neon'
        ? 'Neon Pulse Maglev'
        : style === 'freight'
          ? /\bgold\b/i.test(low)
            ? 'Golden Bullion Freight'
            : 'Ironclad Cargo Line'
          : 'Alderbrook Heritage Steam';

  const cleanLabel = promptOrName
    .replace(/^(design|create|build|make|add|swap|new)\s+(a|an|the|new)?\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  const name =
    cleanLabel.length >= 3 && cleanLabel.length <= 36
      ? cleanLabel
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : defaultName;

  return {
    id,
    name: name.slice(0, 38),
    style,
    locomotiveColor,
    carriageColor,
    carCount: explicitCars ?? (style === 'freight' ? 4 : style === 'bullet' ? 3 : 2),
    speed: style === 'bullet' ? 1.85 : style === 'neon' ? 1.65 : style === 'freight' ? 0.85 : 1.05,
  };
}

export function sanitizeImaginedTownBlueprint(
  raw: unknown,
  promptOrName: string,
): ImaginedTownBlueprint {
  const fallback = generateFallbackImaginedTownBlueprint(promptOrName);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<ImaginedTownBlueprint>;
  const name =
    typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 44) : fallback.name;
  const theme = normalizeTownTheme(r.theme ?? fallback.theme);
  const weather = normalizeWeatherMode(r.weather ?? fallback.weather);
  const timeOfDay: TimeOfDay =
    r.timeOfDay === 'dawn' ||
    r.timeOfDay === 'day' ||
    r.timeOfDay === 'twilight' ||
    r.timeOfDay === 'night'
      ? r.timeOfDay
      : fallback.timeOfDay;
  const validBiomes = new Set<string>(ALL_BIOME_IDS);
  const unlockedBiomes: BiomeId[] = Array.isArray(r.unlockedBiomes)
    ? Array.from(
        new Set(
          r.unlockedBiomes.filter(
            (b): b is BiomeId => typeof b === 'string' && validBiomes.has(b),
          ),
        ),
      ).slice(0, 4)
    : fallback.unlockedBiomes;
  const starterBuildings: BuildingBlueprint[] =
    Array.isArray(r.starterBuildings) && r.starterBuildings.length > 0
      ? r.starterBuildings
          .slice(0, 4)
          .map((b, idx) => sanitizeBuildingBlueprint(b, `${name} Landmark ${idx + 1}`))
      : fallback.starterBuildings;
  const train = r.train ? sanitizeTrainBlueprint(r.train, `${name} Express`) : fallback.train;
  const greeting =
    typeof r.greeting === 'string' && r.greeting.trim()
      ? r.greeting.trim().slice(0, 180)
      : fallback.greeting;

  return {
    name,
    theme,
    weather,
    timeOfDay,
    unlockedBiomes: unlockedBiomes.length > 0 ? unlockedBiomes : fallback.unlockedBiomes,
    starterBuildings,
    train,
    greeting,
  };
}

export function generateFallbackImaginedTownBlueprint(promptOrName: string): ImaginedTownBlueprint {
  const low = (promptOrName || '').toLowerCase();

  if (/(cyber|neon|future|synth|sci[- ]?fi|metro)/i.test(low)) {
    const isDesert = /(desert|dune|sand|oasis|canyon|mars)/i.test(low);
    const name = isDesert ? 'Helios Cyber-Oasis' : 'Neo-Vespera';
    return {
      name,
      theme: isDesert ? 'solarpunk_oasis' : 'fantasy_night',
      weather: 'summer',
      timeOfDay: isDesert ? 'twilight' : 'night',
      unlockedBiomes: isDesert ? ['desert', 'canyon'] : ['cave', 'desert'],
      starterBuildings: [
        sanitizeBuildingBlueprint({
          name: isDesert ? 'Solar Neon Spire' : 'Vespera Sky-Tower',
          floors: 5,
          width: 2.5,
          depth: 2.3,
          roofStyle: 'spire',
          primaryColor: '#1e293b',
          accentColor: '#06b6d4',
          windowGlow: '#22d3ee',
          hasBalconies: true,
          apartmentCapacity: 28,
        }),
        sanitizeBuildingBlueprint({
          name: 'Cyber Habitat Flats',
          floors: 4,
          width: 2.9,
          depth: 2.4,
          roofStyle: 'flat_helipad',
          primaryColor: '#0f172a',
          accentColor: '#ec4899',
          windowGlow: '#38bdf8',
          hasBalconies: true,
          apartmentCapacity: 32,
        }),
        sanitizeBuildingBlueprint({
          name: 'Prism Energy Dome',
          floors: 2,
          width: 2.7,
          depth: 2.5,
          roofStyle: 'dome',
          primaryColor: '#312e81',
          accentColor: '#f59e0b',
          windowGlow: '#67e8f9',
          hasBalconies: false,
          apartmentCapacity: 8,
        }),
      ],
      train: sanitizeTrainBlueprint({
        name: isDesert ? 'Dune-Runner Neon Maglev' : 'Hyper-Neon Express',
        style: 'neon',
        locomotiveColor: '#0f172a',
        carriageColor: '#06b6d4',
        carCount: 3,
        speed: 1.75,
      }),
      greeting: `Welcome to ${name}! Neon towers, habitat apartments, and a maglev rail line are already online.`,
    };
  }

  if (/(alpine|snow|winter|mountain|glacier|frost|nordic|rail)/i.test(low)) {
    const name = /(rail|train)/i.test(low) ? 'Frostpeak Rail Haven' : 'Glacier Ridge';
    return {
      name,
      theme: 'meadow',
      weather: 'winter',
      timeOfDay: 'dawn',
      unlockedBiomes: ['alpine', 'forest'],
      starterBuildings: [
        sanitizeBuildingBlueprint({
          name: 'Alpine Lodge Apartments',
          floors: 4,
          width: 2.8,
          depth: 2.4,
          roofStyle: 'gable',
          primaryColor: '#e2e8f0',
          accentColor: '#7c2d12',
          windowGlow: '#fbbf24',
          hasBalconies: true,
          apartmentCapacity: 30,
        }),
        sanitizeBuildingBlueprint({
          name: 'Glacier Observatory',
          floors: 3,
          width: 2.5,
          depth: 2.4,
          roofStyle: 'dome',
          primaryColor: '#cbd5e1',
          accentColor: '#0284c7',
          windowGlow: '#bae6fd',
          hasBalconies: false,
          apartmentCapacity: 8,
        }),
      ],
      train: sanitizeTrainBlueprint({
        name: 'Glacier Bullet Express',
        style: 'bullet',
        locomotiveColor: '#f8fafc',
        carriageColor: '#0284c7',
        carCount: 3,
        speed: 1.8,
      }),
      greeting: `Welcome to ${name}! Crisp snow peaks, cozy alpine apartments, and a high-speed rail loop await.`,
    };
  }

  if (/(desert|oasis|dune|sand|solar|canyon|sun)/i.test(low)) {
    const name = 'Suncrest Oasis';
    return {
      name,
      theme: 'solarpunk_oasis',
      weather: 'summer',
      timeOfDay: 'day',
      unlockedBiomes: ['desert', 'canyon'],
      starterBuildings: [
        sanitizeBuildingBlueprint({
          name: 'Terracotta Sky Residences',
          floors: 4,
          width: 2.85,
          depth: 2.35,
          roofStyle: 'flat_helipad',
          primaryColor: '#e6c79c',
          accentColor: '#0d9488',
          windowGlow: '#fde68a',
          hasBalconies: true,
          apartmentCapacity: 32,
        }),
        sanitizeBuildingBlueprint({
          name: 'Sunstone Crystal Dome',
          floors: 3,
          width: 2.7,
          depth: 2.5,
          roofStyle: 'dome',
          primaryColor: '#fed7aa',
          accentColor: '#d97706',
          windowGlow: '#22d3ee',
          hasBalconies: false,
          apartmentCapacity: 8,
        }),
      ],
      train: sanitizeTrainBlueprint({
        name: 'Golden Caravan Freight',
        style: 'freight',
        locomotiveColor: '#b45309',
        carriageColor: '#f59e0b',
        carCount: 4,
        speed: 1.0,
      }),
      greeting: `Welcome to ${name}! Sunlit terracotta apartments and a golden freight railway anchor your oasis.`,
    };
  }

  if (/(pagoda|sakura|zen|lotus|eastern|jade|dragon|bamboo)/i.test(low)) {
    const name = 'Jade Lotus Valley';
    return {
      name,
      theme: 'meadow',
      weather: 'summer',
      timeOfDay: 'dawn',
      unlockedBiomes: ['river', 'forest'],
      starterBuildings: [
        sanitizeBuildingBlueprint({
          name: 'Five-Tier Lotus Pagoda',
          floors: 5,
          width: 2.6,
          depth: 2.5,
          roofStyle: 'pagoda',
          primaryColor: '#fef3c7',
          accentColor: '#dc2626',
          windowGlow: '#fbbf24',
          hasBalconies: true,
          apartmentCapacity: 24,
        }),
        sanitizeBuildingBlueprint({
          name: 'Riverview Terrace Flats',
          floors: 3,
          width: 2.8,
          depth: 2.3,
          roofStyle: 'pagoda',
          primaryColor: '#f5f5f4',
          accentColor: '#0f766e',
          windowGlow: '#fde68a',
          hasBalconies: true,
          apartmentCapacity: 24,
        }),
      ],
      train: sanitizeTrainBlueprint({
        name: 'Emerald Bullet Shinkansen',
        style: 'bullet',
        locomotiveColor: '#10b981',
        carriageColor: '#f8fafc',
        carCount: 3,
        speed: 1.9,
      }),
      greeting: `Welcome to ${name}! Tiered pagodas and an emerald bullet line bring serene vitality to the valley.`,
    };
  }

  // Generic imagined town from arbitrary name/prompt
  const cleanName =
    promptOrName
      .replace(/^(imagine|create|build|make|found|start|new)\s+(and\s+)?(create|make|build)?\s*(a|an|the|new)?\s*/i, '')
      .replace(/\b(town|city|village)\b/gi, '')
      .replace(/[.!?]+$/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Starfall Haven';

  return {
    name: cleanName.slice(0, 44),
    theme: 'fantasy_night',
    weather: 'summer',
    timeOfDay: 'twilight',
    unlockedBiomes: ['forest', 'river'],
    starterBuildings: [
      sanitizeBuildingBlueprint({
        name: `${cleanName} Grand Flats`,
        floors: 4,
        width: 2.85,
        depth: 2.35,
        roofStyle: 'gable',
        primaryColor: '#e2e8f0',
        accentColor: '#6366f1',
        windowGlow: '#fde68a',
        hasBalconies: true,
        apartmentCapacity: 32,
      }),
      sanitizeBuildingBlueprint({
        name: `${cleanName} Spire`,
        floors: 4,
        width: 2.4,
        depth: 2.3,
        roofStyle: 'spire',
        primaryColor: '#334155',
        accentColor: '#38bdf8',
        windowGlow: '#67e8f9',
        hasBalconies: false,
        apartmentCapacity: 12,
      }),
    ],
    train: sanitizeTrainBlueprint({
      name: `${cleanName} Express`,
      style: 'bullet',
      locomotiveColor: '#312e81',
      carriageColor: '#38bdf8',
      carCount: 3,
      speed: 1.5,
    }),
    greeting: `Welcome to ${cleanName}! Starter apartments, a skyline spire, and a custom express train are ready.`,
  };
}


