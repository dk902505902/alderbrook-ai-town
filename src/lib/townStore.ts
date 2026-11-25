import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  ALL_DECOR_PACK_IDS,
  ALL_POLICY_IDS,
  createStarterHistory,
  createStarterRelationships,
  DEFAULT_TOWN_RESOURCES,
  DEFAULT_TREASURY_GOLD,
  type ExportedTownFile,
} from './townSystems.ts';
import {
  ALL_BIOME_IDS,
  ALL_PLOT_IDS,
  ALL_STRUCTURE_TYPES,
  CORE_AGENT_IDS,
  CORE_PLOT_IDS,
  createDefaultEnemyCityState,
  createInitialAgents,
  createInitialLogs,
  DEFAULT_TOWN_METRICS,
  DEFAULT_TRAIN_BLUEPRINT,
  MAX_TOWN_AGENTS,
  normalizeTownTheme,
  normalizeWeatherMode,
  sanitizeBuildingBlueprint,
  sanitizeEnemyCityState,
  sanitizeTrainBlueprint,
  type AgentId,
  type AgentRecord,
  type BiomeId,
  type BuildingBlueprint,
  type CustomBuildingStyle,
  type DecorPackId,
  type EnemyCityState,
  type HatStyle,
  type ImaginedTownBlueprint,
  type LocationId,
  type MilestoneId,
  type PlotId,
  type PolicyId,
  type RemoteCommandRecord,
  type RemoteCommandType,
  type StructureStatus,
  type StructureType,
  type TimeOfDay,
  type TownAdvancedState,
  type TownHistoryPoint,
  type TownLogItem,
  type TownMetrics,
  type TownRelationship,
  type TownResources,
  type TownStructure,
  type TownSummary,
  type TownTheme,
  type TrainBlueprint,
  type WeatherMode,
} from '../types/town.ts';

export interface LoadedTownState {
  townId: string;
  townName: string;
  turnCount: number;
  activeAgentIndex: number;
  activeDecree: string;
  metrics: TownMetrics;
  treasuryGold: number;
  resources: TownResources;
  activePolicies: PolicyId[];
  decorPacks: DecorPackId[];
  unlockedMilestones: MilestoneId[];
  history: TownHistoryPoint[];
  autoDayNight: boolean;
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  theme: TownTheme;
  unlockedBiomes: BiomeId[];
  roads: string[];
  railSpurBuilt: boolean;
  interTownRailBuilt: boolean;
  interTownRailTarget: string;
  autoMode: boolean;
  agents: AgentRecord[];
  structures: TownStructure[];
  relationships: TownRelationship[];
  logs: TownLogItem[];
  enemyCity?: EnemyCityState;
  trainBlueprints?: TrainBlueprint[];
}

export const LOCAL_MAIN_TOWN_ID = 'alderbrook_main';
export const LEGACY_LOCAL_TOWN_KEY = 'alderbrook_local_town_v2';
const LOCAL_TOWNS_INDEX_KEY = 'alderbrook_local_towns_index_v1';
const LOCAL_TOWN_PREFIX = 'alderbrook_local_town_slot_';
const ENEMY_CITY_STORAGE_PREFIX = 'alderbrook_ironhold_city_v1_';
const TOWN_EXTRAS_STORAGE_PREFIX = 'alderbrook_town_extras_v1_';

export function createDefaultAdvancedState(): TownAdvancedState {
  return {
    zoneMap: {},
    unlockedTechs: [],
    activeLoan: null,
    claimedQuestIds: [],
    cameraBookmarks: [],
    autopilot: {
      autoClaimQuests: false,
      autoBalanceTax: false,
      autoUpgradeBuildings: false,
      autoBuildHousing: false,
    },
    marketPrices: {
      timber: 9,
      stone: 11,
      harvest: 10,
      crystal: 18,
      trends: { timber: 'flat', stone: 'flat', harvest: 'flat', crystal: 'flat' },
    },
    agentShifts: {},
    checkpoints: [],
    cargoDispatchedCount: 0,
    fireworksCount: 0,
    dronePatrolEnabled: true,
    balloonsEnabled: true,
    auroraEnabled: true,
    deliveryVanEnabled: true,
    lampMood: 'warm',
    hapticsEnabled: true,
    showNameplates: true,
    townMotto: 'Where autonomous minds build together',
    emblemColor: '#f59e0b',
    todos: [
      { id: 'todo-1', text: 'Build a 5-story Apartment for 40+ crowd citizens', done: false, createdAtMs: 1 },
      { id: 'todo-2', text: 'Unlock River Crossing & watch the River Ferry', done: false, createdAtMs: 2 },
      { id: 'todo-3', text: 'Launch a Town Festival & 3D Fireworks Show', done: false, createdAtMs: 3 },
    ],
    activeFestival: null,
  };
}

export interface TownExtrasSidecar {
  blueprintsByPlot: Partial<Record<PlotId, BuildingBlueprint>>;
  trainBlueprints: TrainBlueprint[];
  taxRate: number;
  advanced: TownAdvancedState;
}

export function loadTownExtrasLocal(townId: string): TownExtrasSidecar {
  const fallbackAdv = createDefaultAdvancedState();
  if (typeof window === 'undefined' || !townId) {
    return {
      blueprintsByPlot: {},
      trainBlueprints: [DEFAULT_TRAIN_BLUEPRINT],
      taxRate: 8,
      advanced: fallbackAdv,
    };
  }
  try {
    const raw = window.localStorage.getItem(`${TOWN_EXTRAS_STORAGE_PREFIX}${townId}`);
    if (!raw) {
      return {
        blueprintsByPlot: {},
        trainBlueprints: [DEFAULT_TRAIN_BLUEPRINT],
        taxRate: 8,
        advanced: fallbackAdv,
      };
    }
    const parsed = JSON.parse(raw) as Partial<TownExtrasSidecar>;
    const blueprintsByPlot: Partial<Record<PlotId, BuildingBlueprint>> = {};
    if (parsed.blueprintsByPlot && typeof parsed.blueprintsByPlot === 'object') {
      for (const [k, v] of Object.entries(parsed.blueprintsByPlot)) {
        if (VALID_PLOT_SET.has(k) && v && typeof v === 'object') {
          blueprintsByPlot[k as PlotId] = sanitizeBuildingBlueprint(v);
        }
      }
    }
    const trainBlueprints =
      Array.isArray(parsed.trainBlueprints) && parsed.trainBlueprints.length > 0
        ? parsed.trainBlueprints.slice(0, 3).map((t) => sanitizeTrainBlueprint(t))
        : [DEFAULT_TRAIN_BLUEPRINT];
    const taxNum = Number(parsed.taxRate);
    const taxRate = Number.isFinite(taxNum) ? Math.max(0, Math.min(20, Math.round(taxNum))) : 8;
    const rawAdv = (
      parsed.advanced && typeof parsed.advanced === 'object' ? parsed.advanced : {}
    ) as Partial<TownAdvancedState>;
    const validMoods = new Set(['warm', 'amber', 'cyber', 'emerald']);
    const advanced: TownAdvancedState = {
      ...fallbackAdv,
      ...rawAdv,
      zoneMap: rawAdv.zoneMap && typeof rawAdv.zoneMap === 'object' ? rawAdv.zoneMap : {},
      unlockedTechs: Array.isArray(rawAdv.unlockedTechs) ? rawAdv.unlockedTechs : [],
      activeLoan: rawAdv.activeLoan ?? null,
      claimedQuestIds: Array.isArray(rawAdv.claimedQuestIds) ? rawAdv.claimedQuestIds : [],
      cameraBookmarks: Array.isArray(rawAdv.cameraBookmarks)
        ? rawAdv.cameraBookmarks.slice(0, 6)
        : [],
      autopilot: {
        ...fallbackAdv.autopilot,
        ...(rawAdv.autopilot && typeof rawAdv.autopilot === 'object' ? rawAdv.autopilot : {}),
      },
      marketPrices: {
        ...fallbackAdv.marketPrices,
        ...(rawAdv.marketPrices && typeof rawAdv.marketPrices === 'object'
          ? rawAdv.marketPrices
          : {}),
        trends: {
          ...fallbackAdv.marketPrices.trends,
          ...(rawAdv.marketPrices?.trends && typeof rawAdv.marketPrices.trends === 'object'
            ? rawAdv.marketPrices.trends
            : {}),
        },
      },
      agentShifts:
        rawAdv.agentShifts && typeof rawAdv.agentShifts === 'object' ? rawAdv.agentShifts : {},
      checkpoints: Array.isArray(rawAdv.checkpoints) ? rawAdv.checkpoints.slice(0, 3) : [],
      cargoDispatchedCount:
        typeof rawAdv.cargoDispatchedCount === 'number' ? rawAdv.cargoDispatchedCount : 0,
      fireworksCount: typeof rawAdv.fireworksCount === 'number' ? rawAdv.fireworksCount : 0,
      dronePatrolEnabled:
        typeof rawAdv.dronePatrolEnabled === 'boolean' ? rawAdv.dronePatrolEnabled : true,
      balloonsEnabled:
        typeof rawAdv.balloonsEnabled === 'boolean' ? rawAdv.balloonsEnabled : true,
      auroraEnabled: typeof rawAdv.auroraEnabled === 'boolean' ? rawAdv.auroraEnabled : true,
      deliveryVanEnabled:
        typeof rawAdv.deliveryVanEnabled === 'boolean' ? rawAdv.deliveryVanEnabled : true,
      lampMood:
        typeof rawAdv.lampMood === 'string' && validMoods.has(rawAdv.lampMood)
          ? rawAdv.lampMood
          : 'warm',
      hapticsEnabled:
        typeof rawAdv.hapticsEnabled === 'boolean' ? rawAdv.hapticsEnabled : true,
      showNameplates:
        typeof rawAdv.showNameplates === 'boolean' ? rawAdv.showNameplates : true,
      townMotto:
        typeof rawAdv.townMotto === 'string' && rawAdv.townMotto.trim()
          ? rawAdv.townMotto.slice(0, 72)
          : fallbackAdv.townMotto,
      emblemColor:
        typeof rawAdv.emblemColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawAdv.emblemColor)
          ? rawAdv.emblemColor
          : fallbackAdv.emblemColor,
      todos: Array.isArray(rawAdv.todos) ? rawAdv.todos.slice(0, 12) : fallbackAdv.todos,
      activeFestival: rawAdv.activeFestival ?? null,
    };
    return { blueprintsByPlot, trainBlueprints, taxRate, advanced };
  } catch {
    return {
      blueprintsByPlot: {},
      trainBlueprints: [DEFAULT_TRAIN_BLUEPRINT],
      taxRate: 8,
      advanced: fallbackAdv,
    };
  }
}

export function saveTownExtrasLocal(
  townId: string,
  structures: TownStructure[],
  trainBlueprints: TrainBlueprint[],
  taxRate = 8,
  advanced?: TownAdvancedState,
): void {
  if (typeof window === 'undefined' || !townId) return;
  try {
    const blueprintsByPlot: Partial<Record<PlotId, BuildingBlueprint>> = {};
    for (const s of structures) {
      if (s.blueprint) {
        blueprintsByPlot[s.plotId] = s.blueprint;
      }
    }
    const cleanTrains =
      trainBlueprints.length > 0 ? trainBlueprints.slice(0, 3) : [DEFAULT_TRAIN_BLUEPRINT];
    const cleanTax = Math.max(0, Math.min(20, Math.round(taxRate)));
    const payload: TownExtrasSidecar = {
      blueprintsByPlot,
      trainBlueprints: cleanTrains,
      taxRate: cleanTax,
      advanced: advanced ?? loadTownExtrasLocal(townId).advanced,
    };
    window.localStorage.setItem(
      `${TOWN_EXTRAS_STORAGE_PREFIX}${townId}`,
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadEnemyCityLocal(townId: string): EnemyCityState {
  if (typeof window === 'undefined' || !townId) return createDefaultEnemyCityState();
  try {
    const raw = window.localStorage.getItem(`${ENEMY_CITY_STORAGE_PREFIX}${townId}`);
    if (!raw) return createDefaultEnemyCityState();
    return sanitizeEnemyCityState(JSON.parse(raw));
  } catch {
    return createDefaultEnemyCityState();
  }
}

export function saveEnemyCityLocal(townId: string, city: EnemyCityState): void {
  if (typeof window === 'undefined' || !townId) return;
  try {
    window.localStorage.setItem(
      `${ENEMY_CITY_STORAGE_PREFIX}${townId}`,
      JSON.stringify({
        ...city,
        counterRaidActive: false,
        counterRaidEndsAtMs: null,
      }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

const VALID_PLOT_SET = new Set<string>(ALL_PLOT_IDS);
const VALID_STRUCTURE_SET = new Set<string>([...ALL_STRUCTURE_TYPES, 'custom']);
const VALID_BIOME_SET = new Set<string>(ALL_BIOME_IDS);
const VALID_CUSTOM_STYLES = new Set<CustomBuildingStyle>([
  'lab',
  'observatory',
  'cafe',
  'tavern',
  'forge',
  'guild',
  'cabin',
  'tower',
]);
const CORE_AGENT_SET = new Set<string>(CORE_AGENT_IDS);
const VALID_HAT_STYLES = new Set<HatStyle>(['straw', 'cap', 'helmet', 'hood', 'beret']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampStr(val: string | null | undefined, maxLen: number): string {
  if (!val) return '';
  return val.slice(0, maxLen);
}

function clampScore(val: unknown, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeOptionalPlot(val: unknown): PlotId | null {
  if (typeof val !== 'string') return null;
  return VALID_PLOT_SET.has(val) ? (val as PlotId) : null;
}

function sanitizeHex(val: unknown, fallback: string): string {
  return typeof val === 'string' && HEX_COLOR_RE.test(val) ? val : fallback;
}

function sanitizeHatStyle(val: unknown): HatStyle | undefined {
  return typeof val === 'string' && VALID_HAT_STYLES.has(val as HatStyle)
    ? (val as HatStyle)
    : undefined;
}

function sanitizeCustomStyle(val: unknown): CustomBuildingStyle | undefined {
  return typeof val === 'string' && VALID_CUSTOM_STYLES.has(val as CustomBuildingStyle)
    ? (val as CustomBuildingStyle)
    : undefined;
}

function sanitizeBiomes(val: unknown): BiomeId[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<BiomeId>();
  const out: BiomeId[] = [];
  for (const item of val) {
    if (typeof item === 'string' && VALID_BIOME_SET.has(item)) {
      const b = item as BiomeId;
      if (!seen.has(b)) {
        seen.add(b);
        out.push(b);
      }
    }
  }
  return out.slice(0, 6);
}

function sanitizeRoads(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of val) {
    if (typeof item === 'string') {
      const cleaned = item.trim().slice(0, 48);
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        out.push(cleaned);
      }
    }
  }
  return out.slice(0, 40);
}

const VALID_POLICY_SET = new Set<string>(ALL_POLICY_IDS);
const VALID_DECOR_SET = new Set<string>(ALL_DECOR_PACK_IDS);

function sanitizeResources(val: unknown): TownResources {
  const r = val && typeof val === 'object' ? (val as Partial<TownResources>) : {};
  return {
    timber: Number.isFinite(Number(r.timber))
      ? Math.max(0, Math.round(Number(r.timber)))
      : DEFAULT_TOWN_RESOURCES.timber,
    stone: Number.isFinite(Number(r.stone))
      ? Math.max(0, Math.round(Number(r.stone)))
      : DEFAULT_TOWN_RESOURCES.stone,
    harvest: Number.isFinite(Number(r.harvest))
      ? Math.max(0, Math.round(Number(r.harvest)))
      : DEFAULT_TOWN_RESOURCES.harvest,
    crystal: Number.isFinite(Number(r.crystal))
      ? Math.max(0, Math.round(Number(r.crystal)))
      : DEFAULT_TOWN_RESOURCES.crystal,
  };
}

function sanitizePolicies(val: unknown): PolicyId[] {
  if (!Array.isArray(val)) return [];
  return Array.from(
    new Set(val.filter((p): p is PolicyId => typeof p === 'string' && VALID_POLICY_SET.has(p))),
  );
}

function sanitizeDecorPacks(val: unknown): DecorPackId[] {
  if (!Array.isArray(val)) return [];
  return Array.from(
    new Set(val.filter((d): d is DecorPackId => typeof d === 'string' && VALID_DECOR_SET.has(d))),
  );
}

function sanitizeMilestones(val: unknown): MilestoneId[] {
  if (!Array.isArray(val)) return [];
  return Array.from(
    new Set(val.filter((m): m is MilestoneId => typeof m === 'string' && m.length > 0 && m.length < 40)),
  ).slice(0, 20);
}

function sanitizeHistory(
  val: unknown,
  fallbackGold: number,
  fallbackMetrics: TownMetrics,
  fallbackPop: number,
  fallbackBuildings: number,
): TownHistoryPoint[] {
  if (!Array.isArray(val) || val.length === 0) {
    return createStarterHistory(fallbackGold, fallbackMetrics, fallbackPop, fallbackBuildings);
  }
  const out: TownHistoryPoint[] = [];
  for (const pt of val.slice(-30)) {
    if (!pt || typeof pt !== 'object') continue;
    const p = pt as Partial<TownHistoryPoint>;
    out.push({
      turn: Math.max(0, Math.round(Number(p.turn ?? 0))),
      treasuryGold: Math.max(0, Math.round(Number(p.treasuryGold ?? fallbackGold))),
      prosperity: clampScore(p.prosperity, fallbackMetrics.prosperity),
      orderLevel: clampScore(p.orderLevel, fallbackMetrics.orderLevel),
      morale: clampScore(p.morale, fallbackMetrics.morale),
      population: Math.max(1, Math.round(Number(p.population ?? fallbackPop))),
      buildings: Math.max(0, Math.round(Number(p.buildings ?? fallbackBuildings))),
    });
  }
  return out.length > 0
    ? out
    : createStarterHistory(fallbackGold, fallbackMetrics, fallbackPop, fallbackBuildings);
}

function slugifyTownName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20) || 'haven'
  );
}

function buildAgentDocPayload(uid: string, agent: AgentRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ownerId: uid,
    agentId: clampStr(agent.id, 40),
    name: clampStr(agent.name, 60),
    rank: agent.rank,
    role: clampStr(agent.role, 60),
    location: agent.location,
    activePlotId: agent.activePlotId || '',
    targetAgent: clampStr(agent.targetAgent, 60),
    thought: clampStr(agent.thought, 500),
    dialogue: clampStr(agent.dialogue, 240),
    currentTask: clampStr(agent.currentTask, 240),
    userNote: clampStr(agent.userNote, 200),
    updatedAt: serverTimestamp(),
  };

  if (agent.department) payload.department = clampStr(agent.department, 60);
  if (agent.supervisor) payload.supervisor = clampStr(agent.supervisor, 60);
  if (agent.accentColor && HEX_COLOR_RE.test(agent.accentColor)) {
    payload.accentColor = agent.accentColor;
  }
  if (agent.personality) payload.personality = clampStr(agent.personality, 160);
  if (agent.assignedPlotId !== undefined) {
    payload.assignedPlotId = agent.assignedPlotId || '';
  }
  if (agent.hatStyle) payload.hatStyle = agent.hatStyle;
  if (agent.outfitColors) {
    payload.coatColor = sanitizeHex(agent.outfitColors.coat, '#14b8a6');
    payload.pantsColor = sanitizeHex(agent.outfitColors.pants, '#1e293b');
    payload.hatColor = sanitizeHex(agent.outfitColors.hat, '#fde68a');
    payload.trimColor = sanitizeHex(agent.outfitColors.trim, '#f59e0b');
  }
  if (agent.isHired) {
    payload.isHired = true;
  }

  return payload;
}

function buildStructureCreatePayload(uid: string, structure: TownStructure): Record<string, unknown> {
  const isHospital = structure.structureType === 'hospital';
  const isDefenseWall = structure.structureType === 'defense_wall';
  const isTripleGun = structure.structureType === 'triple_gun_tower';
  const isApartment = structure.structureType === 'apartment';
  const remoteStructureType =
    isHospital || isDefenseWall || isTripleGun || isApartment ? 'custom' : structure.structureType;
  const remoteCustomLabel = isHospital
    ? structure.customLabel?.trim() || 'Town Hospital'
    : isTripleGun
      ? structure.customLabel?.trim() || 'Triple-Gun Defense Tower'
      : isDefenseWall
        ? structure.customLabel?.trim() || 'Defense Wall & Turret'
        : isApartment
          ? structure.blueprint?.name?.trim() || structure.customLabel?.trim() || 'Multi-Story Apartments'
          : structure.blueprint?.name?.trim() || structure.customLabel?.trim() || '';
  const remoteCustomStyle: CustomBuildingStyle | undefined = isHospital
    ? 'lab'
    : isDefenseWall || isTripleGun
      ? 'tower'
      : isApartment
        ? 'guild'
        : structure.customStyle;

  const payload: Record<string, unknown> = {
    ownerId: uid,
    plotId: structure.plotId,
    structureType: remoteStructureType,
    status: structure.status,
    progress: clampScore(structure.progress, 0),
    tier: Math.max(1, Math.min(3, structure.tier)),
    proposedBy: clampStr(structure.proposedBy, 60) || 'Architect Lyra',
    lastBuilder: clampStr(structure.lastBuilder, 60),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (remoteCustomLabel) {
    payload.customLabel = clampStr(remoteCustomLabel, 40);
  }
  if (remoteCustomStyle && VALID_CUSTOM_STYLES.has(remoteCustomStyle)) {
    payload.customStyle = remoteCustomStyle;
  }
  return payload;
}

export function createFreshTownState(
  townId: string,
  townName: string,
  isMainTown = false,
  imagined?: ImaginedTownBlueprint,
): LoadedTownState {
  const cleanName =
    clampStr((imagined?.name || townName).trim(), 60) || (isMainTown ? 'Alderbrook' : 'New Haven');
  const baseAgents = createInitialAgents();
  const agents: AgentRecord[] = isMainTown
    ? baseAgents
    : baseAgents.map((agent) => {
        const starterTaskById: Record<string, { task: string; dialogue: string }> = {
          mayor_sterling: {
            task: `Charter ${cleanName} from Town Hall`,
            dialogue:
              imagined?.greeting ||
              `Welcome to ${cleanName}! Our frontier is completely open — tell me what to build first.`,
          },
          architect_lyra: {
            task: `Survey building plots in ${cleanName}`,
            dialogue: `Fresh land in ${cleanName}! Ready to draft our next structure whenever you say.`,
          },
          commander_vance: {
            task: `Secure ${cleanName} Town Hall perimeter`,
            dialogue: `Perimeter clear around ${cleanName} Town Hall — starter supplies accounted for.`,
          },
          worker_pip: {
            task: `Sort starter timber & stone at ${cleanName} Plaza`,
            dialogue: `Starter lumber and quarry stone are stacked and ready to build ${cleanName}!`,
          },
          worker_kai: {
            task: `Prepare builder tools for ${cleanName}`,
            dialogue: `Hammer and blueprint ready — point me at any open plot in ${cleanName}!`,
          },
        };
        const freshCopy = starterTaskById[agent.id];
        return {
          ...agent,
          location: 'town_hall',
          activePlotId: null,
          assignedPlotId: null,
          targetAgent: null,
          userNote: '',
          thought: `Arrived to establish ${cleanName} with starter supplies.`,
          dialogue: freshCopy?.dialogue ?? `Ready to build ${cleanName}!`,
          currentTask: freshCopy?.task ?? `Prepare starter site in ${cleanName}`,
          updatedAtMs: Date.now(),
        };
      });

  const now = Date.now();
  const starterStructures: TownStructure[] = [];
  if (imagined && imagined.starterBuildings.length > 0) {
    imagined.starterBuildings.slice(0, 4).forEach((bp, idx) => {
      const plotId = CORE_PLOT_IDS[idx];
      if (!plotId) return;
      const cleanBp = sanitizeBuildingBlueprint(bp, bp.name);
      starterStructures.push({
        plotId,
        structureType: cleanBp.apartmentCapacity >= 16 ? 'apartment' : 'custom',
        customLabel: cleanBp.name,
        blueprint: cleanBp,
        status: 'complete',
        progress: 100,
        tier: 1,
        proposedBy: 'Mayor Sterling',
        lastBuilder: 'Architect Lyra',
        updatedAtMs: now,
      });
    });
  }

  const starterBiomes = imagined ? sanitizeBiomes(imagined.unlockedBiomes) : [];
  const starterRoads = starterBiomes.map((b) => `plaza_to_${b}`);
  const starterTrains = imagined
    ? [sanitizeTrainBlueprint(imagined.train, `${cleanName} Express`)]
    : [DEFAULT_TRAIN_BLUEPRINT];

  const logs = createInitialLogs();
  if (!isMainTown && logs[0]) {
    logs[0] = {
      ...logs[0],
      id: `charter-${townId}-${now}`,
      location: 'town_hall',
      thought: imagined
        ? `AI-imagined ${cleanName} (${imagined.theme}) with ${starterStructures.length} signature structures and ${starterTrains[0].name}.`
        : `Chartered ${cleanName} with a clean frontier map, Town Hall, 5 starter villagers, and starter supplies.`,
      dialogue:
        imagined?.greeting ||
        `Welcome to ${cleanName}! Only Town Hall and starter supplies stand here — tell me what to build first.`,
      newTask: `Charter ${cleanName}`,
      timestampMs: now,
    };
  }

  return {
    townId,
    townName: cleanName,
    turnCount: 0,
    activeAgentIndex: 0,
    activeDecree: '',
    metrics: { ...DEFAULT_TOWN_METRICS },
    treasuryGold: DEFAULT_TREASURY_GOLD,
    resources: { ...DEFAULT_TOWN_RESOURCES },
    activePolicies: [],
    decorPacks: [],
    unlockedMilestones: [],
    history: createStarterHistory(
      DEFAULT_TREASURY_GOLD,
      DEFAULT_TOWN_METRICS,
      agents.length,
      starterStructures.length,
    ),
    autoDayNight: false,
    timeOfDay: imagined?.timeOfDay ?? 'day',
    weather: imagined?.weather ?? 'summer',
    theme: imagined?.theme ?? 'meadow',
    unlockedBiomes: starterBiomes,
    roads: starterRoads,
    railSpurBuilt: Boolean(imagined),
    interTownRailBuilt: false,
    interTownRailTarget: '',
    autoMode: false,
    agents,
    structures: starterStructures,
    relationships: createStarterRelationships(),
    logs,
    enemyCity: createDefaultEnemyCityState(),
    trainBlueprints: starterTrains,
  };
}

// ============================================================================
// Non-Destructive Local Multi-Town Storage (Guest / Offline / Fast Fallback)
// ============================================================================

interface LocalTownMetaEntry {
  id: string;
  name: string;
  updatedAtMs: number;
  buildingCount: number;
  population: number;
}

function readLocalTownIndex(): LocalTownMetaEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_TOWNS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string')
      .map((x) => ({
        id: String(x.id),
        name: clampStr(String(x.name), 60) || 'Town',
        updatedAtMs: Number(x.updatedAtMs) || Date.now(),
        buildingCount: Number(x.buildingCount) || 0,
        population: Number(x.population) || 5,
      }));
  } catch {
    return [];
  }
}

function writeLocalTownIndex(entries: LocalTownMetaEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_TOWNS_INDEX_KEY, JSON.stringify(entries.slice(0, 20)));
  } catch {
    // Ignore storage quota errors
  }
}

export function listLocalTowns(): TownSummary[] {
  const index = readLocalTownIndex();
  const hasMain = index.some((e) => e.id === LOCAL_MAIN_TOWN_ID);
  const mainFallback = loadLocalTown(LOCAL_MAIN_TOWN_ID);
  const list: TownSummary[] = [];

  if (!hasMain) {
    list.push({
      id: LOCAL_MAIN_TOWN_ID,
      name: mainFallback?.townName || 'Alderbrook',
      isMain: true,
      updatedAtMs: Date.now(),
      buildingCount: mainFallback?.structures.length ?? 0,
      population: mainFallback?.agents.length ?? 5,
    });
  }

  for (const entry of index) {
    list.push({
      id: entry.id,
      name: entry.name,
      isMain: entry.id === LOCAL_MAIN_TOWN_ID,
      updatedAtMs: entry.updatedAtMs,
      buildingCount: entry.buildingCount,
      population: entry.population,
    });
  }

  list.sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return b.updatedAtMs - a.updatedAtMs;
  });
  return list;
}

export function loadLocalTown(townId: string): LoadedTownState | null {
  if (typeof window === 'undefined') return null;
  const key = townId === LOCAL_MAIN_TOWN_ID ? LEGACY_LOCAL_TOWN_KEY : `${LOCAL_TOWN_PREFIX}${townId}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<LoadedTownState>;
    const fallbackName = townId === LOCAL_MAIN_TOWN_ID ? 'Alderbrook' : 'New Town';
    const agents = Array.isArray(d.agents) && d.agents.length >= 5 ? d.agents : createInitialAgents();
    const structures = Array.isArray(d.structures)
      ? d.structures.filter(
          (s) =>
            s &&
            VALID_PLOT_SET.has(s.plotId) &&
            VALID_STRUCTURE_SET.has(s.structureType),
        )
      : [];
    const logs = Array.isArray(d.logs) && d.logs.length > 0 ? d.logs : createInitialLogs();

    const metrics: TownMetrics = {
      prosperity: clampScore(d.metrics?.prosperity, DEFAULT_TOWN_METRICS.prosperity),
      orderLevel: clampScore(d.metrics?.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
      morale: clampScore(d.metrics?.morale, DEFAULT_TOWN_METRICS.morale),
    };
    const treasuryGold = Number.isFinite(Number(d.treasuryGold))
      ? Math.max(0, Math.round(Number(d.treasuryGold)))
      : DEFAULT_TREASURY_GOLD;

    return {
      townId,
      townName: typeof d.townName === 'string' && d.townName.trim() ? clampStr(d.townName.trim(), 60) : fallbackName,
      turnCount: Number(d.turnCount ?? 0),
      activeAgentIndex: Number(d.activeAgentIndex ?? 0) % agents.length,
      activeDecree: typeof d.activeDecree === 'string' ? d.activeDecree : '',
      metrics,
      treasuryGold,
      resources: sanitizeResources(d.resources),
      activePolicies: sanitizePolicies(d.activePolicies),
      decorPacks: sanitizeDecorPacks(d.decorPacks),
      unlockedMilestones: sanitizeMilestones(d.unlockedMilestones),
      history: sanitizeHistory(d.history, treasuryGold, metrics, agents.length, structures.length),
      autoDayNight: Boolean(d.autoDayNight),
      timeOfDay: (d.timeOfDay as TimeOfDay) || 'day',
      weather: normalizeWeatherMode(d.weather),
      theme: normalizeTownTheme(d.theme),
      unlockedBiomes: sanitizeBiomes(d.unlockedBiomes),
      roads: sanitizeRoads(d.roads),
      railSpurBuilt: Boolean(d.railSpurBuilt),
      interTownRailBuilt: Boolean(d.interTownRailBuilt),
      interTownRailTarget:
        typeof d.interTownRailTarget === 'string' ? clampStr(d.interTownRailTarget.trim(), 60) : '',
      autoMode: Boolean(d.autoMode),
      agents,
      structures,
      relationships:
        Array.isArray(d.relationships) && d.relationships.length > 0
          ? d.relationships
          : createStarterRelationships(),
      logs,
      enemyCity: d.enemyCity ? sanitizeEnemyCityState(d.enemyCity) : loadEnemyCityLocal(townId),
      trainBlueprints:
        Array.isArray(d.trainBlueprints) && d.trainBlueprints.length > 0
          ? d.trainBlueprints.slice(0, 3).map((t) => sanitizeTrainBlueprint(t))
          : loadTownExtrasLocal(townId).trainBlueprints,
    };
  } catch {
    return null;
  }
}

export function saveLocalTown(state: LoadedTownState): void {
  if (typeof window === 'undefined') return;
  const key =
    state.townId === LOCAL_MAIN_TOWN_ID
      ? LEGACY_LOCAL_TOWN_KEY
      : `${LOCAL_TOWN_PREFIX}${state.townId}`;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
    saveTownExtrasLocal(state.townId, state.structures, state.trainBlueprints ?? []);
    const index = readLocalTownIndex();
    const now = Date.now();
    const nextEntry: LocalTownMetaEntry = {
      id: state.townId,
      name: state.townName || (state.townId === LOCAL_MAIN_TOWN_ID ? 'Alderbrook' : 'New Town'),
      updatedAtMs: now,
      buildingCount: state.structures.length,
      population: state.agents.length,
    };
    const filtered = index.filter((e) => e.id !== state.townId);
    filtered.push(nextEntry);
    writeLocalTownIndex(filtered);
  } catch {
    // Ignore storage quota issues on small devices
  }
}

export function createNewLocalTown(
  townName: string,
  imagined?: ImaginedTownBlueprint,
): LoadedTownState {
  const cleanName = clampStr((imagined?.name || townName).trim(), 60) || 'New Haven';
  const slug = slugifyTownName(cleanName);
  const rand = Math.random().toString(36).slice(2, 6);
  const newId = `local_${slug}_${rand}`;
  const fresh = createFreshTownState(newId, cleanName, false, imagined);
  saveLocalTown(fresh);
  return fresh;
}

export function importTownToLocalSlot(
  imported: Omit<ExportedTownFile, 'format' | 'exportedAtIso'>,
): LoadedTownState {
  const cleanName = clampStr(imported.townName.trim(), 60) || 'Imported Town';
  const slug = slugifyTownName(cleanName);
  const rand = Math.random().toString(36).slice(2, 6);
  const newId = `local_imp_${slug}_${rand}`;
  const state: LoadedTownState = {
    ...imported,
    interTownRailBuilt: false,
    interTownRailTarget: '',
    townId: newId,
    townName: cleanName,
    resources: sanitizeResources(imported.resources),
    activePolicies: sanitizePolicies(imported.activePolicies),
    decorPacks: sanitizeDecorPacks(imported.decorPacks),
    unlockedMilestones: sanitizeMilestones(imported.unlockedMilestones),
    history: sanitizeHistory(
      imported.history,
      imported.treasuryGold,
      imported.metrics,
      imported.agents.length,
      imported.structures.length,
    ),
  };
  saveLocalTown(state);
  return state;
}

// ============================================================================
// Firestore Multi-Town Persistence (/towns/{uid} Main + /towns/{townId} Slots)
// ============================================================================

export async function listUserTowns(uid: string): Promise<TownSummary[]> {
  const townsPath = 'towns';
  let snap;
  try {
    snap = await getDocs(query(collection(db, 'towns'), where('ownerId', '==', uid)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, townsPath);
  }

  const summaries: TownSummary[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const isMain = docSnap.id === uid;
    const defaultName = isMain ? 'Alderbrook' : 'Frontier Town';
    summaries.push({
      id: docSnap.id,
      name:
        typeof d.townName === 'string' && d.townName.trim()
          ? clampStr(d.townName.trim(), 60)
          : defaultName,
      isMain,
      updatedAtMs: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
      buildingCount: 0,
      population: 5,
    });
  });

  summaries.sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return b.updatedAtMs - a.updatedAtMs;
  });
  return summaries;
}

export async function createNewTownInFirestore(
  uid: string,
  townName: string,
  imagined?: ImaginedTownBlueprint,
): Promise<LoadedTownState> {
  const cleanName = clampStr((imagined?.name || townName).trim(), 60) || 'New Haven';
  const slug = slugifyTownName(cleanName);
  const rand = Math.random().toString(36).slice(2, 6);
  const uidPrefix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'u';
  const townId = `town_${uidPrefix}_${slug}_${rand}`;
  const townPath = `towns/${townId}`;
  const townRef = doc(db, 'towns', townId);

  const fresh = createFreshTownState(townId, cleanName, false, imagined);
  const batch = writeBatch(db);

  batch.set(townRef, {
    ownerId: uid,
    townName: cleanName,
    turnCount: 0,
    activeAgentIndex: 0,
    activeDecree: '',
    prosperity: DEFAULT_TOWN_METRICS.prosperity,
    orderLevel: DEFAULT_TOWN_METRICS.orderLevel,
    morale: DEFAULT_TOWN_METRICS.morale,
    timeOfDay: fresh.timeOfDay,
    weather: fresh.weather,
    theme: fresh.theme,
    unlockedBiomes: fresh.unlockedBiomes,
    roads: fresh.roads,
    railSpurBuilt: fresh.railSpurBuilt,
    autoMode: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const agent of fresh.agents) {
    batch.set(doc(db, 'towns', townId, 'agents', agent.id), buildAgentDocPayload(uid, agent));
  }

  for (const structure of fresh.structures) {
    batch.set(
      doc(db, 'towns', townId, 'structures', structure.plotId),
      buildStructureCreatePayload(uid, structure),
    );
  }

  const seedLog = fresh.logs[0];
  batch.set(doc(db, 'towns', townId, 'logs', seedLog.id), {
    ownerId: uid,
    turnNumber: seedLog.turnNumber,
    agentId: seedLog.agentId,
    agentName: clampStr(seedLog.agentName, 60),
    rank: seedLog.rank,
    location: seedLog.location,
    targetAgent: clampStr(seedLog.targetAgent, 60),
    thought: clampStr(seedLog.thought, 500),
    dialogue: clampStr(seedLog.dialogue, 300),
    newTask: clampStr(seedLog.newTask, 240),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, townPath);
  }

  // Persist procedural blueprints & custom trains in sidecar so Firestore schema stays untouched
  saveTownExtrasLocal(townId, fresh.structures, fresh.trainBlueprints ?? []);

  return fresh;
}

export async function loadOrInitializeTown(
  uid: string,
  townId: string = uid,
): Promise<LoadedTownState> {
  const townPath = `towns/${townId}`;
  const townRef = doc(db, 'towns', townId);

  let townSnap;
  try {
    townSnap = await getDoc(townRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, townPath);
  }

  if (!townSnap.exists()) {
    const isMain = townId === uid;
    const defaultName = isMain ? 'Alderbrook' : 'Frontier Town';
    const fresh = createFreshTownState(townId, defaultName, isMain);
    const initialAgents = fresh.agents;
    const initialLogs = fresh.logs;
    const batch = writeBatch(db);

    batch.set(townRef, {
      ownerId: uid,
      townName: fresh.townName,
      turnCount: 0,
      activeAgentIndex: 0,
      activeDecree: '',
      prosperity: DEFAULT_TOWN_METRICS.prosperity,
      orderLevel: DEFAULT_TOWN_METRICS.orderLevel,
      morale: DEFAULT_TOWN_METRICS.morale,
      timeOfDay: 'day',
      weather: 'summer',
      theme: 'meadow',
      unlockedBiomes: [],
      roads: [],
      railSpurBuilt: false,
      autoMode: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const agent of initialAgents) {
      const agentRef = doc(db, 'towns', townId, 'agents', agent.id);
      batch.set(agentRef, buildAgentDocPayload(uid, agent));
    }

    const seedLog = initialLogs[0];
    const logRef = doc(db, 'towns', townId, 'logs', seedLog.id);
    batch.set(logRef, {
      ownerId: uid,
      turnNumber: seedLog.turnNumber,
      agentId: seedLog.agentId,
      agentName: clampStr(seedLog.agentName, 60),
      rank: seedLog.rank,
      location: seedLog.location,
      targetAgent: clampStr(seedLog.targetAgent, 60),
      thought: clampStr(seedLog.thought, 500),
      dialogue: clampStr(seedLog.dialogue, 300),
      newTask: clampStr(seedLog.newTask, 240),
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, townPath);
    }

    return fresh;
  }

  const townData = townSnap.data();
  const agentsPath = `towns/${townId}/agents`;
  const structuresPath = `towns/${townId}/structures`;
  const logsPath = `towns/${townId}/logs`;

  let agentsSnap;
  try {
    agentsSnap = await getDocs(collection(db, 'towns', townId, 'agents'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, agentsPath);
  }

  let structuresSnap;
  try {
    structuresSnap = await getDocs(collection(db, 'towns', townId, 'structures'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, structuresPath);
  }

  let logsSnap;
  try {
    logsSnap = await getDocs(
      query(collection(db, 'towns', townId, 'logs'), orderBy('turnNumber', 'desc'), limit(40)),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, logsPath);
  }

  const defaults = createInitialAgents();
  const agentMap = new Map<AgentId, AgentRecord>();
  for (const def of defaults) {
    agentMap.set(def.id, def);
  }

  const hiredAgents: AgentRecord[] = [];
  const agentsNeedingBackfill: Array<{ id: AgentId; patch: Record<string, unknown> }> = [];

  agentsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const id = String(d.agentId || docSnap.id);
    const base = agentMap.get(id);

    if (base) {
      const patch: Record<string, unknown> = {};
      if (typeof d.userNote !== 'string') patch.userNote = '';
      if (typeof d.activePlotId !== 'string') patch.activePlotId = '';
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = serverTimestamp();
        agentsNeedingBackfill.push({ id, patch });
      }
      agentMap.set(id, {
        ...base,
        location: (d.location as LocationId) || base.location,
        activePlotId: sanitizeOptionalPlot(d.activePlotId),
        targetAgent: d.targetAgent ? String(d.targetAgent) : null,
        thought: typeof d.thought === 'string' ? d.thought : base.thought,
        dialogue: typeof d.dialogue === 'string' ? d.dialogue : base.dialogue,
        currentTask: typeof d.currentTask === 'string' ? d.currentTask : base.currentTask,
        userNote: typeof d.userNote === 'string' ? d.userNote : '',
        updatedAtMs: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
      });
    } else if (!CORE_AGENT_SET.has(id)) {
      const coatColor = sanitizeHex(d.coatColor || d.accentColor, '#10b981');
      hiredAgents.push({
        id,
        name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Villager',
        rank: 3,
        role: typeof d.role === 'string' && d.role.trim() ? d.role : 'Town Specialist',
        department: typeof d.department === 'string' && d.department.trim() ? d.department : 'Civic Works',
        supervisor: typeof d.supervisor === 'string' && d.supervisor.trim() ? d.supervisor : 'Architect Lyra',
        subordinates: [],
        accentColor: sanitizeHex(d.accentColor, coatColor),
        personality: typeof d.personality === 'string' ? d.personality : 'Helpful and energetic villager.',
        assignedPlotId: sanitizeOptionalPlot(d.assignedPlotId),
        hatStyle: sanitizeHatStyle(d.hatStyle) || 'cap',
        outfitColors: {
          coat: coatColor,
          pants: sanitizeHex(d.pantsColor, '#1e293b'),
          hat: sanitizeHex(d.hatColor, '#fde68a'),
          trim: sanitizeHex(d.trimColor, '#f59e0b'),
        },
        isHired: true,
        location: (d.location as LocationId) || 'park',
        activePlotId: sanitizeOptionalPlot(d.activePlotId),
        targetAgent: d.targetAgent ? String(d.targetAgent) : null,
        thought: typeof d.thought === 'string' ? d.thought : 'Ready to lend a hand in town.',
        dialogue: typeof d.dialogue === 'string' ? d.dialogue : 'Glad to join the civic team!',
        currentTask: typeof d.currentTask === 'string' ? d.currentTask : 'Reporting for town duties',
        userNote: typeof d.userNote === 'string' ? d.userNote : '',
        updatedAtMs: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
      });
    }
  });

  const needsTownBackfill =
    townData.prosperity === undefined ||
    townData.orderLevel === undefined ||
    townData.morale === undefined ||
    townData.timeOfDay === undefined ||
    townData.weather === undefined ||
    townData.theme === undefined;

  if (needsTownBackfill || agentsNeedingBackfill.length > 0) {
    const migrationBatch = writeBatch(db);
    if (needsTownBackfill) {
      migrationBatch.update(townRef, {
        prosperity: clampScore(townData.prosperity, DEFAULT_TOWN_METRICS.prosperity),
        orderLevel: clampScore(townData.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
        morale: clampScore(townData.morale, DEFAULT_TOWN_METRICS.morale),
        timeOfDay: (townData.timeOfDay as TimeOfDay) || 'day',
        weather: normalizeWeatherMode(townData.weather),
        theme: normalizeTownTheme(townData.theme),
        updatedAt: serverTimestamp(),
      });
    }
    for (const item of agentsNeedingBackfill) {
      migrationBatch.update(doc(db, 'towns', townId, 'agents', item.id), item.patch);
    }
    try {
      await migrationBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, townPath);
    }
  }

  const townExtras = loadTownExtrasLocal(townId);
  const structures: TownStructure[] = [];
  structuresSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const plotId = sanitizeOptionalPlot(d.plotId);
    const rawStructureType =
      typeof d.structureType === 'string' && VALID_STRUCTURE_SET.has(d.structureType)
        ? (d.structureType as StructureType)
        : null;
    if (!plotId || !rawStructureType) return;
    const status: StructureStatus = d.status === 'complete' ? 'complete' : 'building';
    const customLabel =
      typeof d.customLabel === 'string' && d.customLabel.trim()
        ? clampStr(d.customLabel.trim(), 40)
        : undefined;
    const customStyle = sanitizeCustomStyle(d.customStyle);
    const savedBlueprint = townExtras.blueprintsByPlot[plotId];
    let structureType: StructureType = rawStructureType;
    if (rawStructureType === 'custom' && customLabel) {
      if (/\b(hospital|clinic|infirmary)\b/i.test(customLabel)) {
        structureType = 'hospital';
      } else if (/\b(triple[- ]?gun|3[- ]?gun|three[- ]?gun)\b/i.test(customLabel)) {
        structureType = 'triple_gun_tower';
      } else if (/\b(defense wall|palisade|cannon turret|bastion)\b/i.test(customLabel)) {
        structureType = 'defense_wall';
      } else if (
        /\b(apartment|apartments|flats|condo|residences|housing)\b/i.test(customLabel) ||
        (savedBlueprint && savedBlueprint.apartmentCapacity >= 16)
      ) {
        structureType = 'apartment';
      }
    }
    structures.push({
      plotId,
      structureType,
      customLabel,
      customStyle,
      blueprint: savedBlueprint,
      status,
      progress: clampScore(d.progress, status === 'complete' ? 100 : 0),
      tier: Math.max(1, Math.min(3, Math.round(Number(d.tier ?? 1)))),
      proposedBy: clampStr(typeof d.proposedBy === 'string' ? d.proposedBy : 'Architect Lyra', 60),
      lastBuilder: clampStr(typeof d.lastBuilder === 'string' ? d.lastBuilder : '', 60),
      updatedAtMs: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
    });
  });

  hiredAgents.sort((a, b) => a.updatedAtMs - b.updatedAtMs);
  const coreAgents = CORE_AGENT_IDS.map((id) => agentMap.get(id)!);
  const orderedAgents = [...coreAgents, ...hiredAgents].slice(0, MAX_TOWN_AGENTS);

  const logs: TownLogItem[] = [];
  logsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    logs.push({
      id: docSnap.id,
      turnNumber: Number(d.turnNumber ?? 0),
      agentId: String(d.agentId ?? 'mayor_sterling'),
      agentName: String(d.agentName ?? 'Mayor Sterling'),
      rank: Number(d.rank ?? 1) as 0 | 1 | 2 | 3,
      location: (d.location as LocationId | 'plaza') || 'plaza',
      targetAgent: d.targetAgent ? String(d.targetAgent) : null,
      thought: String(d.thought ?? ''),
      dialogue: String(d.dialogue ?? ''),
      newTask: String(d.newTask ?? ''),
      timestampMs: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now(),
    });
  });

  const resolvedTownName =
    typeof townData.townName === 'string' && townData.townName.trim()
      ? clampStr(townData.townName.trim(), 60)
      : townId === uid
        ? 'Alderbrook'
        : 'Frontier Town';

  const resolvedMetrics: TownMetrics = {
    prosperity: clampScore(townData.prosperity, DEFAULT_TOWN_METRICS.prosperity),
    orderLevel: clampScore(townData.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
    morale: clampScore(townData.morale, DEFAULT_TOWN_METRICS.morale),
  };
  const resolvedGold = Number.isFinite(Number(townData.treasuryGold))
    ? Math.max(0, Math.round(Number(townData.treasuryGold)))
    : DEFAULT_TREASURY_GOLD;

  return {
    townId,
    townName: resolvedTownName,
    turnCount: Number(townData.turnCount ?? 0),
    activeAgentIndex: Number(townData.activeAgentIndex ?? 0) % orderedAgents.length,
    activeDecree: typeof townData.activeDecree === 'string' ? townData.activeDecree : '',
    metrics: resolvedMetrics,
    treasuryGold: resolvedGold,
    resources: sanitizeResources(townData.resources),
    activePolicies: sanitizePolicies(townData.activePolicies),
    decorPacks: sanitizeDecorPacks(townData.decorPacks),
    unlockedMilestones: sanitizeMilestones(townData.unlockedMilestones),
    history: sanitizeHistory(
      townData.history,
      resolvedGold,
      resolvedMetrics,
      orderedAgents.length,
      structures.length,
    ),
    autoDayNight: Boolean(townData.autoDayNight),
    timeOfDay: (townData.timeOfDay as TimeOfDay) || 'day',
    weather: normalizeWeatherMode(townData.weather),
    theme: normalizeTownTheme(townData.theme),
    unlockedBiomes: sanitizeBiomes(townData.unlockedBiomes),
    roads: sanitizeRoads(townData.roads),
    railSpurBuilt: Boolean(townData.railSpurBuilt),
    interTownRailBuilt: Boolean(townData.interTownRailBuilt),
    interTownRailTarget:
      typeof townData.interTownRailTarget === 'string'
        ? clampStr(townData.interTownRailTarget.trim(), 60)
        : '',
    autoMode: Boolean(townData.autoMode),
    agents: orderedAgents,
    structures,
    relationships: createStarterRelationships(),
    logs: logs.length > 0 ? logs : createInitialLogs(),
    enemyCity: loadEnemyCityLocal(townId),
    trainBlueprints: townExtras.trainBlueprints,
  };
}

export async function persistTownExpansion(
  uid: string,
  updates: {
    townName?: string;
    unlockedBiomes?: BiomeId[];
    roads?: string[];
    railSpurBuilt?: boolean;
    interTownRailBuilt?: boolean;
    interTownRailTarget?: string;
    autoMode?: boolean;
  },
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const path = `towns/${townId}`;
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.townName !== undefined) {
    patch.townName = clampStr(updates.townName.trim(), 60) || 'Alderbrook';
  }
  if (updates.unlockedBiomes !== undefined) {
    patch.unlockedBiomes = sanitizeBiomes(updates.unlockedBiomes);
  }
  if (updates.roads !== undefined) {
    patch.roads = sanitizeRoads(updates.roads);
  }
  if (updates.railSpurBuilt !== undefined) {
    patch.railSpurBuilt = Boolean(updates.railSpurBuilt);
  }
  if (updates.interTownRailBuilt !== undefined) {
    patch.interTownRailBuilt = Boolean(updates.interTownRailBuilt);
  }
  if (updates.interTownRailTarget !== undefined) {
    patch.interTownRailTarget = clampStr(updates.interTownRailTarget.trim(), 60);
  }
  if (updates.autoMode !== undefined) {
    patch.autoMode = Boolean(updates.autoMode);
  }
  try {
    await updateDoc(doc(db, 'towns', townId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistAgentTurn(
  uid: string,
  turnCount: number,
  activeAgentIndex: number,
  metrics: TownMetrics,
  timeOfDay: TimeOfDay,
  updatedAgent: AgentRecord,
  logEntry: TownLogItem,
  structureMutation?: {
    mode: 'create' | 'progress' | 'upgrade';
    structure: TownStructure;
  } | null,
  weatherShift?: {
    weather: WeatherMode;
    logEntry: TownLogItem;
  } | null,
  hiredPayload?: {
    workers: AgentRecord[];
    logs: TownLogItem[];
  } | null,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const townRef = doc(db, 'towns', townId);
  const agentRef = doc(db, 'towns', townId, 'agents', updatedAgent.id);
  const logRef = doc(db, 'towns', townId, 'logs', logEntry.id);

  const batch = writeBatch(db);
  const townPatch: Record<string, unknown> = {
    turnCount,
    activeAgentIndex,
    prosperity: clampScore(metrics.prosperity, DEFAULT_TOWN_METRICS.prosperity),
    orderLevel: clampScore(metrics.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
    morale: clampScore(metrics.morale, DEFAULT_TOWN_METRICS.morale),
    timeOfDay,
    updatedAt: serverTimestamp(),
  };
  if (weatherShift) {
    townPatch.weather = weatherShift.weather;
  }
  batch.update(townRef, townPatch);
  batch.update(agentRef, {
    location: updatedAgent.location,
    activePlotId: updatedAgent.activePlotId || '',
    targetAgent: clampStr(updatedAgent.targetAgent, 60),
    thought: clampStr(updatedAgent.thought, 500),
    dialogue: clampStr(updatedAgent.dialogue, 240),
    currentTask: clampStr(updatedAgent.currentTask, 240),
    userNote: clampStr(updatedAgent.userNote, 200),
    updatedAt: serverTimestamp(),
  });
  batch.set(logRef, {
    ownerId: uid,
    turnNumber: logEntry.turnNumber,
    agentId: clampStr(logEntry.agentId, 40),
    agentName: clampStr(logEntry.agentName, 60),
    rank: logEntry.rank,
    location: logEntry.location,
    targetAgent: clampStr(logEntry.targetAgent, 60),
    thought: clampStr(logEntry.thought, 500),
    dialogue: clampStr(logEntry.dialogue, 300),
    newTask: clampStr(logEntry.newTask, 240),
    createdAt: serverTimestamp(),
  });

  if (structureMutation) {
    const { mode, structure } = structureMutation;
    const structureRef = doc(db, 'towns', townId, 'structures', structure.plotId);
    if (mode === 'create') {
      batch.set(structureRef, buildStructureCreatePayload(uid, structure));
    } else if (mode === 'progress') {
      batch.update(structureRef, {
        status: structure.status,
        progress: clampScore(structure.progress, 0),
        lastBuilder: clampStr(structure.lastBuilder, 60),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(structureRef, {
        tier: Math.max(1, Math.min(3, structure.tier)),
        lastBuilder: clampStr(structure.lastBuilder, 60),
        updatedAt: serverTimestamp(),
      });
    }
  }

  if (weatherShift) {
    const wLog = weatherShift.logEntry;
    batch.set(doc(db, 'towns', townId, 'logs', wLog.id), {
      ownerId: uid,
      turnNumber: wLog.turnNumber,
      agentId: 'weather_shift',
      agentName: clampStr(wLog.agentName, 60),
      rank: 0,
      location: 'plaza',
      targetAgent: '',
      thought: clampStr(wLog.thought, 500),
      dialogue: clampStr(wLog.dialogue, 300),
      newTask: clampStr(wLog.newTask, 240),
      createdAt: serverTimestamp(),
    });
  }

  if (hiredPayload) {
    for (const worker of hiredPayload.workers) {
      batch.set(doc(db, 'towns', townId, 'agents', worker.id), buildAgentDocPayload(uid, worker));
    }
    for (const hLog of hiredPayload.logs) {
      batch.set(doc(db, 'towns', townId, 'logs', hLog.id), {
        ownerId: uid,
        turnNumber: hLog.turnNumber,
        agentId: clampStr(hLog.agentId, 40),
        agentName: clampStr(hLog.agentName, 60),
        rank: hLog.rank,
        location: hLog.location,
        targetAgent: clampStr(hLog.targetAgent, 60),
        thought: clampStr(hLog.thought, 500),
        dialogue: clampStr(hLog.dialogue, 300),
        newTask: clampStr(hLog.newTask, 240),
        createdAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `towns/${townId}`);
  }
}

export async function persistHiredWorkers(
  uid: string,
  workers: AgentRecord[],
  logs: TownLogItem[],
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_') || workers.length === 0) return;
  const batch = writeBatch(db);
  for (const worker of workers) {
    batch.set(doc(db, 'towns', townId, 'agents', worker.id), buildAgentDocPayload(uid, worker));
  }
  for (const hLog of logs) {
    batch.set(doc(db, 'towns', townId, 'logs', hLog.id), {
      ownerId: uid,
      turnNumber: hLog.turnNumber,
      agentId: clampStr(hLog.agentId, 40),
      agentName: clampStr(hLog.agentName, 60),
      rank: hLog.rank,
      location: hLog.location,
      targetAgent: clampStr(hLog.targetAgent, 60),
      thought: clampStr(hLog.thought, 500),
      dialogue: clampStr(hLog.dialogue, 300),
      newTask: clampStr(hLog.newTask, 240),
      createdAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `towns/${townId}/agents`);
  }
}

export async function persistUnhiredWorker(
  uid: string,
  agentId: string,
  logEntry: TownLogItem | null,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_') || !agentId || CORE_AGENT_SET.has(agentId)) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'towns', townId, 'agents', agentId));
  if (logEntry) {
    batch.set(doc(db, 'towns', townId, 'logs', logEntry.id), {
      ownerId: uid,
      turnNumber: logEntry.turnNumber,
      agentId: clampStr(logEntry.agentId, 40),
      agentName: clampStr(logEntry.agentName, 60),
      rank: logEntry.rank,
      location: logEntry.location,
      targetAgent: clampStr(logEntry.targetAgent, 60),
      thought: clampStr(logEntry.thought, 500),
      dialogue: clampStr(logEntry.dialogue, 300),
      newTask: clampStr(logEntry.newTask, 240),
      createdAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `towns/${townId}/agents/${agentId}`);
  }
}

export async function persistGodDecree(
  uid: string,
  decreeText: string,
  turnCount: number,
  logEntry: TownLogItem,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const townRef = doc(db, 'towns', townId);
  const logRef = doc(db, 'towns', townId, 'logs', logEntry.id);

  const batch = writeBatch(db);
  batch.update(townRef, {
    activeDecree: clampStr(decreeText, 300),
    turnCount,
    activeAgentIndex: 0,
    updatedAt: serverTimestamp(),
  });
  batch.set(logRef, {
    ownerId: uid,
    turnNumber: logEntry.turnNumber,
    agentId: 'god_decree',
    agentName: 'Civic Decree',
    rank: 0,
    location: 'plaza',
    targetAgent: 'Mayor Sterling',
    thought: 'High-priority civic directive issued from above.',
    dialogue: clampStr(decreeText, 300),
    newTask: 'Mayor Sterling to enact decree',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `towns/${townId}`);
  }
}

export async function persistAgentNote(
  uid: string,
  agentId: AgentId,
  userNote: string,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const path = `towns/${townId}/agents/${agentId}`;
  try {
    await updateDoc(doc(db, 'towns', townId, 'agents', agentId), {
      userNote: clampStr(userNote, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistWeatherShift(
  uid: string,
  weather: WeatherMode,
  logEntry: TownLogItem,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const townRef = doc(db, 'towns', townId);
  const logRef = doc(db, 'towns', townId, 'logs', logEntry.id);
  const batch = writeBatch(db);
  batch.update(townRef, {
    weather,
    updatedAt: serverTimestamp(),
  });
  batch.set(logRef, {
    ownerId: uid,
    turnNumber: logEntry.turnNumber,
    agentId: 'weather_shift',
    agentName: clampStr(logEntry.agentName, 60),
    rank: 0,
    location: 'plaza',
    targetAgent: '',
    thought: clampStr(logEntry.thought, 500),
    dialogue: clampStr(logEntry.dialogue, 300),
    newTask: clampStr(logEntry.newTask, 240),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `towns/${townId}`);
  }
}

export async function persistEnvironmentSettings(
  uid: string,
  updates: { timeOfDay?: TimeOfDay; weather?: WeatherMode; theme?: TownTheme },
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const path = `towns/${townId}`;
  try {
    await updateDoc(doc(db, 'towns', townId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

const VALID_REMOTE_COMMAND_TYPES = new Set<RemoteCommandType>([
  'set_weather',
  'hire_worker',
  'god_decree',
  'build_structure',
  'build_plot',
  'villager_speak',
  'assign_task',
  'set_theme',
  'trigger_train',
]);

export function subscribePendingRemoteCommands(
  uid: string,
  onCommands: (commands: RemoteCommandRecord[]) => void,
  onError?: (error: Error) => void,
  townId: string = uid,
): Unsubscribe {
  if (!townId || townId.startsWith('local_')) {
    return () => {};
  }
  const remotePath = `towns/${townId}/remoteCommands`;
  const q = query(
    collection(db, 'towns', townId, 'remoteCommands'),
    where('status', '==', 'pending'),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pending: RemoteCommandRecord[] = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added' && change.type !== 'modified') return;
        const d = change.doc.data();
        if (d.status !== 'pending') return;
        const rawType = String(d.type ?? '').trim() as RemoteCommandType;
        if (!VALID_REMOTE_COMMAND_TYPES.has(rawType)) return;
        pending.push({
          id: change.doc.id,
          type: rawType,
          value: typeof d.value === 'string' ? d.value : undefined,
          payload:
            typeof d.payload === 'string' || (d.payload && typeof d.payload === 'object')
              ? (d.payload as string | Record<string, unknown>)
              : undefined,
          source: typeof d.source === 'string' ? d.source : undefined,
          status: 'pending',
          createdAtMs: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now(),
        });
      });
      if (pending.length > 0) {
        onCommands(pending);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, remotePath);
      } catch (err) {
        if (onError) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
  );
}

export async function markRemoteCommandStatus(
  uid: string,
  commandId: string,
  status: 'executed' | 'failed',
  resultMessage: string,
  remoteLogEntry?: TownLogItem | null,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const cmdPath = `towns/${townId}/remoteCommands/${commandId}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'towns', townId, 'remoteCommands', commandId), {
    status,
    executedAt: serverTimestamp(),
    resultMessage: clampStr(resultMessage, 300),
  });

  if (remoteLogEntry) {
    batch.set(doc(db, 'towns', townId, 'logs', remoteLogEntry.id), {
      ownerId: uid,
      turnNumber: remoteLogEntry.turnNumber,
      agentId: 'remote_command',
      agentName: clampStr(remoteLogEntry.agentName, 60),
      rank: 0,
      location: 'plaza',
      targetAgent: clampStr(remoteLogEntry.targetAgent, 60),
      thought: clampStr(remoteLogEntry.thought, 500),
      dialogue: clampStr(remoteLogEntry.dialogue, 300),
      newTask: clampStr(remoteLogEntry.newTask, 240),
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, cmdPath);
  }
}

export async function persistRemoteStructureAction(
  uid: string,
  mode: 'create' | 'progress' | 'upgrade',
  structure: TownStructure,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const structPath = `towns/${townId}/structures/${structure.plotId}`;
  const structureRef = doc(db, 'towns', townId, 'structures', structure.plotId);
  try {
    if (mode === 'create') {
      await setDoc(structureRef, buildStructureCreatePayload(uid, structure));
    } else if (mode === 'progress') {
      await updateDoc(structureRef, {
        status: structure.status,
        progress: clampScore(structure.progress, 0),
        lastBuilder: clampStr(structure.lastBuilder, 60) || 'Remote Command',
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(structureRef, {
        tier: Math.max(1, Math.min(3, structure.tier)),
        lastBuilder: clampStr(structure.lastBuilder, 60) || 'Remote Command',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, structPath);
  }
}

export async function persistStructureRename(
  uid: string,
  plotId: PlotId,
  customLabel: string,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const structPath = `towns/${townId}/structures/${plotId}`;
  try {
    await updateDoc(doc(db, 'towns', townId, 'structures', plotId), {
      customLabel: clampStr(customLabel.trim(), 40),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, structPath);
  }
}

export async function persistStructureDelete(
  uid: string,
  plotId: PlotId,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const structPath = `towns/${townId}/structures/${plotId}`;
  try {
    await deleteDoc(doc(db, 'towns', townId, 'structures', plotId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, structPath);
  }
}

export async function persistWorkerAssignment(
  uid: string,
  agentId: AgentId,
  plotId: PlotId | null,
  currentTask: string,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const agentPath = `towns/${townId}/agents/${agentId}`;
  try {
    await updateDoc(doc(db, 'towns', townId, 'agents', agentId), {
      assignedPlotId: plotId ?? '',
      activePlotId: plotId ?? '',
      currentTask: clampStr(currentTask, 240),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, agentPath);
  }
}

export async function enqueueRemoteCommand(
  uid: string,
  type: RemoteCommandType,
  value: string,
  source = 'telegram',
  townId: string = uid,
): Promise<string> {
  const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cmdPath = `towns/${townId}/remoteCommands/${cmdId}`;
  try {
    await setDoc(doc(db, 'towns', townId, 'remoteCommands', cmdId), {
      ownerId: uid,
      type,
      value: clampStr(value, 400),
      source: clampStr(source, 60),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return cmdId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, cmdPath);
  }
}

export async function persistCliAgentUpdate(
  uid: string,
  updatedAgent: AgentRecord,
  logEntry: TownLogItem,
  townId: string = uid,
): Promise<void> {
  if (!townId || townId.startsWith('local_')) return;
  const agentPath = `towns/${townId}/agents/${updatedAgent.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'towns', townId, 'agents', updatedAgent.id), {
    location: updatedAgent.location,
    activePlotId: updatedAgent.activePlotId ?? '',
    targetAgent: clampStr(updatedAgent.targetAgent, 60),
    thought: clampStr(updatedAgent.thought, 500),
    dialogue: clampStr(updatedAgent.dialogue, 240),
    currentTask: clampStr(updatedAgent.currentTask, 240),
    userNote: clampStr(updatedAgent.userNote, 180),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'towns', townId, 'logs', logEntry.id), {
    ownerId: uid,
    turnNumber: logEntry.turnNumber,
    agentId: updatedAgent.id,
    agentName: clampStr(logEntry.agentName, 60),
    rank: updatedAgent.rank,
    location: updatedAgent.location,
    targetAgent: clampStr(logEntry.targetAgent, 60),
    thought: clampStr(logEntry.thought, 500),
    dialogue: clampStr(logEntry.dialogue, 300),
    newTask: clampStr(logEntry.newTask, 240),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, agentPath);
  }
}

export async function resetTownInFirestore(
  uid: string,
  townId: string = uid,
  townName = 'Alderbrook',
): Promise<LoadedTownState> {
  const townRef = doc(db, 'towns', townId);
  const logsPath = `towns/${townId}/logs`;
  const structuresPath = `towns/${townId}/structures`;
  const agentsPath = `towns/${townId}/agents`;

  let existingLogs;
  try {
    existingLogs = await getDocs(collection(db, 'towns', townId, 'logs'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, logsPath);
  }

  let existingStructures;
  try {
    existingStructures = await getDocs(collection(db, 'towns', townId, 'structures'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, structuresPath);
  }

  let existingAgents;
  try {
    existingAgents = await getDocs(collection(db, 'towns', townId, 'agents'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, agentsPath);
  }

  let pendingCommands;
  try {
    pendingCommands = await getDocs(
      query(collection(db, 'towns', townId, 'remoteCommands'), where('status', '==', 'pending')),
    );
  } catch {
    pendingCommands = null;
  }

  const isMain = townId === uid;
  const fresh = createFreshTownState(townId, townName, isMain);
  const initialAgents = fresh.agents;
  const initialLogs = fresh.logs;
  const batch = writeBatch(db);

  existingLogs.forEach((d) => {
    batch.delete(d.ref);
  });

  existingStructures.forEach((d) => {
    batch.delete(d.ref);
  });

  existingAgents.forEach((d) => {
    if (!CORE_AGENT_SET.has(d.id)) {
      batch.delete(d.ref);
    }
  });

  pendingCommands?.forEach((d) => {
    batch.delete(d.ref);
  });

  batch.update(townRef, {
    townName: clampStr(townName, 60) || 'Alderbrook',
    turnCount: 0,
    activeAgentIndex: 0,
    activeDecree: '',
    prosperity: DEFAULT_TOWN_METRICS.prosperity,
    orderLevel: DEFAULT_TOWN_METRICS.orderLevel,
    morale: DEFAULT_TOWN_METRICS.morale,
    timeOfDay: 'day',
    weather: 'summer',
    theme: 'meadow',
    unlockedBiomes: [],
    roads: [],
    railSpurBuilt: false,
    interTownRailBuilt: false,
    interTownRailTarget: '',
    autoMode: false,
    updatedAt: serverTimestamp(),
  });

  for (const agent of initialAgents) {
    const agentRef = doc(db, 'towns', townId, 'agents', agent.id);
    batch.update(agentRef, {
      location: agent.location,
      activePlotId: '',
      targetAgent: clampStr(agent.targetAgent, 60),
      thought: clampStr(agent.thought, 500),
      dialogue: clampStr(agent.dialogue, 240),
      currentTask: clampStr(agent.currentTask, 240),
      userNote: '',
      updatedAt: serverTimestamp(),
    });
  }

  const seedLog = initialLogs[0];
  batch.set(doc(db, 'towns', townId, 'logs', seedLog.id), {
    ownerId: uid,
    turnNumber: seedLog.turnNumber,
    agentId: seedLog.agentId,
    agentName: clampStr(seedLog.agentName, 60),
    rank: seedLog.rank,
    location: seedLog.location,
    targetAgent: clampStr(seedLog.targetAgent, 60),
    thought: clampStr(seedLog.thought, 500),
    dialogue: clampStr(seedLog.dialogue, 300),
    newTask: clampStr(seedLog.newTask, 240),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `towns/${townId}`);
  }

  return fresh;
}
