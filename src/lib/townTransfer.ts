import { sanitizeResources } from './economy.ts';
import {
  ALL_PLOT_IDS,
  ALL_STRUCTURE_TYPES,
  normalizeTownTheme,
  normalizeWeatherMode,
  type AgentRecord,
  type BiomeId,
  type PlotId,
  type StructureType,
  type TimeOfDay,
  type TownLogItem,
  type TownMetrics,
  type TownStructure,
  type WeatherMode,
  type TownTheme,
} from '../types/town.ts';
import type { LoadedTownState } from './townStore.ts';

export const TOWN_EXPORT_FORMAT = 'alderbrook-town';
export const TOWN_EXPORT_VERSION = 1;

export interface TownExportFile {
  format: typeof TOWN_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  town: LoadedTownState;
}

const VALID_PLOTS = new Set<string>(ALL_PLOT_IDS);
const VALID_STRUCTURES = new Set<string>([...ALL_STRUCTURE_TYPES, 'custom']);
const VALID_TIME: TimeOfDay[] = ['dawn', 'day', 'twilight', 'night'];
const VALID_BIOMES = new Set<BiomeId>(['forest', 'desert', 'cave']);

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function buildTownExport(state: LoadedTownState): string {
  const file: TownExportFile = {
    format: TOWN_EXPORT_FORMAT,
    version: TOWN_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    town: state,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Validates an exported save and returns a state that is safe to apply.
 * Throws an Error with a human-readable reason when the file is not usable.
 */
export function parseTownExport(text: string): LoadedTownState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file does not contain a town save.');
  }

  const file = parsed as Partial<TownExportFile> & { town?: unknown };
  if (file.format !== TOWN_EXPORT_FORMAT) {
    throw new Error('This is not an Alderbrook town export.');
  }
  if (num(file.version) > TOWN_EXPORT_VERSION) {
    throw new Error('This save was made by a newer version of Alderbrook.');
  }

  const town = file.town as Partial<LoadedTownState> | undefined;
  if (!town || typeof town !== 'object') {
    throw new Error('The save file has no town data.');
  }

  const rawAgents = Array.isArray(town.agents) ? town.agents : [];
  const agents = rawAgents.filter(
    (agent): agent is AgentRecord =>
      Boolean(agent) && typeof agent === 'object' && typeof (agent as AgentRecord).id === 'string',
  );
  if (agents.length === 0) {
    throw new Error('The save file has no villagers to restore.');
  }

  const rawStructures = Array.isArray(town.structures) ? town.structures : [];
  const structures = rawStructures.filter(
    (structure): structure is TownStructure =>
      Boolean(structure) &&
      VALID_PLOTS.has((structure as TownStructure).plotId) &&
      VALID_STRUCTURES.has((structure as TownStructure).structureType as StructureType),
  );

  const metrics = (town.metrics ?? {}) as Partial<TownMetrics>;
  const logs = Array.isArray(town.logs)
    ? town.logs.filter((log): log is TownLogItem => Boolean(log) && typeof log === 'object')
    : [];

  const timeOfDay = VALID_TIME.includes(town.timeOfDay as TimeOfDay)
    ? (town.timeOfDay as TimeOfDay)
    : 'day';

  const bons = Array.isArray(town.unlockedBiomes)
    ? town.unlockedBiomes.filter((biome): biome is BiomeId => VALID_BIOMES.has(biome as BiomeId))
    : [];

  return {
    townId: str(town.townId, 'imported_town') || 'imported_town',
    townName: str(town.townName, 'Imported Town').slice(0, 60) || 'Imported Town',
    turnCount: Math.max(0, Math.round(num(town.turnCount))),
    activeAgentIndex: Math.max(0, Math.round(num(town.activeAgentIndex)) % agents.length),
    activeDecree: str(town.activeDecree).slice(0, 280),
    metrics: {
      prosperity: Math.max(0, Math.min(100, num(metrics.prosperity, 50))),
      orderLevel: Math.max(0, Math.min(100, num(metrics.orderLevel, 50))),
      morale: Math.max(0, Math.min(100, num(metrics.morale, 50))),
    },
    resources: sanitizeResources(town.resources),
    timeOfDay,
    weather: normalizeWeatherMode(town.weather as WeatherMode),
    theme: normalizeTownTheme(town.theme as TownTheme),
    unlockedBiomes: Array.from(new Set(bons)),
    roads: Array.isArray(town.roads)
      ? town.roads.filter((road): road is string => typeof road === 'string').slice(0, 64)
      : [],
    railSpurBuilt: Boolean(town.railSpurBuilt),
    autoMode: Boolean(town.autoMode),
    agents,
    structures,
    logs,
  };
}

/** Triggers a browser download and returns the filename used. */
export function downloadTownExport(state: LoadedTownState): string {
  const safeName =
    state.townName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'alderbrook';
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}-${stamp}.alderbrook.json`;
  const blob = new Blob([buildTownExport(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}
