import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_TOWN_AGENTS = 15;

type LocationId = 'town_hall' | 'workshop' | 'market' | 'park';
type HatStyle = 'straw' | 'cap' | 'helmet' | 'hood' | 'beret';

type PlotId =
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
  | 'plot_desert_1'
  | 'plot_desert_2'
  | 'plot_cave_1'
  | 'plot_cave_2'
  | 'plot_alpine_1'
  | 'plot_alpine_2'
  | 'plot_alpine_3'
  | 'plot_river_1'
  | 'plot_river_2'
  | 'plot_river_3'
  | 'plot_canyon_1'
  | 'plot_canyon_2'
  | 'plot_canyon_3';

type StructureType =
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
  | 'triple_gun_tower';

type BuildAction = 'none' | 'propose' | 'construct' | 'upgrade';
type WeatherMode = 'summer' | 'rain' | 'winter';

function normalizeWeatherMode(val: unknown): WeatherMode {
  if (val === 'rain') return 'rain';
  if (val === 'winter') return 'winter';
  return 'summer';
}

interface AgentSnapshot {
  id: string;
  name: string;
  rank: number;
  role: string;
  department?: string;
  supervisor: string | null;
  subordinates: string[];
  personality?: string;
  assignedPlotId?: PlotId | null;
  isHired?: boolean;
  location: LocationId;
  activePlotId?: PlotId | null;
  dialogue: string;
  currentTask: string;
  userNote?: string;
}

interface StructureSnapshot {
  plotId: PlotId;
  structureType: StructureType;
  status: 'building' | 'complete';
  progress: number;
  tier: number;
}

interface LogSnapshot {
  turnNumber: number;
  agentName: string;
  location: string;
  targetAgent: string | null;
  dialogue: string;
}

interface TurnRequestBody {
  activeAgentId: string;
  agents: AgentSnapshot[];
  structures?: StructureSnapshot[];
  recentLogs: LogSnapshot[];
  activeDecree: string;
  turnCount: number;
  timeOfDay?: string;
  weather?: string;
  metrics?: {
    prosperity?: number;
    orderLevel?: number;
    morale?: number;
  };
  socialBonds?: string;
  interTownRailBuilt?: boolean;
  otherTownNames?: string[];
}

interface HireRequestBody {
  prompt: string;
  agents: AgentSnapshot[];
  structures?: StructureSnapshot[];
  timeOfDay?: string;
  weather?: string;
}

interface BuildOrderResult {
  action: BuildAction;
  plot_id: PlotId | null;
  structure_type: StructureType | null;
}

interface HiredWorkerSpec {
  name: string;
  role: string;
  department: string;
  supervisor: string;
  personality: string;
  location: LocationId;
  assignedPlotId: PlotId | null;
  accentColor: string;
  outfitColors: {
    coat: string;
    pants: string;
    hat: string;
    trim: string;
  };
  hatStyle: HatStyle;
  dialogue: string;
  currentTask: string;
  thought: string;
}

interface TurnAIResult {
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
  build_order: BuildOrderResult;
  visit_plot_id: PlotId | null;
  hired_worker: HiredWorkerSpec | null;
  unhired_worker: { agent_id: string; reason: string } | null;
  build_inter_town_rail: { target_town: string; reason: string } | null;
}

const CORE_COUNCIL_IDS = new Set([
  'mayor_sterling',
  'commander_vance',
  'architect_lyra',
  'worker_kai',
  'worker_pip',
]);

const VALID_LOCATIONS = new Set<LocationId>(['town_hall', 'workshop', 'market', 'park']);
const VALID_HAT_STYLES = new Set<HatStyle>(['straw', 'cap', 'helmet', 'hood', 'beret']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const FALLBACK_PALETTES: Array<{
  coat: string;
  pants: string;
  hat: string;
  trim: string;
  hatStyle: HatStyle;
}> = [
  { coat: '#10b981', pants: '#334155', hat: '#fde68a', trim: '#f59e0b', hatStyle: 'straw' },
  { coat: '#0ea5e9', pants: '#1e293b', hat: '#1e3a8a', trim: '#38bdf8', hatStyle: 'cap' },
  { coat: '#d97706', pants: '#451a03', hat: '#fef3c7', trim: '#fbbf24', hatStyle: 'helmet' },
  { coat: '#ec4899', pants: '#312e81', hat: '#fbcfe8', trim: '#f472b6', hatStyle: 'beret' },
  { coat: '#8b5cf6', pants: '#1e1b4b', hat: '#ddd6fe', trim: '#a78bfa', hatStyle: 'hood' },
  { coat: '#14b8a6', pants: '#0f172a', hat: '#ccfbf1', trim: '#2dd4bf', hatStyle: 'cap' },
];

const ALL_PLOTS: PlotId[] = [
  'plot_nw',
  'plot_ne',
  'plot_sw',
  'plot_se',
  'plot_n_west',
  'plot_n_east',
  'plot_s_west',
  'plot_s_east',
  'plot_forest_1',
  'plot_forest_2',
  'plot_desert_1',
  'plot_desert_2',
  'plot_cave_1',
  'plot_cave_2',
  'plot_alpine_1',
  'plot_alpine_2',
  'plot_alpine_3',
  'plot_river_1',
  'plot_river_2',
  'plot_river_3',
  'plot_canyon_1',
  'plot_canyon_2',
  'plot_canyon_3',
];
const VALID_PLOTS = new Set<PlotId>(ALL_PLOTS);

const ALL_STRUCTURES: StructureType[] = [
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
];
const VALID_STRUCTURES = new Set<StructureType>(ALL_STRUCTURES);

const VALID_BUILD_ACTIONS = new Set<BuildAction>(['none', 'propose', 'construct', 'upgrade']);

function parseHeaderKeyPool(req: Request): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const pushKey = (k: unknown) => {
    if (typeof k !== 'string') return;
    const trimmed = k.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  };

  const rawPool = req.header('x-ai-api-keys')?.trim();
  if (rawPool) {
    try {
      const parsed = JSON.parse(rawPool);
      if (Array.isArray(parsed)) {
        for (const item of parsed.slice(0, 12)) {
          pushKey(item);
        }
      }
    } catch {
      // Fall back to single x-ai-api-key header
    }
  }
  pushKey(req.header('x-ai-api-key'));
  return keys;
}

function resolveProviderConfig(req: Request): {
  baseUrl: string;
  modelName: string;
  apiKey: string;
  apiKeys: string[];
} {
  const headerBase = req.header('x-ai-base-url')?.trim();
  const headerModel = req.header('x-ai-model-name')?.trim();
  const headerKeys = parseHeaderKeyPool(req);

  const defaultGeminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';
  const envBase = process.env.AI_BASE_URL?.trim();

  const rawBase = headerBase || envBase || defaultGeminiBase;

  const cleanBase = rawBase
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/+$/, '');

  const modelName =
    headerModel ||
    process.env.AI_MODEL_NAME?.trim() ||
    'gemini-3.1-flash-lite';

  const normalizedEnvBase = envBase
    ? envBase.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '')
    : '';
  const isGeminiBase = cleanBase.startsWith('https://generativelanguage.googleapis.com');
  const matchesEnvBase =
    !headerBase ||
    (normalizedEnvBase ? cleanBase === normalizedEnvBase : isGeminiBase);

  const fallbackApiKey =
    (matchesEnvBase ? process.env.AI_API_KEY?.trim() : '') ||
    (isGeminiBase ? process.env.GEMINI_API_KEY?.trim() : '') ||
    '';

  const apiKeys = headerKeys.length > 0 ? headerKeys : fallbackApiKey ? [fallbackApiKey] : [];
  const apiKey = apiKeys[0] ?? '';

  return { baseUrl: cleanBase, modelName, apiKey, apiKeys };
}

function getHierarchyRules(agent: AgentSnapshot): string {
  switch (agent.id) {
    case 'mayor_sterling':
      return [
        'You are Rank 1 (Town Leader).',
        'Set town expansion priorities, evaluate reports from Rank 2 Managers (Commander Vance and Architect Lyra), and honor any active Civic Decree.',
        'You may propose a new building ("propose") or approve an "upgrade" on a completed building, then direct Rank 2 Managers (Vance or Lyra) downward. Do NOT micromanage Rank 3 workers directly.',
      ].join(' ');
    case 'commander_vance':
      return [
        'You are Rank 2 (Security & Logistics Manager).',
        'Follow Mayor Sterling’s directives, oversee Market supply and perimeter watch, and assign tasks to Worker Kai and security/logistics staff.',
        'You can "propose" security/supply buildings (watchtower, granary, clock_tower) on empty plots, help "construct" active sites, or "upgrade" completed ones. Report progress upward to Mayor Sterling.',
      ].join(' ');
    case 'architect_lyra':
      return [
        'You are Rank 2 (Builder & Economy Manager).',
        'Follow Mayor Sterling’s directives, design Workshop, Park, and Town Square expansions, and assign tasks to Worker Pip and civic artisans.',
        'Actively use "propose" on empty plots (bakery, greenhouse, windmill, library, pavilion, clock_tower), or "upgrade" completed structures. Report progress upward to Mayor Sterling.',
      ].join(' ');
    case 'worker_kai':
      return [
        'You are Rank 3 (Guard & Hauler).',
        'Strictly obey Commander Vance’s orders. Haul timber/stone and use "construct" on any active building site, or patrol landmarks and report completion upward to Commander Vance.',
      ].join(' ');
    case 'worker_pip':
      return [
        'You are Rank 3 (Artisan & Gatherer).',
        'Strictly obey Architect Lyra’s orders. Whenever an active construction site exists, go there and use "construct" to raise walls and roofs, then report progress upward to Architect Lyra.',
      ].join(' ');
    default: {
      const sup = agent.supervisor || 'Architect Lyra';
      const personality = agent.personality ? ` Personality: ${agent.personality}` : '';
      const workplace = agent.assignedPlotId
        ? ` Your assigned post is ${agent.assignedPlotId}; prioritize working around that structure or helping construct any active building site.`
        : '';
      return [
        `You are Rank 3 Specialist (${agent.role}, ${agent.department || 'Civic Works'}).${personality}`,
        `Report progress upward to ${sup}.${workplace}`,
        'Speak briefly in character with your specialized craft, and use build_order.action = "construct" if an active building plot needs hands.',
      ].join(' ');
    }
  }
}

function clampDialogueWords(text: string, maxWords = 15): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ').replace(/[.,;:!?]*$/, '') + '.';
}

function clampDelta(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-4, Math.min(5, Math.round(n)));
}

function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (HEX_COLOR_RE.test(trimmed)) return trimmed.toLowerCase();
  }
  return fallback;
}

function extractJsonObject(rawContent: string): Record<string, unknown> {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model response did not contain a valid JSON object.');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

function sanitizeHiredWorkerSpec(
  raw: unknown,
  usedNamesLower: Set<string>,
  structures: StructureSnapshot[],
  fallbackIdx: number,
): HiredWorkerSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const palette = FALLBACK_PALETTES[fallbackIdx % FALLBACK_PALETTES.length];

  let baseName = String(obj.name ?? '').trim().replace(/[^a-zA-Z0-9 '\-.]/g, '').slice(0, 40);
  if (!baseName) {
    baseName = `Villager ${fallbackIdx + 1}`;
  }
  let candidateName = baseName;
  let counter = 2;
  while (usedNamesLower.has(candidateName.toLowerCase())) {
    candidateName = `${baseName.slice(0, 32)} ${counter++}`;
  }
  usedNamesLower.add(candidateName.toLowerCase());

  const role = String(obj.role ?? 'Town Artisan').trim().slice(0, 56) || 'Town Artisan';
  const rawSup = String(obj.supervisor ?? '').toLowerCase();
  const isSecurity =
    rawSup.includes('vance') ||
    /guard|watch|patrol|mason|warden|haul|granary|logistics/i.test(`${role} ${obj.department ?? ''}`);
  const supervisor = isSecurity ? 'Commander Vance' : 'Architect Lyra';
  const department =
    String(obj.department ?? '').trim().slice(0, 56) ||
    (isSecurity ? 'Security & Supply' : 'Civic Works');

  const personality =
    String(obj.personality ?? 'Eager to help Alderbrook flourish.').trim().slice(0, 150) ||
    'Eager to help Alderbrook flourish.';

  const rawLoc = String(obj.location ?? '').trim().toLowerCase() as LocationId;
  const location: LocationId = VALID_LOCATIONS.has(rawLoc)
    ? rawLoc
    : isSecurity
      ? 'market'
      : 'workshop';

  let assignedPlotId: PlotId | null = null;
  const rawPlot = typeof obj.assigned_plot_id === 'string'
    ? obj.assigned_plot_id
    : typeof obj.assignedPlotId === 'string'
      ? obj.assignedPlotId
      : null;
  if (rawPlot) {
    const cleanPlot = rawPlot.trim().toLowerCase() as PlotId;
    if (VALID_PLOTS.has(cleanPlot) && structures.some((s) => s.plotId === cleanPlot)) {
      assignedPlotId = cleanPlot;
    }
  }

  const rawOutfit = (obj.outfit_colors && typeof obj.outfit_colors === 'object'
    ? obj.outfit_colors
    : obj.outfitColors && typeof obj.outfitColors === 'object'
      ? obj.outfitColors
      : {}) as Record<string, unknown>;

  const coat = sanitizeHexColor(rawOutfit.coat, palette.coat);
  const pants = sanitizeHexColor(rawOutfit.pants, palette.pants);
  const hat = sanitizeHexColor(rawOutfit.hat, palette.hat);
  const trim = sanitizeHexColor(rawOutfit.trim, palette.trim);

  const rawHatStyle = String(obj.hat_style ?? obj.hatStyle ?? '').trim().toLowerCase() as HatStyle;
  const hatStyle: HatStyle = VALID_HAT_STYLES.has(rawHatStyle) ? rawHatStyle : palette.hatStyle;

  const dialogue = clampDialogueWords(
    String(obj.dialogue ?? `Reporting for duty as ${role}!`),
    15,
  ).slice(0, 220);

  const currentTask =
    String(obj.current_task ?? obj.currentTask ?? `${role} settling in at Alderbrook`).trim().slice(0, 200) ||
    `${role} starting rounds`;

  const thought =
    String(obj.thought ?? `Honored to serve as ${role} in Alderbrook.`).trim().slice(0, 400) ||
    `Ready to begin duties as ${role}.`;

  return {
    name: candidateName,
    role,
    department,
    supervisor,
    personality,
    location,
    assignedPlotId,
    accentColor: coat,
    outfitColors: { coat, pants, hat, trim },
    hatStyle,
    dialogue,
    currentTask,
    thought,
  };
}

function sanitizeBuildOrder(
  rawBuild: unknown,
  activeAgent: AgentSnapshot,
  structures: StructureSnapshot[],
): BuildOrderResult {
  const structureByPlot = new Map<PlotId, StructureSnapshot>();
  for (const s of structures) {
    structureByPlot.set(s.plotId, s);
  }

  const obj = (rawBuild && typeof rawBuild === 'object' ? rawBuild : {}) as Record<string, unknown>;
  const rawAction = String(obj.action ?? 'none').trim().toLowerCase() as BuildAction;
  const action: BuildAction = VALID_BUILD_ACTIONS.has(rawAction) ? rawAction : 'none';

  const rawPlot = obj.plot_id ? (String(obj.plot_id).trim().toLowerCase() as PlotId) : null;
  let plot_id: PlotId | null = rawPlot && VALID_PLOTS.has(rawPlot) ? rawPlot : null;

  const rawType = obj.structure_type
    ? (String(obj.structure_type).trim().toLowerCase() as StructureType)
    : null;
  let structure_type: StructureType | null =
    rawType && VALID_STRUCTURES.has(rawType) ? rawType : null;

  if (action === 'none') {
    return { action: 'none', plot_id: null, structure_type: null };
  }

  // Workers (Rank 3) focus on constructing active sites rather than proposing new blueprints independently
  if (action === 'propose' && activeAgent.rank === 3) {
    const activeSite = structures.find((s) => s.status === 'building');
    if (activeSite) {
      return {
        action: 'construct',
        plot_id: activeSite.plotId,
        structure_type: activeSite.structureType,
      };
    }
    return { action: 'none', plot_id: null, structure_type: null };
  }

  if (action === 'propose') {
    const emptyPlots = ALL_PLOTS.filter((p) => !structureByPlot.has(p));
    if (emptyPlots.length === 0) {
      const upgradable = structures.find((s) => s.status === 'complete' && s.tier < 3);
      if (upgradable) {
        return {
          action: 'upgrade',
          plot_id: upgradable.plotId,
          structure_type: upgradable.structureType,
        };
      }
      return { action: 'none', plot_id: null, structure_type: null };
    }

    if (!plot_id || structureByPlot.has(plot_id)) {
      if (plot_id && structureByPlot.get(plot_id)?.status === 'building') {
        const existing = structureByPlot.get(plot_id)!;
        return {
          action: 'construct',
          plot_id,
          structure_type: existing.structureType,
        };
      }
      plot_id = emptyPlots[0];
    }

    if (!structure_type) {
      structure_type = activeAgent.id === 'commander_vance' ? 'watchtower' : 'bakery';
    }
    return { action: 'propose', plot_id, structure_type };
  }

  if (action === 'construct') {
    const targetSite =
      (plot_id && structureByPlot.get(plot_id)?.status === 'building'
        ? structureByPlot.get(plot_id)
        : null) || structures.find((s) => s.status === 'building');

    if (!targetSite) {
      return { action: 'none', plot_id: null, structure_type: null };
    }
    return {
      action: 'construct',
      plot_id: targetSite.plotId,
      structure_type: targetSite.structureType,
    };
  }

  if (action === 'upgrade') {
    const targetBuilt =
      (plot_id && structureByPlot.get(plot_id)?.status === 'complete' && structureByPlot.get(plot_id)!.tier < 3
        ? structureByPlot.get(plot_id)
        : null) || structures.find((s) => s.status === 'complete' && s.tier < 3);

    if (!targetBuilt) {
      return { action: 'none', plot_id: null, structure_type: null };
    }
    return {
      action: 'upgrade',
      plot_id: targetBuilt.plotId,
      structure_type: targetBuilt.structureType,
    };
  }

  return { action: 'none', plot_id: null, structure_type: null };
}

function sanitizeVisitPlotId(
  rawVisit: unknown,
  buildOrder: BuildOrderResult,
  structures: StructureSnapshot[],
  weather: WeatherMode,
  activeAgent: AgentSnapshot,
): PlotId | null {
  if (buildOrder.action !== 'none') return null;
  if (typeof rawVisit !== 'string') return null;
  const candidate = rawVisit.trim().toLowerCase() as PlotId;
  if (!VALID_PLOTS.has(candidate)) return null;
  const match = structures.find((s) => s.plotId === candidate && s.status === 'complete');
  if (!match) return null;
  // Hired specialists may visit their assigned workplace structure during any season
  if (activeAgent.assignedPlotId === candidate) {
    return candidate;
  }
  if (weather === 'summer') {
    return match.structureType === 'pavilion' ? candidate : null;
  }
  return match.structureType === 'pavilion' ||
    match.structureType === 'bakery' ||
    match.structureType === 'library'
    ? candidate
    : null;
}

function sanitizeTurnResult(
  parsed: Record<string, unknown>,
  activeAgent: AgentSnapshot,
  allAgents: AgentSnapshot[],
  structures: StructureSnapshot[],
  weather: WeatherMode,
  allowAutonomousHire: boolean,
  otherTownNames: string[] = [],
  interTownRailBuilt = false,
): TurnAIResult {
  const rawLoc = String(parsed.target_location ?? activeAgent.location).trim().toLowerCase() as LocationId;
  const target_location: LocationId = VALID_LOCATIONS.has(rawLoc) ? rawLoc : activeAgent.location;

  const validNames = allAgents.map((a) => a.name);
  let target_agent: string | null = null;
  if (parsed.target_agent !== null && parsed.target_agent !== undefined) {
    const candidate = String(parsed.target_agent).trim();
    if (
      candidate &&
      candidate.toLowerCase() !== 'null' &&
      candidate.toLowerCase() !== 'none' &&
      candidate !== activeAgent.name
    ) {
      const matched = validNames.find(
        (name) => name.toLowerCase() === candidate.toLowerCase() || name.toLowerCase().includes(candidate.toLowerCase()),
      );
      target_agent = matched && matched !== activeAgent.name ? matched : null;
    }
  }

  const thought = String(parsed.thought || `Reviewing duties at ${target_location}.`)
    .trim()
    .slice(0, 420);

  const rawDialogue = String(parsed.dialogue || 'Proceeding with my current town duties.').trim();
  const dialogue = clampDialogueWords(rawDialogue, 15).slice(0, 220);

  const new_task = String(parsed.new_task || `Active at ${target_location.replace('_', ' ')}`)
    .trim()
    .slice(0, 200);

  const rawDelta = (parsed.metrics_delta as Record<string, unknown> | undefined) || {};
  const metrics_delta = {
    prosperity: clampDelta(rawDelta.prosperity ?? (target_location === 'market' || target_location === 'workshop' ? 1 : 0)),
    order: clampDelta(rawDelta.order ?? (target_location === 'town_hall' || activeAgent.id === 'commander_vance' ? 1 : 0)),
    morale: clampDelta(rawDelta.morale ?? (target_location === 'park' ? 2 : 0)),
  };

  const build_order = sanitizeBuildOrder(parsed.build_order, activeAgent, structures);
  const visit_plot_id = sanitizeVisitPlotId(
    parsed.visit_plot_id,
    build_order,
    structures,
    weather,
    activeAgent,
  );

  let hired_worker: HiredWorkerSpec | null = null;
  if (allowAutonomousHire && parsed.hire_worker && typeof parsed.hire_worker === 'object') {
    const usedNames = new Set(allAgents.map((a) => a.name.toLowerCase()));
    hired_worker = sanitizeHiredWorkerSpec(
      parsed.hire_worker,
      usedNames,
      structures,
      allAgents.length,
    );
  }

  let unhired_worker: { agent_id: string; reason: string } | null = null;
  if (activeAgent.id === 'mayor_sterling' && parsed.unhire_worker) {
    const hiredPool = allAgents.filter((a) => !CORE_COUNCIL_IDS.has(a.id));
    if (hiredPool.length > 0) {
      let queryId = '';
      let reason = 'Dismissed by Mayor Sterling to rebalance town staffing.';
      if (typeof parsed.unhire_worker === 'string') {
        queryId = parsed.unhire_worker.trim();
      } else if (typeof parsed.unhire_worker === 'object') {
        const uw = parsed.unhire_worker as Record<string, unknown>;
        queryId = String(uw.agent_id ?? uw.id ?? uw.name ?? '').trim();
        if (typeof uw.reason === 'string' && uw.reason.trim()) {
          reason = uw.reason.trim().slice(0, 140);
        }
      }
      if (queryId) {
        const low = queryId.toLowerCase();
        const match =
          hiredPool.find((a) => a.id.toLowerCase() === low) ||
          hiredPool.find((a) => a.name.toLowerCase() === low) ||
          hiredPool.find(
            (a) =>
              a.name.toLowerCase().includes(low) || a.role.toLowerCase().includes(low),
          );
        if (match) {
          unhired_worker = { agent_id: match.id, reason };
        }
      }
    }
  }

  let build_inter_town_rail: { target_town: string; reason: string } | null = null;
  if (
    activeAgent.id === 'mayor_sterling' &&
    !interTownRailBuilt &&
    otherTownNames.length > 0 &&
    parsed.build_inter_town_rail
  ) {
    let targetCandidate = '';
    let railReason = 'Connected inter-town express railway for regional trade.';
    if (typeof parsed.build_inter_town_rail === 'string') {
      targetCandidate = parsed.build_inter_town_rail.trim();
    } else if (typeof parsed.build_inter_town_rail === 'object') {
      const rr = parsed.build_inter_town_rail as Record<string, unknown>;
      targetCandidate = String(rr.target_town ?? rr.town ?? rr.target ?? '').trim();
      if (typeof rr.reason === 'string' && rr.reason.trim()) {
        railReason = rr.reason.trim().slice(0, 140);
      }
    }
    if (targetCandidate) {
      const low = targetCandidate.toLowerCase();
      const matched =
        otherTownNames.find((n) => n.toLowerCase() === low) ||
        otherTownNames.find(
          (n) => n.toLowerCase().includes(low) || low.includes(n.toLowerCase()),
        ) ||
        otherTownNames[0];
      if (matched) {
        build_inter_town_rail = { target_town: matched.slice(0, 48), reason: railReason };
      }
    }
  }

  return {
    thought,
    target_location,
    target_agent,
    dialogue,
    new_task,
    metrics_delta,
    build_order,
    visit_plot_id,
    hired_worker,
    unhired_worker,
    build_inter_town_rail,
  };
}

async function callChatCompletionsOnce(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<{ status: number; data: Record<string, unknown>; errorText?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      return { status: response.status, data: {}, errorText: text.slice(0, 400) };
    }

    const json = JSON.parse(text) as Record<string, unknown>;
    return { status: response.status, data: json };
  } finally {
    clearTimeout(timeout);
  }
}

async function callChatCompletions(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown>; errorText?: string; modelUsed?: string }> {
  const endpoint = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
    headers['X-Title'] = 'Alderbrook AI Town';
  }

  const requestedModel = String(body.model ?? '');
  const isGoogleOpenAi = baseUrl.includes('generativelanguage.googleapis.com');
  const fallbackModel =
    isGoogleOpenAi && requestedModel !== 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : null;

  try {
    const first = await callChatCompletionsOnce(endpoint, headers, body, 30000);
    if (
      first.errorText &&
      fallbackModel &&
      (first.status === 503 || first.status === 404 || first.status === 429)
    ) {
      const retry = await callChatCompletionsOnce(
        endpoint,
        headers,
        { ...body, model: fallbackModel },
        30000,
      );
      return { ...retry, modelUsed: fallbackModel };
    }
    return { ...first, modelUsed: requestedModel };
  } catch (err) {
    if (fallbackModel) {
      const retry = await callChatCompletionsOnce(
        endpoint,
        headers,
        { ...body, model: fallbackModel },
        30000,
      );
      return { ...retry, modelUsed: fallbackModel };
    }
    throw err;
  }
}

async function callChatCompletionsWithKeyPool(
  baseUrl: string,
  apiKeys: string[],
  body: Record<string, unknown>,
  allowStripResponseFormat = false,
): Promise<{
  status: number;
  data: Record<string, unknown>;
  errorText?: string;
  modelUsed?: string;
  keyAttemptIndex: number;
  keysTried: number;
}> {
  const failoverStatuses = new Set([401, 402, 403, 429, 500, 502, 503]);
  let lastResult: {
    status: number;
    data: Record<string, unknown>;
    errorText?: string;
    modelUsed?: string;
  } = { status: 502, data: {}, errorText: 'No API keys available.' };

  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    let result = await callChatCompletions(baseUrl, key, body);

    if (
      allowStripResponseFormat &&
      'errorText' in result &&
      result.errorText &&
      result.status === 400 &&
      'response_format' in body
    ) {
      const fallback = { ...body };
      delete fallback.response_format;
      result = await callChatCompletions(baseUrl, key, fallback);
    }

    lastResult = result;
    if (!('errorText' in result && result.errorText)) {
      return {
        ...result,
        keyAttemptIndex: i,
        keysTried: i + 1,
      };
    }

    // Automatically fail over to the next key in the pool on quota/rate-limit/auth/transient errors
    if (i < apiKeys.length - 1 && failoverStatuses.has(result.status)) {
      continue;
    }

    return {
      ...result,
      keyAttemptIndex: i,
      keysTried: i + 1,
    };
  }

  return {
    ...lastResult,
    keyAttemptIndex: Math.max(0, apiKeys.length - 1),
    keysTried: apiKeys.length,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '96kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasDefaultKey: Boolean(process.env.AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/ai/test', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'No API key provided. Enter an API key in AI Providers settings or configure GEMINI_API_KEY / AI_API_KEY.',
      });
      return;
    }

    const startedAt = Date.now();
    try {
      const result = await callChatCompletionsWithKeyPool(baseUrl, apiKeys, {
        model: modelName,
        messages: [
          { role: 'user', content: 'Reply with exactly the word READY.' },
        ],
        max_tokens: 16,
        temperature: 0,
      });

      if ('errorText' in result && result.errorText) {
        const poolNote =
          apiKeys.length > 1 ? ` (tried ${result.keysTried}/${apiKeys.length} keys)` : '';
        res.status(result.status >= 400 ? result.status : 502).json({
          ok: false,
          error: `Provider returned HTTP ${result.status}${poolNote}: ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const reply = choices?.[0]?.message?.content?.trim() || 'Connected';
      res.json({
        ok: true,
        latencyMs: Date.now() - startedAt,
        modelName: result.modelUsed || modelName,
        keyAttemptIndex: result.keyAttemptIndex,
        keysTried: result.keysTried,
        totalKeys: apiKeys.length,
        reply: reply.slice(0, 60),
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to reach AI provider endpoint.',
      });
    }
  });

  function isPrivateOrReservedIp(ip: string): boolean {
    const clean = ip.trim().toLowerCase();
    if (clean.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(clean.slice(7));
    }
    const version = net.isIP(clean);
    if (version === 4) {
      const parts = clean.split('.').map(Number);
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a >= 224) return true;
      return false;
    }
    if (version === 6) {
      if (clean === '::' || clean === '::1') return true;
      if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
      if (clean.startsWith('fe80:') || clean.startsWith('ff')) return true;
      return false;
    }
    return true;
  }

  async function validatePublicWebhookUrl(rawUrl: string): Promise<URL> {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      throw new Error('Webhook URL must use https://');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Webhook URL cannot include embedded credentials.');
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      throw new Error('Private or local webhook hosts are not allowed.');
    }
    if (net.isIP(host)) {
      if (isPrivateOrReservedIp(host)) {
        throw new Error('Private or reserved webhook IP addresses are not allowed.');
      }
      return parsed;
    }
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0 || records.some((r) => isPrivateOrReservedIp(r.address))) {
      throw new Error('Webhook domain resolves to a restricted network address.');
    }
    return parsed;
  }

  app.post('/api/bridge/notify', async (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      webhookUrl?: unknown;
      telegramBotToken?: unknown;
      telegramChatId?: unknown;
      eventType?: unknown;
      title?: unknown;
      message?: unknown;
      townStats?: unknown;
    };

    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    const telegramBotToken =
      typeof body.telegramBotToken === 'string' ? body.telegramBotToken.trim() : '';
    const telegramChatId =
      typeof body.telegramChatId === 'string' ? body.telegramChatId.trim() : '';

    const eventType = String(body.eventType ?? 'town_event').trim().slice(0, 48) || 'town_event';
    const title = String(body.title ?? 'Alderbrook Alert').trim().slice(0, 120) || 'Alderbrook Alert';
    const message = String(body.message ?? '').trim().slice(0, 1200);
    if (!message) {
      res.status(400).json({ ok: false, error: 'Notification message is required.' });
      return;
    }

    if (!webhookUrl && (!telegramBotToken || !telegramChatId)) {
      res.status(400).json({
        ok: false,
        error: 'Provide a Webhook URL or both Telegram Bot Token and Chat ID.',
      });
      return;
    }

    const results: {
      webhook?: { ok: boolean; status?: number; error?: string };
      telegram?: { ok: boolean; status?: number; error?: string };
    } = {};

    if (webhookUrl) {
      try {
        const safeUrl = await validatePublicWebhookUrl(webhookUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const resp = await fetch(safeUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            redirect: 'manual',
            signal: controller.signal,
            body: JSON.stringify({
              source: 'Alderbrook AI Town',
              event: eventType,
              title,
              text: `[Alderbrook] ${title}: ${message}`,
              message,
              townStats:
                body.townStats && typeof body.townStats === 'object' ? body.townStats : undefined,
              timestamp: new Date().toISOString(),
            }),
          });
          results.webhook = {
            ok: resp.ok,
            status: resp.status,
            ...(resp.ok ? {} : { error: `HTTP ${resp.status}` }),
          };
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        results.webhook = {
          ok: false,
          error: err instanceof Error ? err.message : 'Invalid webhook URL.',
        };
      }
    }

    if (telegramBotToken || telegramChatId) {
      const tokenValid = /^\d{5,15}:[A-Za-z0-9_-]{20,80}$/.test(telegramBotToken);
      const chatValid = /^(?:-?\d{4,20}|@[a-zA-Z0-9_]{5,32})$/.test(telegramChatId);
      if (!tokenValid || !chatValid) {
        results.telegram = {
          ok: false,
          error: 'Invalid Telegram Bot Token or Chat ID format.',
        };
      } else {
        const tgEndpoint = `https://api.telegram.org/bot${encodeURIComponent(telegramBotToken)}/sendMessage`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const tgResp = await fetch(tgEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: `🏘️ ${title}\n${message}`,
            }),
          });
          results.telegram = {
            ok: tgResp.ok,
            status: tgResp.status,
            ...(tgResp.ok ? {} : { error: `Telegram returned HTTP ${tgResp.status}` }),
          };
        } catch (err) {
          results.telegram = {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to reach Telegram API.',
          };
        } finally {
          clearTimeout(timer);
        }
      }
    }

    const anyOk = Boolean(results.webhook?.ok || results.telegram?.ok);
    const allAttemptedOk =
      (!webhookUrl || Boolean(results.webhook?.ok)) &&
      (!(telegramBotToken || telegramChatId) || Boolean(results.telegram?.ok));

    res.status(anyOk ? 200 : 400).json({
      ok: allAttemptedOk,
      anyOk,
      ...results,
    });
  });

  app.post('/api/town/hire', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        error: 'Missing AI API key. Open AI Providers settings (gear icon) to enter your API key.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as HireRequestBody;
    const promptText = String(body?.prompt ?? '').trim().slice(0, 260);
    if (!promptText || !Array.isArray(body?.agents)) {
      res.status(400).json({ error: 'Enter a hiring request describing the worker(s) you need.' });
      return;
    }

    const existingAgents = body.agents;
    const slotsAvailable = MAX_TOWN_AGENTS - existingAgents.length;
    if (slotsAvailable <= 0) {
      res.status(400).json({
        error: `Alderbrook is at full capacity (${MAX_TOWN_AGENTS}/${MAX_TOWN_AGENTS} active villagers).`,
        code: 'CAPACITY_FULL',
      });
      return;
    }

    const maxCount = Math.min(3, slotsAvailable);
    const structures = Array.isArray(body.structures) ? body.structures : [];
    const structureSummary = structures.length > 0
      ? structures
          .map((s) => `- ${s.plotId}: ${s.structureType} (${s.status}, tier ${s.tier})`)
          .join('\n')
      : '- No buildings constructed yet; town relies on Town Hall, Workshop, Market, and Park.';

    const existingNames = existingAgents.map((a) => a.name).join(', ');
    const weather = normalizeWeatherMode(body.weather);

    const systemPrompt = [
      'You are the Chief Guild Recruiter for Alderbrook, a stylized low-poly 3D AI town.',
      `Generate new Rank 3 specialist villagers based on the user's recruitment request.`,
      `Respect population limits: return at least 1 and at most ${maxCount} workers in the "workers" array (matching any requested count like "2 masons" up to ${maxCount}).`,
      `CRITICAL: Never reuse any existing villager name: [${existingNames}].`,
      'Valid location values: "town_hall", "workshop", "market", "park".',
      'Valid hat_style values: "straw", "cap", "helmet", "hood", "beret".',
      'Supervisors: "Commander Vance" (Security, Watch, Hauling, Masonry, Supply) or "Architect Lyra" (Farming, Greenhouse, Baking, Milling, Archiving, Crafting).',
      'Outfit colors: pick harmonious, distinct Monument Valley / Townscaper stylized 6-digit hex strings (#rrggbb) for coat, pants, hat, and trim.',
      'Return ONLY a raw JSON object with this exact schema:',
      '{',
      '  "workers": [',
      '    {',
      '      "name": "First + Last or Title + Name (unique, e.g., Mason Bram or Botanist Clara)",',
      '      "role": "Specialized Job Title (max 40 chars)",',
      '      "department": "Civic Works | Security & Supply",',
      '      "supervisor": "Architect Lyra | Commander Vance",',
      '      "personality": "Memorable trait in <= 12 words",',
      '      "location": "town_hall | workshop | market | park",',
      '      "assigned_plot_id": "matching plot_id from Built Structures if relevant, else null",',
      '      "hat_style": "straw | cap | helmet | hood | beret",',
      '      "outfit_colors": { "coat": "#rrggbb", "pants": "#rrggbb", "hat": "#rrggbb", "trim": "#rrggbb" },',
      '      "thought": "Short arrival thought",',
      '      "dialogue": "Warm greeting arriving in Alderbrook Square (max 15 words)",',
      '      "current_task": "First active job duty"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const userPrompt = [
      `Hiring Request: "${promptText}"`,
      `Current Weather: ${weather.toUpperCase()}, Time: ${body.timeOfDay || 'day'}`,
      `Current Villager Count: ${existingAgents.length}/${MAX_TOWN_AGENTS}`,
      'Existing Town Structures:',
      structureSummary,
    ].join('\n');

    const payload: Record<string, unknown> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 650,
      response_format: { type: 'json_object' },
    };

    try {
      const result = await callChatCompletionsWithKeyPool(baseUrl, apiKeys, payload, true);

      if ('errorText' in result && result.errorText) {
        res.status(result.status >= 400 ? result.status : 502).json({
          error: `AI provider error (${result.status}): ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ error: 'AI provider returned an empty response.' });
        return;
      }

      const parsed = extractJsonObject(content);
      const rawWorkers = Array.isArray(parsed.workers)
        ? parsed.workers
        : parsed.name
          ? [parsed]
          : [];

      const usedNames = new Set(existingAgents.map((a) => a.name.toLowerCase()));
      const sanitized: HiredWorkerSpec[] = [];
      for (let i = 0; i < rawWorkers.length && sanitized.length < maxCount; i++) {
        const spec = sanitizeHiredWorkerSpec(
          rawWorkers[i],
          usedNames,
          structures,
          existingAgents.length + i,
        );
        if (spec) sanitized.push(spec);
      }

      if (sanitized.length === 0) {
        res.status(502).json({ error: 'Unable to parse hired worker profile from AI response.' });
        return;
      }

      res.json({
        workers: sanitized,
        modelUsed: result.modelUsed || modelName,
        keyAttemptIndex: result.keyAttemptIndex,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to recruit worker via AI provider.',
      });
    }
  });

  app.post('/api/town/mayor-chat', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        error: 'No AI API key configured for Mayor Sterling.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      message?: unknown;
      history?: Array<{ role?: string; text?: string }>;
      townName?: unknown;
      weather?: unknown;
      timeOfDay?: unknown;
      activeDecree?: unknown;
      unlockedBiomes?: unknown;
      roads?: unknown;
      railSpurBuilt?: unknown;
      interTownRailBuilt?: unknown;
      interTownRailTarget?: unknown;
      otherTownNames?: unknown;
      autoMode?: unknown;
      metrics?: { prosperity?: number; orderLevel?: number; morale?: number };
      agents?: Array<{
        id?: string;
        name?: string;
        role?: string;
        currentTask?: string;
        location?: string;
        isHired?: boolean;
      }>;
      structures?: Array<{
        plotId?: string;
        structureType?: string;
        customLabel?: string;
        status?: string;
        tier?: number;
      }>;
      recentLogs?: Array<{ agentName?: string; dialogue?: string }>;
      webResults?: Array<{ title?: string; url?: string; snippet?: string; source?: string }>;
      enemyCity?: {
        name?: string;
        gold?: number;
        food?: number;
        railBuilt?: boolean;
        helicoptersReady?: number;
        jetsReady?: number;
        builtCount?: number;
        counterRaidActive?: boolean;
      };
    };

    const userMessage = String(body.message ?? '').trim().slice(0, 300);
    if (!userMessage) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const townName = String(body.townName ?? 'Alderbrook').trim().slice(0, 60) || 'Alderbrook';
    const weather = normalizeWeatherMode(body.weather);
    const agentsList = Array.isArray(body.agents) ? body.agents.slice(0, MAX_TOWN_AGENTS) : [];
    const structsList = Array.isArray(body.structures) ? body.structures.slice(0, 23) : [];
    const logsList = Array.isArray(body.recentLogs) ? body.recentLogs.slice(0, 4) : [];
    const historyList = Array.isArray(body.history) ? body.history.slice(-4) : [];
    const webResultsList = Array.isArray(body.webResults) ? body.webResults.slice(0, 5) : [];
    const validBiomeSet = new Set(['forest', 'desert', 'cave', 'alpine', 'river', 'canyon']);
    const unlockedBiomes = Array.isArray(body.unlockedBiomes)
      ? body.unlockedBiomes
          .map((b) => String(b).toLowerCase())
          .filter((b) => validBiomeSet.has(b))
      : [];
    const roadsCount = Array.isArray(body.roads) ? body.roads.length : 0;
    const railSpurBuilt = Boolean(body.railSpurBuilt);
    const interTownRailBuilt = Boolean(body.interTownRailBuilt);
    const interTownRailTarget = String(body.interTownRailTarget ?? '').trim().slice(0, 48);
    const otherTownNames = Array.isArray(body.otherTownNames)
      ? body.otherTownNames
          .map((t) => String(t).trim().slice(0, 48))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const autoMode = Boolean(body.autoMode);

    const systemPrompt =
      webResultsList.length > 0
        ? [
            `You are Mayor Sterling, the warm, sharp Rank 1 leader of ${townName} AI Town.`,
            'Your News Scout just delivered live internet search results below.',
            'Summarize the top findings clearly in character as a crisp numbered list (up to 5 concise bullet/numbered items, 1 short sentence each) while staying accurate to the search snippets.',
            'Return ONLY raw JSON matching: {"reply":"string (concise summary with numbered items)","action":{"type":"none"}}',
          ].join('\n')
        : [
            `You are Mayor Sterling, the warm, decisive Rank 1 leader of ${townName} AI Town.`,
            'Have a natural, concise 1-2 sentence conversation with the player AND execute town actions when asked.',
            'Valid action.type values: "none", "build", "hire", "unhire", "decree", "create_town", "expand_biome", "build_road", "extend_rail", "build_inter_town_rail", "toggle_auto", "trigger_raid", "toggle_raids", "counter_raid".',
            '- Use "build" to build/construct/open/upgrade ANY preset or custom building (e.g. Triple-Gun Defense Tower, Town Hospital, Defense Wall, Research Lab, Observatory, Cafe Shop, Tavern, Forge, Bakery, Watchtower, Greenhouse, Windmill, Library, Granary, Pavilion, Clock Tower). Set action.target to the requested building name and optional action.biome ("forest"|"desert"|"cave"|"alpine"|"river"|"canyon") if a biome was specified.',
            '- Use "hire" to recruit workers (e.g. medic, researcher, barista, baker, miner, guard). Set action.workerPrompt to a crisp hiring request.',
            '- Use "unhire" when asked to unhire, fire, dismiss, let go, or lay off a hired specialist—OR if you decide on your own to dismiss a redundant hired worker to trim upkeep or free a slot. Set action.target to the hired worker\'s name, id, or role. Core council members (Mayor Sterling, Commander Vance, Architect Lyra, Worker Kai, Worker Pip) cannot be unhired.',
            '- Use "decree" for town-wide announcements, festivals, or civic orders. Set action.decree.',
            '- Use "create_town" when the player asks to create/start a NEW saved town or city (never overwrites existing towns). Set action.townName to the new town name.',
            '- Use "expand_biome" when asked to expand the map or unlock an outer biome ("forest" Dense Forest, "desert" Desert Dunes, "cave" Crystal Cave, "alpine" Alpine Snow Peaks, "river" Turquoise River Crossing, "canyon" Red-Rock Canyon). Set action.biome.',
            '- Use "build_road" when asked to build/lay cobblestone roads to a building, plot, or outer biome. Set action.roadTarget.',
            '- Use "extend_rail" when asked to extend the local outer railway loop / Frontier Depot stop.',
            '- Use "build_inter_town_rail" when asked to build a train track / express railway connecting to ANOTHER saved town (e.g. Moon or another town in the Town Switcher), OR if you decide to connect one. Set action.townName to the destination town name.',
            '- Use "toggle_auto" when asked to turn Automatic City-Builder mode ON or OFF (e.g., "Mayor go automatic", "Stop automatic"). Set action.autoEnabled (boolean).',
            '- Use "trigger_raid" when asked to trigger/start an enemy raider attack wave.',
            '- Use "toggle_raids" when asked to turn Enemy Raids ON or OFF / switch to peaceful mode. Set action.raidsEnabled (boolean).',
            '- Use "counter_raid" when asked to counter-attack the rival enemy fortress town (Ironhold Bastion) or loot/reclaim Gold and Food back from their depot.',
            '- Otherwise set action.type to "none".',
            'Return ONLY raw JSON matching: {"reply":"string (<= 45 words)","action":{"type":"none|build|hire|unhire|decree|create_town|expand_biome|build_road|extend_rail|build_inter_town_rail|toggle_auto|trigger_raid|toggle_raids|counter_raid","target":"optional","workerPrompt":"optional","decree":"optional","townName":"optional","biome":"optional","roadTarget":"optional","autoEnabled":true,"raidsEnabled":true}}',
          ].join('\n');

    const webResultsBlock =
      webResultsList.length > 0
        ? [
            'Live Web Search Results:',
            ...webResultsList.map(
              (r, idx) =>
                `${idx + 1}. ${String(r.title ?? '').slice(0, 110)} (${String(r.source ?? 'web')}) — ${String(r.snippet ?? '').slice(0, 160)}`,
            ),
          ].join('\n')
        : '';

    const hiredRosterList = agentsList.filter((a) => a.isHired || (a.id && !CORE_COUNCIL_IDS.has(a.id)));
    const contextSummary = [
      `Town: ${townName} | Auto Mode: ${autoMode ? 'ON' : 'OFF'} | Weather: ${weather}, Time: ${String(body.timeOfDay ?? 'day')}, Villagers: ${agentsList.length}/${MAX_TOWN_AGENTS}`,
      `Pulse: Prosperity ${body.metrics?.prosperity ?? 68}, Order ${body.metrics?.orderLevel ?? 74}, Morale ${body.metrics?.morale ?? 72}`,
      `Outer Biomes Unlocked: ${unlockedBiomes.length > 0 ? unlockedBiomes.join(', ') : 'None yet (available: forest, desert, cave, alpine, river, canyon)'} | Cobblestone Roads: ${roadsCount} | Rail Spur: ${railSpurBuilt ? 'Built' : 'Not built'} | Inter-Town Rail: ${interTownRailBuilt ? `Connected to ${interTownRailTarget || 'neighboring town'}` : 'Not built'}`,
      otherTownNames.length > 0 ? `Other Saved Towns Reachable by Rail/Bus: ${otherTownNames.join(', ')}` : '',
      body.activeDecree ? `Active Decree: ${String(body.activeDecree).slice(0, 140)}` : 'Active Decree: None',
      `Buildings (${structsList.length}): ${
        structsList.length > 0
          ? structsList
              .map(
                (s) =>
                  `${s.customLabel || s.structureType}(${s.status},T${s.tier ?? 1})`,
              )
              .join(', ')
          : 'None yet'
      }`,
      `Hired Specialists (${hiredRosterList.length} eligible to unhire if needed): ${
        hiredRosterList.length > 0
          ? hiredRosterList.map((a) => `${a.name} (${a.role})`).join(', ')
          : 'None yet (only 5 core council members)'
      }`,
      `Active Tasks: ${agentsList
        .slice(0, 6)
        .map((a) => `${a.name}: ${String(a.currentTask ?? '').slice(0, 45)}`)
        .join(' | ')}`,
      logsList.length > 0
        ? `Recent Log: ${logsList.map((l) => `${l.agentName}: ${String(l.dialogue ?? '').slice(0, 55)}`).join(' | ')}`
        : '',
      body.enemyCity
        ? `Rival Fortress (${String(body.enemyCity.name ?? 'Ironhold Bastion').slice(0, 32)}): ${Number(body.enemyCity.gold ?? 0)}g Gold, ${Number(body.enemyCity.food ?? 0)} Food, ${Number(body.enemyCity.builtCount ?? 1)} buildings, Rail ${body.enemyCity.railBuilt ? 'BUILT' : 'not built'}, Air Force: ${Number(body.enemyCity.helicoptersReady ?? 0)} Helis / ${Number(body.enemyCity.jetsReady ?? 0)} Jets${body.enemyCity.counterRaidActive ? ' (Counter-Raid underway!)' : ''}`
        : '',
      webResultsBlock,
    ]
      .filter(Boolean)
      .join('\n');

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: `${systemPrompt}\n\nLive Town Snapshot:\n${contextSummary}` },
    ];
    for (const h of historyList) {
      if (!h.text) continue;
      messages.push({
        role: h.role === 'mayor' ? 'assistant' : 'user',
        content: String(h.text).slice(0, 220),
      });
    }
    messages.push({ role: 'user', content: userMessage });

    try {
      const result = await callChatCompletionsWithKeyPool(
        baseUrl,
        apiKeys,
        {
          model: modelName,
          messages,
          temperature: 0.65,
          max_tokens: webResultsList.length > 0 ? 480 : 280,
          response_format: { type: 'json_object' },
        },
        true,
      );

      if ('errorText' in result && result.errorText) {
        res.status(result.status >= 400 ? result.status : 502).json({
          error: `AI provider error (${result.status}): ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ error: 'Mayor AI returned an empty response.' });
        return;
      }

      const parsed = extractJsonObject(content);
      const reply = String(parsed.reply ?? '').trim().slice(0, webResultsList.length > 0 ? 1100 : 320);
      const rawAction =
        parsed.action && typeof parsed.action === 'object'
          ? (parsed.action as Record<string, unknown>)
          : {};
      const rawType = String(rawAction.type ?? 'none').trim().toLowerCase();
      const allowedTypes = new Set([
        'build',
        'hire',
        'unhire',
        'decree',
        'create_town',
        'expand_biome',
        'build_road',
        'extend_rail',
        'build_inter_town_rail',
        'toggle_auto',
        'trigger_raid',
        'toggle_raids',
        'counter_raid',
      ]);
      const actionType = allowedTypes.has(rawType) ? rawType : 'none';
      const rawBiome = typeof rawAction.biome === 'string' ? rawAction.biome.trim().toLowerCase() : '';
      const validBiome = validBiomeSet.has(rawBiome) ? rawBiome : undefined;

      res.json({
        reply: reply || `Consider it done — ${townName} is already moving on your word.`,
        action: {
          type: actionType,
          target:
            typeof rawAction.target === 'string' ? rawAction.target.trim().slice(0, 80) : undefined,
          workerPrompt:
            typeof rawAction.workerPrompt === 'string'
              ? rawAction.workerPrompt.trim().slice(0, 180)
              : undefined,
          decree:
            typeof rawAction.decree === 'string'
              ? rawAction.decree.trim().slice(0, 220)
              : undefined,
          townName:
            typeof rawAction.townName === 'string'
              ? rawAction.townName.trim().slice(0, 60)
              : undefined,
          biome: validBiome,
          roadTarget:
            typeof rawAction.roadTarget === 'string'
              ? rawAction.roadTarget.trim().slice(0, 80)
              : undefined,
          autoEnabled:
            typeof rawAction.autoEnabled === 'boolean' ? rawAction.autoEnabled : undefined,
          raidsEnabled:
            typeof rawAction.raidsEnabled === 'boolean' ? rawAction.raidsEnabled : undefined,
        },
        modelUsed: result.modelUsed || modelName,
        keyAttemptIndex: result.keyAttemptIndex,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to reach Mayor AI.',
      });
    }
  });

  app.post('/api/town/raider-tactic', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        error: 'No AI API key configured for Supreme Warlord Malakor.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      townName?: unknown;
      waveNumber?: unknown;
      campHp?: unknown;
      campMaxHp?: unknown;
      defenseCount?: unknown;
      hasHospital?: unknown;
      injuredCount?: unknown;
      population?: unknown;
      enemyGold?: unknown;
      enemyFood?: unknown;
      builtStructures?: unknown;
      railBuilt?: unknown;
      helicoptersReady?: unknown;
      jetsReady?: unknown;
      townGold?: unknown;
      townFood?: unknown;
    };

    const townName = String(body.townName ?? 'Alderbrook').trim().slice(0, 48) || 'Alderbrook';
    const waveNumber = Math.max(1, Math.min(99, Number(body.waveNumber ?? 1) || 1));
    const campHp = Math.max(0, Math.min(500, Number(body.campHp ?? 120) || 120));
    const campMaxHp = Math.max(1, Math.min(500, Number(body.campMaxHp ?? 120) || 120));
    const defenseCount = Math.max(0, Math.min(20, Number(body.defenseCount ?? 0) || 0));
    const hasHospital = Boolean(body.hasHospital);
    const injuredCount = Math.max(0, Math.min(15, Number(body.injuredCount ?? 0) || 0));
    const population = Math.max(1, Math.min(15, Number(body.population ?? 5) || 5));
    const enemyGold = Math.max(0, Math.min(99999, Number(body.enemyGold ?? 240) || 0));
    const enemyFood = Math.max(0, Math.min(99999, Number(body.enemyFood ?? 120) || 0));
    const builtStructures = Array.isArray(body.builtStructures)
      ? body.builtStructures.map((s) => String(s).slice(0, 32)).slice(0, 8)
      : ['citadel'];
    const railBuilt = Boolean(body.railBuilt);
    const helicoptersReady = Math.max(0, Math.min(4, Number(body.helicoptersReady ?? 0) || 0));
    const jetsReady = Math.max(0, Math.min(4, Number(body.jetsReady ?? 0) || 0));
    const townGold = Math.max(0, Math.min(99999, Number(body.townGold ?? 300) || 0));
    const townFood = Math.max(0, Math.min(99999, Number(body.townFood ?? 40) || 0));

    const systemPrompt = [
      'You are Supreme Warlord Malakor, the 100% autonomous cartoon commander of Ironhold Bastion, a rival low-poly fortress city on the southwest frontier.',
      'You take NO orders from the player. You command Chief Siege Engineer Vex (builds factories, loot depots, turrets, and armored ore railway) and Air Marshal Kael (builds & launches attack helicopters and fighter jets).',
      'Keep everything stylized, dramatic, cartoon, and non-graphic (spark cannons, rocket fireworks, gold/food supply looting — never lethal or grim).',
      'Choose ONE combat tactic from: "shell_perimeter", "target_workers", "siege_plaza", "air_strike" (use when helicopters or jets are ready!), "loot_raid" (raid rival Gold & Food stockpiles), or "regroup".',
      'Choose ONE autonomous Ironhold city expansion action from: "build_foundry", "build_depot", "build_rail", "build_airfield", "build_turret_north", "build_turret_south", "upgrade_citadel", "build_helicopter", "build_jet", or "none" (pick something NOT yet maxed if you have enough Gold).',
      'Return ONLY raw JSON: {"tactic":"shell_perimeter|target_workers|siege_plaza|air_strike|loot_raid|regroup","cityAction":"build_foundry|build_depot|build_rail|build_airfield|build_turret_north|build_turret_south|upgrade_citadel|build_helicopter|build_jet|none","commanderOrder":"<= 14 words battle/expansion decree","vexOrder":"<= 10 words order to Engineer Vex","kaelOrder":"<= 10 words order to Air Marshal Kael"}',
    ].join('\n');

    const userPrompt = [
      `Target Town: ${townName} (Gold: ${townGold}g, Food: ${townFood}, Defenses: ${defenseCount}, Hospital: ${hasHospital ? 'Yes' : 'No'}, Villagers: ${population}, Injured: ${injuredCount})`,
      `Ironhold Bastion Status: Wave #${waveNumber}, Bastion Frontline HP ${campHp}/${campMaxHp}, Enemy Gold ${enemyGold}g, Enemy Food ${enemyFood}`,
      `Built in Ironhold: [${builtStructures.join(', ')}] | Ore Railway: ${railBuilt ? 'Built' : 'Not built'} | Air Force: ${helicoptersReady}/2 Helis, ${jetsReady}/2 Jets`,
      'Decide your next autonomous raid tactic and city expansion move!',
    ].join('\n');

    try {
      const result = await callChatCompletionsWithKeyPool(
        baseUrl,
        apiKeys,
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.75,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        },
        true,
      );

      if ('errorText' in result && result.errorText) {
        res.status(result.status >= 400 ? result.status : 502).json({
          error: `Warlord AI error (${result.status}): ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content || '';
      const parsed = extractJsonObject(content);
      const validTactics = new Set([
        'shell_perimeter',
        'target_workers',
        'siege_plaza',
        'air_strike',
        'loot_raid',
        'regroup',
      ]);
      const rawTactic = String(parsed.tactic ?? 'loot_raid').trim().toLowerCase();
      const tactic = validTactics.has(rawTactic) ? rawTactic : 'loot_raid';

      const validCityActions = new Set([
        'build_foundry',
        'build_depot',
        'build_rail',
        'build_airfield',
        'build_turret_north',
        'build_turret_south',
        'upgrade_citadel',
        'build_helicopter',
        'build_jet',
        'none',
      ]);
      const rawCityAction = String(parsed.cityAction ?? 'none').trim().toLowerCase();
      const cityAction = validCityActions.has(rawCityAction) ? rawCityAction : 'none';

      const commanderOrder =
        String(parsed.commanderOrder ?? '').trim().slice(0, 120) ||
        'Expand Ironhold Bastion and plunder their gold vaults!';
      const vexOrder =
        String(parsed.vexOrder ?? '').trim().slice(0, 90) ||
        'Keep the foundry furnaces hot and ore rails running.';
      const kaelOrder =
        String(parsed.kaelOrder ?? '').trim().slice(0, 90) ||
        'Spin up the rotors and patrol the frontier ridge.';

      res.json({
        tactic,
        cityAction,
        commanderOrder,
        vexOrder,
        kaelOrder,
        modelUsed: result.modelUsed || modelName,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to reach Warlord AI.',
      });
    }
  });

  // ============================================================================
  // Web Search Proxy (Tavily, Exa, Serper, Brave, Custom) with Multi-Key Fallback
  // ============================================================================
  app.post('/api/search/proxy', async (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      preset?: unknown;
      providerName?: unknown;
      endpointUrl?: unknown;
      apiKeys?: unknown;
      query?: unknown;
      maxResults?: unknown;
    };

    const query = String(body.query ?? '').trim().slice(0, 260);
    if (!query) {
      res.status(400).json({ ok: false, error: 'Search query cannot be empty.' });
      return;
    }

    const preset = String(body.preset ?? 'custom').trim().toLowerCase();
    const providerName = String(body.providerName ?? preset).trim().slice(0, 48) || 'Web Search';
    const maxResults = Math.max(1, Math.min(8, Number(body.maxResults) || 5));
    const apiKeys = Array.isArray(body.apiKeys)
      ? body.apiKeys.map((k) => String(k ?? '').trim()).filter(Boolean).slice(0, 12)
      : [];

    if (apiKeys.length === 0) {
      res.status(400).json({ ok: false, error: `No API keys provided for ${providerName}.` });
      return;
    }

    const defaultEndpoints: Record<string, string> = {
      tavily: 'https://api.tavily.com/search',
      exa: 'https://api.exa.ai/search',
      serper: 'https://google.serper.dev/search',
      brave: 'https://api.search.brave.com/res/v1/web/search',
    };
    const rawEndpoint = String(body.endpointUrl ?? '').trim() || defaultEndpoints[preset] || '';
    if (!rawEndpoint) {
      res.status(400).json({ ok: false, error: 'Search endpoint URL is required.' });
      return;
    }

    let safeUrl: URL;
    try {
      safeUrl = await validatePublicWebhookUrl(rawEndpoint);
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid search endpoint URL.',
      });
      return;
    }

    const extractHost = (rawUrl: string): string => {
      try {
        return new URL(rawUrl).hostname.replace(/^www\./, '');
      } catch {
        return 'web';
      }
    };

    const normalizeItems = (data: unknown): Array<{ title: string; url: string; snippet: string; source: string }> => {
      const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      let items: unknown[] = [];
      if (preset === 'tavily' || preset === 'exa') {
        items = Array.isArray(obj.results) ? obj.results : [];
      } else if (preset === 'serper') {
        items = Array.isArray(obj.organic) ? obj.organic : Array.isArray(obj.news) ? obj.news : [];
      } else if (preset === 'brave') {
        const web = obj.web as { results?: unknown[] } | undefined;
        items = Array.isArray(web?.results) ? web.results : Array.isArray(obj.results) ? obj.results : [];
      } else {
        items = Array.isArray(obj.results)
          ? obj.results
          : Array.isArray(obj.organic)
            ? obj.organic
            : Array.isArray(obj.items)
              ? obj.items
              : Array.isArray(obj.data)
                ? obj.data
                : [];
      }

      const normalized: Array<{ title: string; url: string; snippet: string; source: string }> = [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const url = String(rec.url ?? rec.link ?? '').trim();
        const title = String(rec.title ?? rec.name ?? url).trim().slice(0, 140);
        const rawSnippet =
          rec.content ??
          rec.snippet ??
          rec.description ??
          rec.text ??
          (Array.isArray(rec.highlights) ? rec.highlights[0] : '') ??
          '';
        const snippet = String(rawSnippet).replace(/\s+/g, ' ').trim().slice(0, 220);
        if (!title && !url) continue;
        normalized.push({
          title: title || 'Web Result',
          url: url || '#',
          snippet: snippet || title,
          source: extractHost(url),
        });
        if (normalized.length >= maxResults) break;
      }
      return normalized;
    };

    let lastStatus = 502;
    let lastError = `Search request to ${providerName} failed.`;

    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        let upstream: globalThis.Response;
        if (preset === 'tavily') {
          upstream = await fetch(safeUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: key,
              query,
              max_results: maxResults,
              search_depth: 'basic',
            }),
            signal: controller.signal,
          });
        } else if (preset === 'exa') {
          upstream = await fetch(safeUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key,
            },
            body: JSON.stringify({
              query,
              numResults: maxResults,
              contents: { highlights: { numSentences: 2 } },
            }),
            signal: controller.signal,
          });
        } else if (preset === 'serper') {
          upstream = await fetch(safeUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': key,
            },
            body: JSON.stringify({ q: query, num: maxResults }),
            signal: controller.signal,
          });
        } else if (preset === 'brave') {
          const braveUrl = new URL(safeUrl.toString());
          braveUrl.searchParams.set('q', query);
          braveUrl.searchParams.set('count', String(maxResults));
          upstream = await fetch(braveUrl.toString(), {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-Subscription-Token': key,
            },
            signal: controller.signal,
          });
        } else {
          upstream = await fetch(safeUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
              'x-api-key': key,
            },
            body: JSON.stringify({ query, q: query, max_results: maxResults, num: maxResults }),
            signal: controller.signal,
          });
        }

        if (upstream.ok) {
          const data = (await upstream.json()) as unknown;
          const results = normalizeItems(data);
          res.json({
            ok: true,
            results,
            providerName,
            keyAttemptIndex: i,
            totalKeys: apiKeys.length,
          });
          return;
        }

        lastStatus = upstream.status;
        const errText = await upstream.text().catch(() => '');
        lastError = `${providerName} HTTP ${upstream.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`;
        if (![401, 402, 403, 429, 500, 502, 503, 504].includes(upstream.status)) {
          break;
        }
      } catch (err) {
        lastStatus = 502;
        lastError = err instanceof Error ? err.message : 'Upstream search request timed out.';
      } finally {
        clearTimeout(timeout);
      }
    }

    res.status(lastStatus >= 400 ? lastStatus : 502).json({
      ok: false,
      error: lastError,
    });
  });

  app.post('/api/town/turn', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        error: 'Missing AI API key. Open AI Providers settings (gear icon) to enter your API key.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as TurnRequestBody;
    if (!body || !Array.isArray(body.agents) || !body.activeAgentId) {
      res.status(400).json({ error: 'Invalid turn payload.' });
      return;
    }

    const activeAgent = body.agents.find((a) => a.id === body.activeAgentId);
    if (!activeAgent) {
      res.status(404).json({ error: 'Active agent not found.' });
      return;
    }

    const structures = Array.isArray(body.structures) ? body.structures : [];
    const structureMap = new Map<PlotId, StructureSnapshot>();
    for (const s of structures) {
      if (VALID_PLOTS.has(s.plotId) && VALID_STRUCTURES.has(s.structureType)) {
        structureMap.set(s.plotId, s);
      }
    }

    const activeWeather = normalizeWeatherMode(body.weather);
    const completedStructures = Array.from(structureMap.values()).filter((s) => s.status === 'complete');
    const hasWatchtowerOrTier2 = completedStructures.some(
      (s) => s.structureType === 'watchtower' || s.tier >= 2,
    );
    const hasBakery = completedStructures.some((s) => s.structureType === 'bakery');
    const hasGreenhouse = completedStructures.some((s) => s.structureType === 'greenhouse');
    const hasGranary = completedStructures.some((s) => s.structureType === 'granary');
    const hasWindmill = completedStructures.some((s) => s.structureType === 'windmill');
    const hasPavilion = completedStructures.some((s) => s.structureType === 'pavilion');

    const shelterPlots = completedStructures
      .filter(
        (s) =>
          s.structureType === 'pavilion' ||
          s.structureType === 'bakery' ||
          s.structureType === 'library',
      )
      .map((s) => `${s.plotId} (${s.structureType})`);

    const staffedPlots = new Set(
      body.agents
        .map((a) => a.assignedPlotId)
        .filter((p): p is PlotId => Boolean(p)),
    );
    const unstaffedStructures = Array.from(structureMap.values()).filter(
      (s) => !staffedPlots.has(s.plotId),
    );

    const prosperity = Number(body.metrics?.prosperity ?? 72);
    const orderLevel = Number(body.metrics?.orderLevel ?? 78);
    const morale = Number(body.metrics?.morale ?? 75);
    const avgPulse = Math.round((prosperity + orderLevel + morale) / 3);
    const allowAutonomousHire =
      activeAgent.id === 'mayor_sterling' &&
      avgPulse >= 74 &&
      body.agents.length < MAX_TOWN_AGENTS &&
      (unstaffedStructures.length > 0 || (Number(body.turnCount ?? 0) >= 4 && body.agents.length < 7));

    const seasonRules =
      activeWeather === 'rain'
        ? [
            'Current Season/Weather: RAIN.',
            `- Effects: Glass Greenhouse (${hasGreenhouse ? 'BUILT' : 'not built'}) & Timber Granary (${hasGranary ? 'BUILT' : 'not built'}) receive +25% Town Pulse growth. Artisan Bakery (${hasBakery ? 'BUILT & steaming' : 'not built'}) warms morale.`,
            '- Manager Priorities (Sterling, Vance, Lyra): Prioritize proposing or upgrading greenhouse, granary, pavilion (shelter), or watchtower for storm readiness.',
            shelterPlots.length > 0
              ? `- Villager Shelter: During rain, you may occasionally take brief shelter by setting "visit_plot_id" to one of [${shelterPlots.join(', ')}] (when build_order.action is "none"), or gather at town_hall/workshop.`
              : '- Villager Shelter: No completed Pavilion/Bakery/Archive yet—villagers may shelter under Town Hall or Workshop overhangs during heavy downpours.',
          ].join('\n')
        : activeWeather === 'winter'
          ? [
              'Current Season/Weather: WINTER (Snowstorms).',
              `- Effects: ${
                hasWatchtowerOrTier2
                  ? 'Outdoor construction is protected by a Guard Watchtower or Tier 2+ structure.'
                  : 'Outdoor construction speed for Rank 3 workers is slowed by 20% until a Guard Watchtower or Tier 2+ structure is built.'
              } Artisan Bakery warmth demand is high (${hasBakery ? 'Bakery BUILT — warming town' : 'NO Bakery yet — morale drains in the cold'}).`,
              '- Manager Priorities (Sterling, Vance, Lyra): Strongly prioritize proposing/upgrading watchtower, bakery, greenhouse, or upgrading an existing building to Tier 2 to shield workers and warm Alderbrook.',
              shelterPlots.length > 0
                ? `- Villager Shelter: During snowstorms, you may occasionally step inside a warm building by setting "visit_plot_id" to one of [${shelterPlots.join(', ')}] (when build_order.action is "none"), or shelter at town_hall.`
                : '- Villager Shelter: No completed Bakery/Pavilion/Archive yet—shelter near Town Hall hearth or Workshop forge when not building.',
            ].join('\n')
          : [
              'Current Season/Weather: SUMMER (Sunny Breeze).',
              `- Effects: Grain Windmill (${hasWindmill ? 'BUILT — peak efficiency' : 'not built'}) boosts harvest prosperity; villagers socialize briskly around Garden Pavilion (${hasPavilion ? 'BUILT' : 'not built'}) and Park fountain.`,
              '- Manager Priorities (Sterling, Vance, Lyra): Prioritize windmill or pavilion for summer prosperity, or propose greenhouse/bakery ahead of cooler seasons.',
              hasPavilion
                ? `- Plaza Socializing: Villagers may visit [${completedStructures.filter((s) => s.structureType === 'pavilion').map((s) => s.plotId).join(', ')}] via "visit_plot_id" or socialize at "park".`
                : '- Plaza Socializing: Villagers enjoy lively movement around "park" fountain and Town Square.',
            ].join('\n');

    const plotsSummaryText = ALL_PLOTS.map((p) => {
      const s = structureMap.get(p);
      if (!s) return `- ${p}: EMPTY (ready for new blueprint)`;
      const staffNote = staffedPlots.has(p) ? ' · staffed' : ' · needs specialist staff';
      if (s.status === 'building') {
        return `- ${p}: UNDER CONSTRUCTION (${s.structureType}, ${s.progress}% built${staffNote} — needs "construct")`;
      }
      return `- ${p}: COMPLETE (${s.structureType}, Tier ${s.tier}/3${staffNote}${s.tier < 3 ? ' — can "upgrade"' : ''})`;
    }).join('\n');

    const recentLogsText = (body.recentLogs || [])
      .slice(0, 8)
      .reverse()
      .map(
        (l) =>
          `[Turn ${l.turnNumber}] ${l.agentName} @ ${l.location}${l.targetAgent ? ` -> ${l.targetAgent}` : ''}: "${l.dialogue}"`,
      )
      .join('\n');

    const townRosterText = body.agents
      .map(
        (a) =>
          `- ${a.name} (Rank ${a.rank}, ${a.role}) | At: ${a.activePlotId || a.location} | Task: ${a.currentTask}`,
      )
      .join('\n');

    const validTargetNames = body.agents
      .filter((a) => a.name !== activeAgent.name)
      .map((a) => `"${a.name}"`)
      .join(', ');

    const hireSchemaHint = allowAutonomousHire
      ? [
          `Autonomous Mayor Hiring (Town Pulse avg ${avgPulse}/100, Villagers ${body.agents.length}/${MAX_TOWN_AGENTS}):`,
          `- Buildings needing dedicated specialist staff: ${
            unstaffedStructures.length > 0
              ? unstaffedStructures.map((s) => `${s.plotId} (${s.structureType})`).join(', ')
              : 'General town expansion'
          }.`,
          '- You MAY set "hire_worker" to recruit ONE new Rank 3 specialist when Town Pulse is high and buildings/expansion need staff (or set "hire_worker": null most turns).',
          '- "hire_worker" shape when hiring: { "name": "Unique Name", "role": "Specialist Role", "department": "Civic Works | Security & Supply", "supervisor": "Architect Lyra | Commander Vance", "personality": "Short trait", "location": "town_hall | workshop | market | park", "assigned_plot_id": "plot_id or null", "hat_style": "straw | cap | helmet | hood | beret", "outfit_colors": { "coat": "#rrggbb", "pants": "#rrggbb", "hat": "#rrggbb", "trim": "#rrggbb" }, "dialogue": "Greeting <= 15 words", "current_task": "Starting job" }',
        ].join('\n')
      : '';

    const hiredSpecialistsForMayor =
      activeAgent.id === 'mayor_sterling'
        ? body.agents.filter((a) => !CORE_COUNCIL_IDS.has(a.id))
        : [];
    const allowAutonomousUnhire = hiredSpecialistsForMayor.length > 0;
    const unhireSchemaHint = allowAutonomousUnhire
      ? [
          `Autonomous Mayor Staffing Authority (${hiredSpecialistsForMayor.length} hired specialists):`,
          `- Hired specialists you MAY dismiss/unhire if you choose: ${hiredSpecialistsForMayor
            .map((a) => `"${a.id}" (${a.name}, ${a.role})`)
            .join(', ')}.`,
          '- You MAY optionally set "unhire_worker": { "agent_id": "hire_...", "reason": "short reason" } if you want to unhire someone (for example to trim upkeep, free a slot for a higher-priority specialist, honor a player whisper/decree, or dismiss a redundant role). Leave "unhire_worker": null on normal turns when everyone is needed.',
          '- Core council members (Mayor Sterling, Commander Vance, Architect Lyra, Worker Kai, Worker Pip) can NEVER be unhired.',
        ].join('\n')
      : '';

    const otherTownNames = Array.isArray(body.otherTownNames)
      ? body.otherTownNames.map((t) => String(t).trim().slice(0, 48)).filter(Boolean).slice(0, 8)
      : [];
    const interTownRailBuilt = Boolean(body.interTownRailBuilt);
    const allowAutonomousInterTownRail =
      activeAgent.id === 'mayor_sterling' && !interTownRailBuilt && otherTownNames.length > 0;
    const interTownRailSchemaHint = allowAutonomousInterTownRail
      ? [
          `Autonomous Inter-Town Railway Authority (Neighboring saved towns: ${otherTownNames.join(', ')}):`,
          `- You MAY optionally set "build_inter_town_rail": { "target_town": "${otherTownNames[0]}", "reason": "short reason" } if you want to construct an Inter-Town Express Railway Track linking directly to another saved town for trade & travel. Leave "build_inter_town_rail": null on turns when local priorities come first.`,
        ].join('\n')
      : '';

    const systemPrompt = [
      `You control ${activeAgent.name} (${activeAgent.role}) in Alderbrook, a self-building 3D AI town simulation.`,
      getHierarchyRules(activeAgent),
      'Valid target_location values: "town_hall", "workshop", "market", "park".',
      `Valid target_agent values: ${validTargetNames || 'null'}, or null.`,
      `Valid plot_id values: ${ALL_PLOTS.map((p) => `"${p}"`).join(', ')}, or null.`,
      `Valid structure_type values: ${ALL_STRUCTURES.map((s) => `"${s}"`).join(', ')}, or null.`,
      'Self-building & Weather-Smart rules:',
      '- Use build_order.action = "propose" (Rank 1 or Rank 2 only) to stake a weather-smart structure_type on an EMPTY plot_id (including hospital, defense_wall, or triple_gun_tower when fortifying).',
      '- Use build_order.action = "construct" (especially Rank 3 Workers or helping Managers) when any plot is UNDER CONSTRUCTION.',
      '- Use build_order.action = "upgrade" (Rank 1 or Rank 2) on a COMPLETE plot with Tier < 3.',
      '- Use build_order.action = "none" if simply coordinating, patrolling, tending your workplace, or conversing.',
      '- Optional "visit_plot_id": Set to your assigned plot or a completed shelter plot (pavilion, bakery, library) when tending or taking brief shelter (only when build_order.action is "none"), otherwise null.',
      hireSchemaHint,
      unhireSchemaHint,
      interTownRailSchemaHint,
      'Return ONLY a raw JSON object with this exact schema:',
      '{',
      '  "thought": "Internal reasoning based on rank, weather/season, recent messages, and building plots",',
      '  "target_location": "town_hall | workshop | market | park",',
      '  "target_agent": "Name of agent to talk to, or null",',
      '  "dialogue": "Short spoken message (max 15 words)",',
      '  "new_task": "Current action status",',
      '  "metrics_delta": { "prosperity": -2..3, "order": -2..3, "morale": -2..3 },',
      '  "build_order": { "action": "none | propose | construct | upgrade", "plot_id": "plot_nw | ... | null", "structure_type": "bakery | watchtower | greenhouse | windmill | library | granary | pavilion | clock_tower | hospital | defense_wall | triple_gun_tower | null" },',
      '  "visit_plot_id": "plot_nw | ... | null"' +
        (allowAutonomousHire ? ',\n  "hire_worker": null' : '') +
        (allowAutonomousUnhire ? ',\n  "unhire_worker": null' : '') +
        (allowAutonomousInterTownRail ? ',\n  "build_inter_town_rail": null' : ''),
      '}',
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      `Turn: ${Number(body.turnCount ?? 0) + 1} · Active Villagers: ${body.agents.length}/${MAX_TOWN_AGENTS}`,
      `Town Pulse: Prosperity ${prosperity}, Order ${orderLevel}, Morale ${morale} (Avg ${avgPulse})`,
      `Atmosphere: Time is ${body.timeOfDay || 'day'}, Weather/Season is ${activeWeather.toUpperCase()}.`,
      seasonRules,
      `Active Civic Decree: ${body.activeDecree?.trim() ? body.activeDecree.trim() : 'None — grow Alderbrook organically with weather-smart buildings.'}`,
      activeAgent.userNote?.trim()
        ? `Direct Whisper to ${activeAgent.name}: "${activeAgent.userNote.trim()}"`
        : '',
      typeof body.socialBonds === 'string' && body.socialBonds.trim()
        ? `Your Closest Town Friendships & Bonds: ${body.socialBonds.trim().slice(0, 220)}`
        : '',
      '',
      'Town Plots & Self-Building Status:',
      plotsSummaryText,
      '',
      'Current Town Roster:',
      townRosterText,
      '',
      'Recent Town Communications:',
      recentLogsText || 'None yet.',
      '',
      `It is now ${activeAgent.name}'s turn. Stay true to your role${activeAgent.personality ? ` and personality (${activeAgent.personality})` : ''}, factor in the ${activeWeather} season, choose where to go, update your task, and speak (<= 15 words).`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    const payloadWithFormat: Record<string, unknown> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: allowAutonomousHire ? 650 : 450,
      response_format: { type: 'json_object' },
    };

    try {
      const result = await callChatCompletionsWithKeyPool(
        baseUrl,
        apiKeys,
        payloadWithFormat,
        true,
      );

      if ('errorText' in result && result.errorText) {
        res.status(result.status >= 400 ? result.status : 502).json({
          error: `AI provider error (${result.status}): ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ error: 'AI provider returned an empty response.' });
        return;
      }

      const parsed = extractJsonObject(content);
      const sanitized = sanitizeTurnResult(
        parsed,
        activeAgent,
        body.agents,
        structures,
        activeWeather,
        allowAutonomousHire,
        otherTownNames,
        interTownRailBuilt,
      );

      res.json({
        turnResult: sanitized,
        modelUsed: result.modelUsed || modelName,
        keyAttemptIndex: result.keyAttemptIndex,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to process AI turn.',
      });
    }
  });

  // ============================================================================
  // The Signal Relay — External CLI Agent REST API (OpenCode, agy, Freepuff, Hermes)
  // ============================================================================
  const VALID_RELAY_ACTIONS = new Set([
    'god_decree',
    'villager_speak',
    'assign_task',
    'hire_worker',
    'set_weather',
    'set_theme',
    'trigger_train',
    'build_structure',
    'build_plot',
  ]);

  interface QueuedRelayCommand {
    id: string;
    type: string;
    value?: string;
    payload?: Record<string, unknown> | string;
    source: string;
    status: 'pending';
    createdAtMs: number;
  }

  interface RelayAgentActivity {
    agentName: string;
    lastAction: string;
    summary: string;
    lastSeenMs: number;
  }

  interface TownRelayBucket {
    townId: string;
    secret: string;
    stateSnapshot: Record<string, unknown> | null;
    pendingCommands: QueuedRelayCommand[];
    recentAgents: RelayAgentActivity[];
    updatedAtMs: number;
  }

  const MAX_RELAY_TOWNS = 25;
  const MAX_PENDING_PER_TOWN = 30;
  const townRelayStore = new Map<string, TownRelayBucket>();

  let cachedFirebaseConfig: { projectId: string; firestoreDatabaseId: string } | null = null;
  function getFirebaseRestConfig(): { projectId: string; firestoreDatabaseId: string } | null {
    if (cachedFirebaseConfig) return cachedFirebaseConfig;
    try {
      const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
      if (!fs.existsSync(cfgPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      if (parsed.projectId) {
        cachedFirebaseConfig = {
          projectId: parsed.projectId,
          firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
        };
        return cachedFirebaseConfig;
      }
    } catch {
      // Ignore missing or unreadable config
    }
    return null;
  }

  function sanitizeTownId(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  function getOrCreateRelayBucket(townId: string): TownRelayBucket {
    const existing = townRelayStore.get(townId);
    if (existing) return existing;
    if (townRelayStore.size >= MAX_RELAY_TOWNS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of townRelayStore.entries()) {
        if (v.updatedAtMs < oldestTime) {
          oldestTime = v.updatedAtMs;
          oldestKey = k;
        }
      }
      if (oldestKey) townRelayStore.delete(oldestKey);
    }
    const created: TownRelayBucket = {
      townId,
      secret: '',
      stateSnapshot: null,
      pendingCommands: [],
      recentAgents: [],
      updatedAtMs: Date.now(),
    };
    townRelayStore.set(townId, created);
    return created;
  }

  function verifyRelaySecret(req: Request, bucket: TownRelayBucket): boolean {
    const expected = (bucket.secret || process.env.TOWN_AGENT_SECRET || '').trim();
    if (!expected) return true;
    const provided = String(req.header('x-town-secret') ?? '').trim();
    if (!provided) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function recordRelayActivity(
    bucket: TownRelayBucket,
    agentName: string,
    action: string,
    summary: string,
  ): void {
    const cleanAgent = agentName.trim().slice(0, 40) || 'cli_agent';
    const nextEntry: RelayAgentActivity = {
      agentName: cleanAgent,
      lastAction: action,
      summary: summary.slice(0, 140),
      lastSeenMs: Date.now(),
    };
    bucket.recentAgents = [
      nextEntry,
      ...bucket.recentAgents.filter((a) => a.agentName.toLowerCase() !== cleanAgent.toLowerCase()),
    ].slice(0, 15);
  }

  // Browser -> Server compact snapshot sync (keeps GET /api/town/:townId/state fast & live)
  app.post('/api/town/:townId/sync', (req: Request, res: Response) => {
    const townId = sanitizeTownId(req.params.townId);
    if (!townId) {
      res.status(400).json({ error: 'Invalid townId.' });
      return;
    }
    const body = (req.body ?? {}) as {
      secret?: unknown;
      state?: Record<string, unknown>;
    };
    const bucket = getOrCreateRelayBucket(townId);
    if (typeof body.secret === 'string') {
      bucket.secret = body.secret.trim().slice(0, 128);
    }
    if (body.state && typeof body.state === 'object') {
      bucket.stateSnapshot = body.state;
    }
    bucket.updatedAtMs = Date.now();
    res.json({
      ok: true,
      townId,
      pendingCount: bucket.pendingCommands.length,
      recentAgents: bucket.recentAgents,
    });
  });

  // Browser poll -> drains queued CLI commands for immediate live execution
  app.get('/api/town/:townId/commands', (req: Request, res: Response) => {
    const townId = sanitizeTownId(req.params.townId);
    if (!townId) {
      res.status(400).json({ error: 'Invalid townId.' });
      return;
    }
    const bucket = townRelayStore.get(townId);
    if (!bucket) {
      res.json({ ok: true, commands: [], recentAgents: [] });
      return;
    }
    if (!verifyRelaySecret(req, bucket)) {
      res.status(401).json({ error: 'Invalid or missing x-town-secret header.' });
      return;
    }
    const commands = bucket.pendingCommands.splice(0, bucket.pendingCommands.length);
    res.json({
      ok: true,
      commands,
      recentAgents: bucket.recentAgents,
    });
  });

  // External CLI Agent -> Read compact town snapshot
  app.get('/api/town/:townId/state', (req: Request, res: Response) => {
    const townId = sanitizeTownId(req.params.townId);
    if (!townId) {
      res.status(400).json({ error: 'Invalid townId. Use letters, numbers, dashes, or underscores.' });
      return;
    }
    const bucket = getOrCreateRelayBucket(townId);
    if (!verifyRelaySecret(req, bucket)) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing x-town-secret header.' });
      return;
    }

    if (!bucket.stateSnapshot) {
      res.json({
        ok: true,
        synced: false,
        townId,
        weather: 'summer',
        season: 'Summer Meadow',
        theme: 'meadow',
        timeOfDay: 'day',
        turnCount: 0,
        activeDecree: '',
        pulse: { prosperity: 68, order: 74, morale: 72 },
        resources: { population: 5, maxPopulation: MAX_TOWN_AGENTS, completedBuildings: 0, totalPlots: 8 },
        buildings: [],
        villagers: [],
        lastLogs: [],
        recentAgents: bucket.recentAgents,
        note: 'Open Alderbrook AI Town in the browser to stream live villager state into this relay.',
      });
      return;
    }

    res.json({
      ok: true,
      synced: true,
      townId,
      ...bucket.stateSnapshot,
      recentAgents: bucket.recentAgents,
      updatedAt: new Date(bucket.updatedAtMs).toISOString(),
    });
  });

  // External CLI Agent -> Post town action (queues for live town + optionally writes Firestore REST if Bearer token provided)
  app.post('/api/town/:townId/act', async (req: Request, res: Response) => {
    const townId = sanitizeTownId(req.params.townId);
    if (!townId) {
      res.status(400).json({ error: 'Invalid townId.' });
      return;
    }
    const bucket = getOrCreateRelayBucket(townId);
    if (!verifyRelaySecret(req, bucket)) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing x-town-secret header.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawAction = String(body.action ?? body.type ?? '').trim().toLowerCase();
    if (!VALID_RELAY_ACTIONS.has(rawAction)) {
      res.status(400).json({
        error: `Unsupported action "${rawAction || 'empty'}". Supported: ${Array.from(VALID_RELAY_ACTIONS).join(', ')}.`,
      });
      return;
    }

    const agentName = String(body.agentName ?? body.source ?? 'cli_agent').trim().slice(0, 40) || 'cli_agent';
    const commandId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let primaryValue = '';
    let payloadObj: Record<string, unknown> | undefined;
    let summary = rawAction;

    if (rawAction === 'god_decree') {
      primaryValue = String(body.decree ?? body.value ?? body.message ?? '').trim().slice(0, 220);
      if (!primaryValue) {
        res.status(400).json({ error: 'god_decree requires a non-empty "decree" or "value" field.' });
        return;
      }
      summary = primaryValue;
    } else if (rawAction === 'villager_speak') {
      const dialogue = String(body.dialogue ?? body.message ?? body.value ?? '').trim().slice(0, 220);
      if (!dialogue) {
        res.status(400).json({ error: 'villager_speak requires a non-empty "dialogue" field.' });
        return;
      }
      const villagerId = String(body.villagerId ?? body.agentId ?? body.villager ?? '').trim().slice(0, 60);
      const location = String(body.location ?? '').trim().slice(0, 32);
      const targetAgent = String(body.targetAgent ?? '').trim().slice(0, 60);
      primaryValue = dialogue;
      payloadObj = {
        villagerId: villagerId || undefined,
        dialogue,
        location: location || undefined,
        targetAgent: targetAgent || undefined,
        thought: typeof body.thought === 'string' ? body.thought.trim().slice(0, 240) : undefined,
      };
      summary = `${villagerId || 'villager'}: "${dialogue}"`;
    } else if (rawAction === 'assign_task') {
      const task = String(body.task ?? body.value ?? body.instruction ?? '').trim().slice(0, 220);
      if (!task) {
        res.status(400).json({ error: 'assign_task requires a non-empty "task" field.' });
        return;
      }
      const villagerId = String(body.villagerId ?? body.agentId ?? body.villager ?? '').trim().slice(0, 60);
      const location = String(body.location ?? '').trim().slice(0, 32);
      primaryValue = task;
      payloadObj = {
        villagerId: villagerId || undefined,
        task,
        location: location || undefined,
      };
      summary = `${villagerId || 'villager'} -> ${task}`;
    } else if (rawAction === 'hire_worker') {
      primaryValue = String(body.prompt ?? body.value ?? 'Hire a helpful town artisan').trim().slice(0, 200);
      summary = primaryValue;
    } else if (rawAction === 'set_weather') {
      primaryValue = String(body.weather ?? body.value ?? 'summer').trim().toLowerCase().slice(0, 24);
      summary = `Weather -> ${primaryValue}`;
    } else if (rawAction === 'set_theme') {
      primaryValue = String(body.theme ?? body.value ?? 'meadow').trim().toLowerCase().slice(0, 32);
      summary = `Theme -> ${primaryValue}`;
    } else if (rawAction === 'trigger_train') {
      primaryValue = String(body.value ?? 'Express train summoned').trim().slice(0, 120);
      summary = 'Summoned Express Train to station';
    } else {
      primaryValue = String(body.value ?? body.structure ?? body.plotId ?? '').trim().slice(0, 240);
      if (body.payload && typeof body.payload === 'object') {
        payloadObj = body.payload as Record<string, unknown>;
      }
      summary = `${rawAction} ${primaryValue}`.trim();
    }

    const queued: QueuedRelayCommand = {
      id: commandId,
      type: rawAction,
      value: primaryValue,
      payload: payloadObj,
      source: agentName,
      status: 'pending',
      createdAtMs: Date.now(),
    };

    bucket.pendingCommands.push(queued);
    if (bucket.pendingCommands.length > MAX_PENDING_PER_TOWN) {
      bucket.pendingCommands.splice(0, bucket.pendingCommands.length - MAX_PENDING_PER_TOWN);
    }
    bucket.updatedAtMs = Date.now();
    recordRelayActivity(bucket, agentName, rawAction, summary);

    // Optional Firestore REST forwarding when caller supplies a Firebase Auth ID token
    let firestoreForwarded = false;
    const authHeader = req.header('authorization') ?? '';
    if (authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice(7).trim();
      const fbCfg = getFirebaseRestConfig();
      if (idToken && fbCfg) {
        try {
          const fsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
            fbCfg.projectId,
          )}/databases/${encodeURIComponent(
            fbCfg.firestoreDatabaseId,
          )}/documents/towns/${encodeURIComponent(townId)}/remoteCommands?documentId=${encodeURIComponent(
            commandId,
          )}`;
          const payloadStr = payloadObj ? JSON.stringify(payloadObj).slice(0, 400) : '';
          const fsRes = await fetch(fsUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              fields: {
                ownerId: { stringValue: townId },
                type: { stringValue: rawAction },
                value: { stringValue: primaryValue.slice(0, 400) },
                ...(payloadStr ? { payload: { stringValue: payloadStr } } : {}),
                source: { stringValue: agentName.slice(0, 60) },
                status: { stringValue: 'pending' },
              },
            }),
          });
          firestoreForwarded = fsRes.ok;
        } catch {
          // Non-fatal: in-memory relay queue already accepted the command
        }
      }
    }

    res.json({
      ok: true,
      commandId,
      townId,
      action: rawAction,
      agentName,
      queued: true,
      firestoreForwarded,
      summary,
      message: `Signal accepted for ${rawAction} from ${agentName}.`,
    });
  });

  app.post('/api/town/villager-chat', async (req: Request, res: Response) => {
    const { baseUrl, modelName, apiKeys } = resolveProviderConfig(req);
    if (apiKeys.length === 0) {
      res.status(400).json({
        error: 'Missing AI API key.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      villager?: {
        name?: string;
        role?: string;
        department?: string;
        personality?: string;
        currentTask?: string;
        location?: string;
      };
      message?: string;
      history?: Array<{ role?: string; text?: string }>;
      townName?: string;
      weather?: string;
      timeOfDay?: string;
      friends?: string[];
      workplace?: string;
    };

    const userMsg = String(body.message ?? '').trim().slice(0, 400);
    if (!userMsg || !body.villager?.name) {
      res.status(400).json({ error: 'Villager details and message are required.' });
      return;
    }

    const vName = String(body.villager.name).slice(0, 60);
    const vRole = String(body.villager.role || 'Town Villager').slice(0, 60);
    const vDept = String(body.villager.department || 'Civic Guild').slice(0, 60);
    const vPers = String(body.villager.personality || 'Warm, dedicated, and observant.').slice(0, 180);
    const vTask = String(body.villager.currentTask || 'Helping around town').slice(0, 160);
    const townName = String(body.townName || 'Alderbrook').slice(0, 60);
    const friendsLine =
      Array.isArray(body.friends) && body.friends.length > 0
        ? body.friends.slice(0, 3).join(', ')
        : 'Mayor Sterling and town neighbors';
    const workplaceLine = body.workplace ? String(body.workplace).slice(0, 60) : String(body.villager.location || 'plaza');

    const systemPrompt = [
      `You are ${vName}, ${vRole} (${vDept}) living in the cozy 3D town of ${townName}.`,
      `Personality: ${vPers}`,
      `Current task: ${vTask}. Current workplace/spot: ${workplaceLine}.`,
      `Close friends in town: ${friendsLine}. Weather: ${body.weather || 'summer'}, Time: ${body.timeOfDay || 'day'}.`,
      `Reply directly to the town player in character in 1-2 warm, natural sentences (under 42 words). Mention your craft, friends, or current task naturally. Never break character or mention AI.`,
    ].join(' ');

    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (Array.isArray(body.history)) {
      for (const h of body.history.slice(-4)) {
        if (!h || typeof h.text !== 'string' || !h.text.trim()) continue;
        chatMessages.push({
          role: h.role === 'villager' ? 'assistant' : 'user',
          content: h.text.trim().slice(0, 220),
        });
      }
    }
    chatMessages.push({ role: 'user', content: userMsg });

    try {
      const result = await callChatCompletionsWithKeyPool(
        baseUrl,
        apiKeys,
        {
          model: modelName,
          messages: chatMessages,
          temperature: 0.78,
          max_tokens: 120,
        },
        false,
      );

      if ('errorText' in result && result.errorText) {
        res.status(result.status >= 400 ? result.status : 502).json({
          error: `Provider returned HTTP ${result.status}: ${result.errorText}`,
        });
        return;
      }

      const choices = result.data.choices as Array<{ message?: { content?: string } }> | undefined;
      const rawReply = choices?.[0]?.message?.content?.trim() || '';
      const cleanReply = rawReply.replace(/^["']|["']$/g, '').slice(0, 240);
      res.json({
        reply: cleanReply || `Good to see you in ${townName}! I'm right in the middle of ${vTask.toLowerCase()}.`,
        modelUsed: result.modelUsed || modelName,
        keyAttemptIndex: result.keyAttemptIndex,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to reach AI provider.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Alderbrook AI Town server listening on http://0.0.0.0:${port}`);
  });
}

void createServer();
