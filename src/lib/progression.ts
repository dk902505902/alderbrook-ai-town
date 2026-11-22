import type { TownResources } from './economy.ts';

/** Snapshot of the numbers used to evaluate objectives and achievements. */
export interface TownStats {
  turnCount: number;
  buildingsComplete: number;
  tier3Buildings: number;
  population: number;
  prosperity: number;
  orderLevel: number;
  morale: number;
  gold: number;
  biomes: number;
  roads: number;
  railSpurBuilt: boolean;
  decrees: number;
  relayExecuted: number;
}

export type ObjectiveMetric =
  | 'buildings'
  | 'turns'
  | 'prosperity'
  | 'population'
  | 'gold'
  | 'roads'
  | 'biomes'
  | 'morale';

export interface ObjectiveDef {
  id: string;
  title: string;
  detail: string;
  metric: ObjectiveMetric;
  target: number;
  reward: TownResources;
}

export interface ObjectiveRow extends ObjectiveDef {
  progress: number;
  complete: boolean;
}

const reward = (
  timber: number,
  stone: number,
  food: number,
  gold: number,
): TownResources => ({ timber, stone, food, gold });

const OBJECTIVE_POOL: ObjectiveDef[] = [
  {
    id: 'raise_structures',
    title: 'Raise the skyline',
    detail: 'Finish 2 new buildings',
    metric: 'buildings',
    target: 2,
    reward: reward(20, 10, 0, 15),
  },
  {
    id: 'advance_clock',
    title: 'Keep the town moving',
    detail: 'Advance 10 simulation turns',
    metric: 'turns',
    target: 10,
    reward: reward(0, 0, 20, 10),
  },
  {
    id: 'prosperity_push',
    title: 'Prosperity drive',
    detail: 'Reach 55 prosperity',
    metric: 'prosperity',
    target: 55,
    reward: reward(10, 10, 10, 20),
  },
  {
    id: 'grow_population',
    title: 'A fuller square',
    detail: 'Grow to 7 villagers',
    metric: 'population',
    target: 7,
    reward: reward(0, 0, 30, 15),
  },
  {
    id: 'treasury',
    title: 'Fill the treasury',
    detail: 'Hold 120 gold at once',
    metric: 'gold',
    target: 120,
    reward: reward(25, 25, 0, 0),
  },
  {
    id: 'pave_roads',
    title: 'Connect the districts',
    detail: 'Pave 2 roads',
    metric: 'roads',
    target: 2,
    reward: reward(15, 20, 0, 10),
  },
  {
    id: 'chart_biome',
    title: 'Chart the frontier',
    detail: 'Unlock a second biome',
    metric: 'biomes',
    target: 2,
    reward: reward(20, 0, 15, 15),
  },
  {
    id: 'morale_lift',
    title: 'Keep spirits high',
    detail: 'Reach 70 morale',
    metric: 'morale',
    target: 70,
    reward: reward(0, 0, 25, 15),
  },
];

export function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic set of three objectives per town per local day. */
export function pickDailyObjectives(townId: string, dateKey: string): ObjectiveDef[] {
  const start = hashString(`${townId}:${dateKey}`) % OBJECTIVE_POOL.length;
  const picks = [0, 3, 6].map((offset) => OBJECTIVE_POOL[(start + offset) % OBJECTIVE_POOL.length]);
  return picks;
}

export function measureMetric(stats: TownStats, metric: ObjectiveMetric): number {
  switch (metric) {
    case 'buildings':
      return stats.buildingsComplete;
    case 'turns':
      return stats.turnCount;
    case 'prosperity':
      return stats.prosperity;
    case 'population':
      return stats.population;
    case 'gold':
      return stats.gold;
    case 'roads':
      return stats.roads;
    case 'biomes':
      return stats.biomes;
    case 'morale':
      return stats.morale;
    default:
      return 0;
  }
}

export function evaluateObjectives(
  defs: ObjectiveDef[],
  stats: TownStats,
  completedIds: string[],
): ObjectiveRow[] {
  return defs.map((def) => {
    const measured = Math.round(measureMetric(stats, def.metric));
    const progress = Math.max(0, Math.min(def.target, measured));
    const complete = completedIds.includes(def.id) || measured >= def.target;
    return { ...def, progress, complete };
  });
}

const OBJECTIVES_STORAGE_KEY = 'alderbrook_objectives_v1';

interface StoredObjectiveProgress {
  dateKey: string;
  completed: string[];
}

type ObjectiveStore = Record<string, StoredObjectiveProgress>;

function readObjectiveStore(): ObjectiveStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OBJECTIVES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ObjectiveStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadObjectiveProgress(townId: string, dateKey: string): string[] {
  const entry = readObjectiveStore()[townId];
  if (!entry || entry.dateKey !== dateKey) return [];
  return Array.isArray(entry.completed) ? entry.completed.filter((id) => typeof id === 'string') : [];
}

export function saveObjectiveProgress(
  townId: string,
  dateKey: string,
  completed: string[],
): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readObjectiveStore();
    store[townId] = { dateKey, completed: Array.from(new Set(completed)).slice(0, 12) };
    window.localStorage.setItem(OBJECTIVES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Progress tracking is best-effort; never break the town over storage limits
  }
}

export interface AchievementDef {
  id: string;
  title: string;
  detail: string;
  tier: 'bronze' | 'silver' | 'gold';
  check: (stats: TownStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_light',
    title: 'First Light',
    detail: 'Advance your first turn',
    tier: 'bronze',
    check: (s) => s.turnCount >= 1,
  },
  {
    id: 'ten_turns',
    title: 'Settled Rhythm',
    detail: 'Reach turn 10',
    tier: 'bronze',
    check: (s) => s.turnCount >= 10,
  },
  {
    id: 'fifty_turns',
    title: 'Old Hands',
    detail: 'Reach turn 50',
    tier: 'silver',
    check: (s) => s.turnCount >= 50,
  },
  {
    id: 'first_build',
    title: 'Ground Broken',
    detail: 'Complete your first building',
    tier: 'bronze',
    check: (s) => s.buildingsComplete >= 1,
  },
  {
    id: 'five_builds',
    title: 'Town Planner',
    detail: 'Complete 5 buildings',
    tier: 'silver',
    check: (s) => s.buildingsComplete >= 5,
  },
  {
    id: 'twelve_builds',
    title: 'Master Builder',
    detail: 'Complete 12 buildings',
    tier: 'gold',
    check: (s) => s.buildingsComplete >= 12,
  },
  {
    id: 'tier_three',
    title: 'Crown Jewel',
    detail: 'Upgrade any building to Tier 3',
    tier: 'silver',
    check: (s) => s.tier3Buildings >= 1,
  },
  {
    id: 'growing',
    title: 'Growing Village',
    detail: 'Reach 8 villagers',
    tier: 'bronze',
    check: (s) => s.population >= 8,
  },
  {
    id: 'crowded_square',
    title: 'Bustling Square',
    detail: 'Reach 12 villagers',
    tier: 'gold',
    check: (s) => s.population >= 12,
  },
  {
    id: 'treasury_baron',
    title: 'Treasury Baron',
    detail: 'Hold 200 gold at once',
    tier: 'silver',
    check: (s) => s.gold >= 200,
  },
  {
    id: 'cartographer',
    title: 'Cartographer',
    detail: 'Unlock all three biomes',
    tier: 'silver',
    check: (s) => s.biomes >= 3,
  },
  {
    id: 'road_network',
    title: 'Road Network',
    detail: 'Pave 6 roads',
    tier: 'bronze',
    check: (s) => s.roads >= 6,
  },
  {
    id: 'railhead',
    title: 'Railhead',
    detail: 'Build the rail spur',
    tier: 'silver',
    check: (s) => s.railSpurBuilt,
  },
  {
    id: 'golden_age',
    title: 'Golden Age',
    detail: 'Reach 80 prosperity',
    tier: 'gold',
    check: (s) => s.prosperity >= 80,
  },
];

const ACHIEVEMENTS_STORAGE_KEY = 'alderbrook_achievements_v1';

function readAchievementStore(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadUnlockedAchievements(townId: string): string[] {
  const entry = readAchievementStore()[townId];
  return Array.isArray(entry) ? entry.filter((id) => typeof id === 'string') : [];
}

export function saveUnlockedAchievements(townId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readAchievementStore();
    store[townId] = Array.from(new Set(ids));
    window.localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota issues
  }
}
