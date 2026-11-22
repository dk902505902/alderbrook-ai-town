import {
  PLOT_META,
  type CustomBuildingStyle,
  type StructureType,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';

export type ResourceId = 'timber' | 'stone' | 'food' | 'gold';

export type TownResources = Record<ResourceId, number>;

export interface TownResourceFlow {
  production: TownResources;
  upkeep: TownResources;
  net: TownResources;
  caps: TownResources;
  starvation: boolean;
}

export const RESOURCE_IDS: ResourceId[] = ['timber', 'stone', 'food', 'gold'];

export const DEFAULT_TOWN_RESOURCES: TownResources = {
  timber: 60,
  stone: 40,
  food: 50,
  gold: 25,
};

export const BASE_RESOURCE_CAPS: TownResources = {
  timber: 120,
  stone: 100,
  food: 80,
  gold: 200,
};

export const RESOURCE_META: Record<ResourceId, { label: string; color: string }> = {
  timber: { label: 'Timber', color: '#d97706' },
  stone: { label: 'Stone', color: '#94a3b8' },
  food: { label: 'Food', color: '#22c55e' },
  gold: { label: 'Gold', color: '#fbbf24' },
};

/** A small trickle from the plaza market, starter supply yard and park gardens. */
export const BASE_PASSIVE_PRODUCTION: TownResources = {
  timber: 1,
  stone: 1,
  food: 2,
  gold: 1,
};

/** Upper bound accepted from storage/Firestore before clamping to live caps. */
const MAX_RESOURCE_VALUE = 100000;

function emptyResources(): TownResources {
  return { timber: 0, stone: 0, food: 0, gold: 0 };
}

function toCount(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_RESOURCE_VALUE, Math.round(n)));
}

export function sanitizeResources(raw: unknown): TownResources {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TOWN_RESOURCES };
  const input = raw as Partial<Record<ResourceId, unknown>>;
  return {
    timber: toCount(input.timber, DEFAULT_TOWN_RESOURCES.timber),
    stone: toCount(input.stone, DEFAULT_TOWN_RESOURCES.stone),
    food: toCount(input.food, DEFAULT_TOWN_RESOURCES.food),
    gold: toCount(input.gold, DEFAULT_TOWN_RESOURCES.gold),
  };
}

/** Granaries and greenhouses raise how much the town can stockpile. */
export function getResourceCaps(structures: TownStructure[]): TownResources {
  const caps: TownResources = { ...BASE_RESOURCE_CAPS };
  for (const s of structures) {
    if (s.status !== 'complete') continue;
    if (s.structureType === 'granary') {
      caps.timber += 60;
      caps.stone += 40;
      caps.food += 60;
    } else if (s.structureType === 'greenhouse') {
      caps.food += 30;
    } else if (s.structureType === 'library') {
      caps.gold += 40;
    }
  }
  return caps;
}

export function getStructureBuildCost(
  structureType: StructureType,
  customStyle?: CustomBuildingStyle,
): TownResources {
  switch (structureType) {
    case 'bakery':
      return { timber: 25, stone: 15, food: 0, gold: 0 };
    case 'watchtower':
      return { timber: 20, stone: 30, food: 0, gold: 0 };
    case 'greenhouse':
      return { timber: 30, stone: 10, food: 0, gold: 0 };
    case 'windmill':
      return { timber: 40, stone: 20, food: 0, gold: 10 };
    case 'library':
      return { timber: 30, stone: 35, food: 0, gold: 15 };
    case 'granary':
      return { timber: 45, stone: 15, food: 0, gold: 0 };
    case 'pavilion':
      return { timber: 30, stone: 5, food: 0, gold: 0 };
    case 'clock_tower':
      return { timber: 20, stone: 40, food: 0, gold: 20 };
    case 'custom':
      return customStyle === 'tower' || customStyle === 'observatory'
        ? { timber: 25, stone: 35, food: 0, gold: 15 }
        : { timber: 30, stone: 25, food: 0, gold: 5 };
    default:
      return { timber: 30, stone: 20, food: 0, gold: 0 };
  }
}

/** Cost to move a completed Tier N building to Tier N+1. */
export function getUpgradeCost(
  structureType: StructureType,
  currentTier: number,
  customStyle?: CustomBuildingStyle,
): TownResources {
  const base = getStructureBuildCost(structureType, customStyle);
  const tier = Math.max(1, Math.min(2, currentTier));
  const scale = 0.6 * tier;
  const gold = Math.max(5, Math.round((base.gold || 10) * scale));
  return {
    timber: Math.round(base.timber * scale),
    stone: Math.round(base.stone * scale),
    food: 0,
    gold,
  };
}

export const ROAD_BUILD_COST: TownResources = { timber: 8, stone: 12, food: 0, gold: 0 };
export const RAIL_SPUR_BUILD_COST: TownResources = { timber: 30, stone: 15, food: 0, gold: 20 };
export const BIOME_UNLOCK_COST: TownResources = { timber: 15, stone: 0, food: 0, gold: 25 };

export function canAfford(resources: TownResources, cost: TownResources): boolean {
  return RESOURCE_IDS.every((id) => resources[id] >= cost[id]);
}

export function missingResources(
  resources: TownResources,
  cost: TownResources,
): Partial<TownResources> {
  const missing: Partial<TownResources> = {};
  for (const id of RESOURCE_IDS) {
    const short = cost[id] - resources[id];
    if (short > 0) missing[id] = short;
  }
  return missing;
}

export function spendResources(
  resources: TownResources,
  cost: TownResources,
  caps: TownResources,
): TownResources {
  const next = emptyResources();
  for (const id of RESOURCE_IDS) {
    next[id] = Math.max(0, Math.min(caps[id], resources[id] - cost[id]));
  }
  return next;
}

export function addResources(
  resources: TownResources,
  delta: Partial<TownResources>,
  caps: TownResources,
): TownResources {
  const next = emptyResources();
  for (const id of RESOURCE_IDS) {
    next[id] = Math.max(0, Math.min(caps[id], resources[id] + (delta[id] ?? 0)));
  }
  return next;
}

function structureFlow(structure: TownStructure, weather: WeatherMode): TownResources {
  if (structure.status !== 'complete') return emptyResources();

  let flow: TownResources;
  if (structure.structureType === 'custom') {
    switch (structure.customStyle) {
      case 'lab':
      case 'observatory':
        flow = { timber: 0, stone: 0, food: 0, gold: 2 };
        break;
      case 'cafe':
      case 'tavern':
        flow = { timber: 0, stone: 0, food: -2, gold: 3 };
        break;
      case 'forge':
        flow = { timber: 2, stone: 3, food: 0, gold: 0 };
        break;
      case 'guild':
        flow = { timber: 1, stone: 1, food: 0, gold: 2 };
        break;
      case 'cabin':
        flow = { timber: 3, stone: 1, food: 0, gold: 0 };
        break;
      case 'tower':
        flow = { timber: 0, stone: 3, food: 0, gold: 0 };
        break;
      default:
        flow = { timber: 1, stone: 1, food: 0, gold: 1 };
        break;
    }
  } else {
    switch (structure.structureType) {
      case 'bakery':
        flow = { timber: 0, stone: 0, food: -2, gold: 4 };
        break;
      case 'watchtower':
        flow = { timber: 0, stone: 0, food: 0, gold: -2 };
        break;
      case 'greenhouse':
        flow = { timber: 0, stone: 0, food: 5, gold: 0 };
        break;
      case 'windmill':
        flow = { timber: 0, stone: 0, food: 8, gold: 2 };
        break;
      case 'library':
        flow = { timber: 0, stone: 0, food: 0, gold: 2 };
        break;
      case 'granary':
        flow = { timber: 4, stone: 3, food: 0, gold: 0 };
        break;
      case 'pavilion':
        flow = { timber: 0, stone: 0, food: -1, gold: 1 };
        break;
      case 'clock_tower':
        flow = { timber: 0, stone: 0, food: 0, gold: 3 };
        break;
      default:
        flow = emptyResources();
        break;
    }
  }

  // Outer-biome outposts harvest their local bounty
  const biome = PLOT_META[structure.plotId]?.biome;
  if (biome === 'forest') flow.timber += 2;
  else if (biome === 'desert') flow.gold += 2;
  else if (biome === 'cave') flow.stone += 2;

  // Seasons shape harvests
  const isHarvestBuilding =
    structure.structureType === 'greenhouse' ||
    structure.structureType === 'granary' ||
    structure.structureType === 'windmill';
  let multiplier = 1;
  if (weather === 'winter' && isHarvestBuilding) multiplier = 0.75;
  if (weather === 'rain' && (structure.structureType === 'greenhouse' || structure.structureType === 'granary')) {
    multiplier = 1.25;
  }
  if (weather === 'summer' && structure.structureType === 'windmill') multiplier = 1.25;

  if (multiplier !== 1) {
    for (const id of RESOURCE_IDS) {
      const value = flow[id];
      flow[id] = value === 0 ? 0 : value > 0 ? Math.ceil(value * multiplier) : Math.floor(value * multiplier);
    }
  }

  return flow;
}

export function getTurnEconomy(
  structures: TownStructure[],
  villagers: number,
  weather: WeatherMode,
): TownResourceFlow {
  const production: TownResources = { ...BASE_PASSIVE_PRODUCTION };
  for (const structure of structures) {
    const flow = structureFlow(structure, weather);
    for (const id of RESOURCE_IDS) production[id] += flow[id];
  }

  // Villagers eat one food every other turn, rounded up
  const upkeep = emptyResources();
  upkeep.food = Math.ceil(Math.max(0, villagers) / 2);

  const net = emptyResources();
  for (const id of RESOURCE_IDS) net[id] = production[id] - upkeep[id];

  return {
    production,
    upkeep,
    net,
    caps: getResourceCaps(structures),
    starvation: false,
  };
}

/**
 * Applies one turn of harvesting and villager upkeep.
 * Returns the clamped stockpile plus whether the town ran out of food.
 */
export function applyTurnEconomy(
  resources: TownResources,
  structures: TownStructure[],
  villagers: number,
  weather: WeatherMode,
): { resources: TownResources; flow: TownResourceFlow } {
  const flow = getTurnEconomy(structures, villagers, weather);
  const next = emptyResources();
  for (const id of RESOURCE_IDS) {
    next[id] = Math.max(0, Math.min(flow.caps[id], resources[id] + flow.net[id]));
  }
  return {
    resources: next,
    flow: { ...flow, starvation: next.food === 0 && flow.net.food < 0 },
  };
}

export function formatResourcesShort(resources: TownResources): string {
  return RESOURCE_IDS.map((id) => `${resources[id]} ${RESOURCE_META[id].label.toLowerCase()}`).join(' · ');
}

export function formatResourceCost(cost: TownResources): string {
  const parts = RESOURCE_IDS.filter((id) => cost[id] > 0).map(
    (id) => `${cost[id]} ${RESOURCE_META[id].label.toLowerCase()}`,
  );
  return parts.length > 0 ? parts.join(' · ') : 'free';
}

export function formatResourceDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
