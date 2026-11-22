import {
  collection,
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
  ALL_PLOT_IDS,
  ALL_STRUCTURE_TYPES,
  CORE_AGENT_IDS,
  createInitialAgents,
  createInitialLogs,
  DEFAULT_TOWN_METRICS,
  MAX_TOWN_AGENTS,
  normalizeTownTheme,
  normalizeWeatherMode,
  type AgentId,
  type AgentRecord,
  type HatStyle,
  type LocationId,
  type PlotId,
  type RemoteCommandRecord,
  type RemoteCommandType,
  type StructureStatus,
  type StructureType,
  type TimeOfDay,
  type TownLogItem,
  type TownMetrics,
  type TownStructure,
  type TownTheme,
  type WeatherMode,
} from '../types/town.ts';

export interface LoadedTownState {
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

const VALID_PLOT_SET = new Set<string>(ALL_PLOT_IDS);
const VALID_STRUCTURE_SET = new Set<string>(ALL_STRUCTURE_TYPES);
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

export async function loadOrInitializeTown(uid: string): Promise<LoadedTownState> {
  const townPath = `towns/${uid}`;
  const townRef = doc(db, 'towns', uid);

  let townSnap;
  try {
    townSnap = await getDoc(townRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, townPath);
  }

  if (!townSnap.exists()) {
    const initialAgents = createInitialAgents();
    const initialLogs = createInitialLogs();
    const batch = writeBatch(db);

    batch.set(townRef, {
      ownerId: uid,
      turnCount: 0,
      activeAgentIndex: 0,
      activeDecree: '',
      prosperity: DEFAULT_TOWN_METRICS.prosperity,
      orderLevel: DEFAULT_TOWN_METRICS.orderLevel,
      morale: DEFAULT_TOWN_METRICS.morale,
      timeOfDay: 'day',
      weather: 'summer',
      theme: 'meadow',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const agent of initialAgents) {
      const agentRef = doc(db, 'towns', uid, 'agents', agent.id);
      batch.set(agentRef, buildAgentDocPayload(uid, agent));
    }

    const seedLog = initialLogs[0];
    const logRef = doc(db, 'towns', uid, 'logs', seedLog.id);
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

    return {
      turnCount: 0,
      activeAgentIndex: 0,
      activeDecree: '',
      metrics: { ...DEFAULT_TOWN_METRICS },
      timeOfDay: 'day',
      weather: 'summer',
      theme: 'meadow',
      agents: initialAgents,
      structures: [],
      logs: initialLogs,
    };
  }

  const townData = townSnap.data();
  const agentsPath = `towns/${uid}/agents`;
  const structuresPath = `towns/${uid}/structures`;
  const logsPath = `towns/${uid}/logs`;

  let agentsSnap;
  try {
    agentsSnap = await getDocs(collection(db, 'towns', uid, 'agents'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, agentsPath);
  }

  let structuresSnap;
  try {
    structuresSnap = await getDocs(collection(db, 'towns', uid, 'structures'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, structuresPath);
  }

  let logsSnap;
  try {
    logsSnap = await getDocs(
      query(collection(db, 'towns', uid, 'logs'), orderBy('turnNumber', 'desc'), limit(40)),
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
        thought: typeof d.thought === 'string' ? d.thought : 'Ready to lend a hand in Alderbrook.',
        dialogue: typeof d.dialogue === 'string' ? d.dialogue : 'Glad to join Alderbrook Square!',
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
      migrationBatch.update(doc(db, 'towns', uid, 'agents', item.id), item.patch);
    }
    try {
      await migrationBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, townPath);
    }
  }

  const structures: TownStructure[] = [];
  structuresSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const plotId = sanitizeOptionalPlot(d.plotId);
    const structureType =
      typeof d.structureType === 'string' && VALID_STRUCTURE_SET.has(d.structureType)
        ? (d.structureType as StructureType)
        : null;
    if (!plotId || !structureType) return;
    const status: StructureStatus = d.status === 'complete' ? 'complete' : 'building';
    structures.push({
      plotId,
      structureType,
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
      rank: (Number(d.rank ?? 1) as 0 | 1 | 2 | 3),
      location: (d.location as LocationId | 'plaza') || 'plaza',
      targetAgent: d.targetAgent ? String(d.targetAgent) : null,
      thought: String(d.thought ?? ''),
      dialogue: String(d.dialogue ?? ''),
      newTask: String(d.newTask ?? ''),
      timestampMs: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now(),
    });
  });

  return {
    turnCount: Number(townData.turnCount ?? 0),
    activeAgentIndex: Number(townData.activeAgentIndex ?? 0) % orderedAgents.length,
    activeDecree: typeof townData.activeDecree === 'string' ? townData.activeDecree : '',
    metrics: {
      prosperity: clampScore(townData.prosperity, DEFAULT_TOWN_METRICS.prosperity),
      orderLevel: clampScore(townData.orderLevel, DEFAULT_TOWN_METRICS.orderLevel),
      morale: clampScore(townData.morale, DEFAULT_TOWN_METRICS.morale),
    },
    timeOfDay: (townData.timeOfDay as TimeOfDay) || 'day',
    weather: normalizeWeatherMode(townData.weather),
    theme: normalizeTownTheme(townData.theme),
    agents: orderedAgents,
    structures,
    logs: logs.length > 0 ? logs : createInitialLogs(),
  };
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
): Promise<void> {
  const townRef = doc(db, 'towns', uid);
  const agentRef = doc(db, 'towns', uid, 'agents', updatedAgent.id);
  const logRef = doc(db, 'towns', uid, 'logs', logEntry.id);

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
    const structureRef = doc(db, 'towns', uid, 'structures', structure.plotId);
    if (mode === 'create') {
      batch.set(structureRef, {
        ownerId: uid,
        plotId: structure.plotId,
        structureType: structure.structureType,
        status: structure.status,
        progress: clampScore(structure.progress, 0),
        tier: Math.max(1, Math.min(3, structure.tier)),
        proposedBy: clampStr(structure.proposedBy, 60) || 'Architect Lyra',
        lastBuilder: clampStr(structure.lastBuilder, 60),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
    batch.set(doc(db, 'towns', uid, 'logs', wLog.id), {
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
      batch.set(doc(db, 'towns', uid, 'agents', worker.id), buildAgentDocPayload(uid, worker));
    }
    for (const hLog of hiredPayload.logs) {
      batch.set(doc(db, 'towns', uid, 'logs', hLog.id), {
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
    handleFirestoreError(error, OperationType.WRITE, `towns/${uid}`);
  }
}

export async function persistHiredWorkers(
  uid: string,
  workers: AgentRecord[],
  logs: TownLogItem[],
): Promise<void> {
  if (workers.length === 0) return;
  const batch = writeBatch(db);
  for (const worker of workers) {
    batch.set(doc(db, 'towns', uid, 'agents', worker.id), buildAgentDocPayload(uid, worker));
  }
  for (const hLog of logs) {
    batch.set(doc(db, 'towns', uid, 'logs', hLog.id), {
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
    handleFirestoreError(error, OperationType.WRITE, `towns/${uid}/agents`);
  }
}

export async function persistGodDecree(
  uid: string,
  decreeText: string,
  turnCount: number,
  logEntry: TownLogItem,
): Promise<void> {
  const townRef = doc(db, 'towns', uid);
  const logRef = doc(db, 'towns', uid, 'logs', logEntry.id);

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
    handleFirestoreError(error, OperationType.WRITE, `towns/${uid}`);
  }
}

export async function persistAgentNote(
  uid: string,
  agentId: AgentId,
  userNote: string,
): Promise<void> {
  const path = `towns/${uid}/agents/${agentId}`;
  try {
    await updateDoc(doc(db, 'towns', uid, 'agents', agentId), {
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
): Promise<void> {
  const townRef = doc(db, 'towns', uid);
  const logRef = doc(db, 'towns', uid, 'logs', logEntry.id);
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
    handleFirestoreError(error, OperationType.WRITE, `towns/${uid}`);
  }
}

export async function persistEnvironmentSettings(
  uid: string,
  updates: { timeOfDay?: TimeOfDay; weather?: WeatherMode; theme?: TownTheme },
): Promise<void> {
  const path = `towns/${uid}`;
  try {
    await updateDoc(doc(db, 'towns', uid), {
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
): Unsubscribe {
  const remotePath = `towns/${uid}/remoteCommands`;
  const q = query(
    collection(db, 'towns', uid, 'remoteCommands'),
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
): Promise<void> {
  const cmdPath = `towns/${uid}/remoteCommands/${commandId}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'towns', uid, 'remoteCommands', commandId), {
    status,
    executedAt: serverTimestamp(),
    resultMessage: clampStr(resultMessage, 300),
  });

  if (remoteLogEntry) {
    batch.set(doc(db, 'towns', uid, 'logs', remoteLogEntry.id), {
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
): Promise<void> {
  const structPath = `towns/${uid}/structures/${structure.plotId}`;
  const structureRef = doc(db, 'towns', uid, 'structures', structure.plotId);
  try {
    if (mode === 'create') {
      await setDoc(structureRef, {
        ownerId: uid,
        plotId: structure.plotId,
        structureType: structure.structureType,
        status: structure.status,
        progress: clampScore(structure.progress, 0),
        tier: Math.max(1, Math.min(3, structure.tier)),
        proposedBy: clampStr(structure.proposedBy, 60) || 'Remote Command',
        lastBuilder: clampStr(structure.lastBuilder, 60) || 'Remote Command',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

export async function enqueueRemoteCommand(
  uid: string,
  type: RemoteCommandType,
  value: string,
  source = 'telegram',
): Promise<string> {
  const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cmdPath = `towns/${uid}/remoteCommands/${cmdId}`;
  try {
    await setDoc(doc(db, 'towns', uid, 'remoteCommands', cmdId), {
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
): Promise<void> {
  const agentPath = `towns/${uid}/agents/${updatedAgent.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'towns', uid, 'agents', updatedAgent.id), {
    location: updatedAgent.location,
    activePlotId: updatedAgent.activePlotId ?? '',
    targetAgent: clampStr(updatedAgent.targetAgent, 60),
    thought: clampStr(updatedAgent.thought, 500),
    dialogue: clampStr(updatedAgent.dialogue, 240),
    currentTask: clampStr(updatedAgent.currentTask, 240),
    userNote: clampStr(updatedAgent.userNote, 180),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'towns', uid, 'logs', logEntry.id), {
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

export async function resetTownInFirestore(uid: string): Promise<LoadedTownState> {
  const townRef = doc(db, 'towns', uid);
  const logsPath = `towns/${uid}/logs`;
  const structuresPath = `towns/${uid}/structures`;
  const agentsPath = `towns/${uid}/agents`;

  let existingLogs;
  try {
    existingLogs = await getDocs(collection(db, 'towns', uid, 'logs'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, logsPath);
  }

  let existingStructures;
  try {
    existingStructures = await getDocs(collection(db, 'towns', uid, 'structures'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, structuresPath);
  }

  let existingAgents;
  try {
    existingAgents = await getDocs(collection(db, 'towns', uid, 'agents'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, agentsPath);
  }

  let pendingCommands;
  try {
    pendingCommands = await getDocs(
      query(collection(db, 'towns', uid, 'remoteCommands'), where('status', '==', 'pending')),
    );
  } catch {
    pendingCommands = null;
  }

  const initialAgents = createInitialAgents();
  const initialLogs = createInitialLogs();
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
    turnCount: 0,
    activeAgentIndex: 0,
    activeDecree: '',
    prosperity: DEFAULT_TOWN_METRICS.prosperity,
    orderLevel: DEFAULT_TOWN_METRICS.orderLevel,
    morale: DEFAULT_TOWN_METRICS.morale,
    timeOfDay: 'day',
    weather: 'summer',
    theme: 'meadow',
    updatedAt: serverTimestamp(),
  });

  for (const agent of initialAgents) {
    const agentRef = doc(db, 'towns', uid, 'agents', agent.id);
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
  batch.set(doc(db, 'towns', uid, 'logs', seedLog.id), {
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
    handleFirestoreError(error, OperationType.WRITE, `towns/${uid}`);
  }

  return {
    turnCount: 0,
    activeAgentIndex: 0,
    activeDecree: '',
    metrics: { ...DEFAULT_TOWN_METRICS },
    timeOfDay: 'day',
    weather: 'summer',
    theme: 'meadow',
    agents: initialAgents,
    structures: [],
    logs: initialLogs,
  };
}
