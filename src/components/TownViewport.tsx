import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Coffee,
  Compass,
  Crown,
  Eye,
  EyeOff,
  FlaskConical,
  Footprints,
  Hammer,
  MessageCircle,
  Moon,
  Pencil,
  Shield,
  TrainFront,
  Trash2,
  UserCheck,
  Wheat,
  X,
} from 'lucide-react';
import {
  classifyAgentActivity,
  getDemolishSalvageGold,
  type AgentActivityIcon,
} from '../lib/townSystems.ts';
import {
  TownSceneController,
  type AgentWorldCoord,
  type ProjectedLabel,
} from '../three/townScene.ts';
import {
  getStructureDisplayLabel,
  PLOT_META,
  STRUCTURE_META,
  type AgentId,
  type AgentRecord,
  type BiomeId,
  type CameraMode,
  type DecorPackId,
  type GraphicsQuality,
  type LocationId,
  type PlotId,
  type TimeOfDay,
  type TownStructure,
  type TownTheme,
  type WeatherMode,
} from '../types/town.ts';

interface TownViewportProps {
  townId: string;
  townName: string;
  isMainTown: boolean;
  agents: AgentRecord[];
  structures: TownStructure[];
  unlockedBiomes: BiomeId[];
  roads: string[];
  railSpurBuilt: boolean;
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
  recentSpeakerId?: AgentId | null;
  cameraMode: CameraMode;
  povVillagerId: AgentId | null;
  selectedPlotId: PlotId | null;
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  townTheme: TownTheme;
  graphicsQuality: GraphicsQuality;
  followActive: boolean;
  communicationEvent: {
    speakerId: AgentId;
    targetAgentName: string | null;
    accentColor: string;
    nonce: number;
  } | null;
  focusRequest:
    | { type: 'agent'; id: AgentId; nonce: number }
    | { type: 'location'; id: LocationId; nonce: number }
    | { type: 'plot'; id: PlotId; nonce: number }
    | { type: 'biome'; id: BiomeId; nonce: number }
    | { type: 'rail_spur'; nonce: number }
    | { type: 'signal_relay'; nonce: number }
    | { type: 'reset'; nonce: number }
    | null;
  signalRelayPulseNonce?: number;
  triggerTrainNonce?: number;
  decorPacks?: DecorPackId[];
  triggerCelebrationNonce?: number;
  onSelectAgent: (agentId: AgentId) => void;
  onTogglePovAgent: (agentId: AgentId) => void;
  onToggleTrainPov?: (seat: 'cab' | 'passenger') => void;
  onChangeCameraMode: (mode: CameraMode, povAgentId?: AgentId | null) => void;
  onExitPov: () => void;
  onSelectLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
  onDismissPlot: () => void;
  onWhisperBuildPlot: (plotId: PlotId, isUpgrade: boolean) => void;
  onRenameStructure?: (plotId: PlotId, newLabel: string) => void;
  onAssignWorkerToPlot?: (plotId: PlotId, agentId: AgentId | null) => void;
  onDemolishStructure?: (plotId: PlotId) => void;
  onRegisterSnapshotFn?: (
    fn: ((townName: string, subtitle?: string) => string | null) | null,
  ) => void;
  onMinimapUpdate?: (coords: Record<AgentId, AgentWorldCoord>) => void;
  onUserOrbitStart?: () => void;
}

const ACTIVITY_ICON_MAP: Record<AgentActivityIcon, typeof Hammer> = {
  build: Hammer,
  research: FlaskConical,
  harvest: Wheat,
  cafe: Coffee,
  guard: Shield,
  council: Crown,
  rest: Moon,
  chat: MessageCircle,
};

const ACTIVITY_COLOR_MAP: Record<AgentActivityIcon, string> = {
  build: 'text-amber-300',
  research: 'text-cyan-300',
  harvest: 'text-emerald-300',
  cafe: 'text-orange-300',
  guard: 'text-sky-300',
  council: 'text-yellow-300',
  rest: 'text-indigo-300',
  chat: 'text-slate-300',
};

export function TownViewport({
  townId,
  townName,
  isMainTown,
  agents,
  structures,
  unlockedBiomes,
  roads,
  railSpurBuilt,
  activeAgentId,
  selectedAgentId,
  recentSpeakerId = null,
  cameraMode,
  povVillagerId,
  selectedPlotId,
  timeOfDay,
  weather,
  townTheme,
  graphicsQuality,
  followActive,
  communicationEvent,
  focusRequest,
  signalRelayPulseNonce = 0,
  triggerTrainNonce = 0,
  decorPacks = [],
  triggerCelebrationNonce = 0,
  onSelectAgent,
  onTogglePovAgent,
  onToggleTrainPov,
  onChangeCameraMode,
  onExitPov,
  onSelectLocation,
  onSelectPlot,
  onSelectSignalRelay,
  onDismissPlot,
  onWhisperBuildPlot,
  onRenameStructure,
  onAssignWorkerToPlot,
  onDemolishStructure,
  onRegisterSnapshotFn,
  onMinimapUpdate,
  onUserOrbitStart,
}: TownViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<TownSceneController | null>(null);
  const loadedTownKeyRef = useRef<string | null>(null);
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const joystickPadRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);

  const [contextLost, setContextLost] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDemolish, setConfirmDemolish] = useState(false);

  const latestTownDataRef = useRef({
    townId,
    townName,
    isMainTown,
    agents,
    structures,
    unlockedBiomes,
    roads,
    railSpurBuilt,
    activeAgentId,
    selectedAgentId,
    selectedPlotId,
    timeOfDay,
    weather,
    townTheme,
  });
  latestTownDataRef.current = {
    townId,
    townName,
    isMainTown,
    agents,
    structures,
    unlockedBiomes,
    roads,
    railSpurBuilt,
    activeAgentId,
    selectedAgentId,
    selectedPlotId,
    timeOfDay,
    weather,
    townTheme,
  };
  const callbacksRef = useRef({
    onSelectAgent,
    onTogglePovAgent,
    onToggleTrainPov,
    onSelectLocation,
    onSelectPlot,
    onSelectSignalRelay,
    onMinimapUpdate,
    onUserOrbitStart,
    onRegisterSnapshotFn,
  });
  callbacksRef.current = {
    onSelectAgent,
    onTogglePovAgent,
    onToggleTrainPov,
    onSelectLocation,
    onSelectPlot,
    onSelectSignalRelay,
    onMinimapUpdate,
    onUserOrbitStart,
    onRegisterSnapshotFn,
  };

  useEffect(() => {
    setRenameOpen(false);
    setConfirmDemolish(false);
  }, [selectedPlotId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const controller = new TownSceneController(
      container,
      agents,
      {
        onSelectAgent: (id) => callbacksRef.current.onSelectAgent(id),
        onToggleAgentPov: (id) => callbacksRef.current.onTogglePovAgent(id),
        onToggleTrainPov: (seat) => callbacksRef.current.onToggleTrainPov?.(seat),
        onSelectLocation: (id) => callbacksRef.current.onSelectLocation(id),
        onSelectPlot: (id) => callbacksRef.current.onSelectPlot(id),
        onSelectSignalRelay: () => callbacksRef.current.onSelectSignalRelay?.(),
        onContextLost: () => setContextLost(true),
        onContextRestored: () => setContextLost(false),
        onMinimapUpdate: (coords) => callbacksRef.current.onMinimapUpdate?.(coords),
        onUserOrbitStart: () => callbacksRef.current.onUserOrbitStart?.(),
        onLabelUpdate: (positions: Record<AgentId, ProjectedLabel>) => {
          for (const [id, pos] of Object.entries(positions)) {
            const el = labelRefs.current[id];
            if (!el) continue;
            if (!pos.visible) {
              el.style.opacity = '0';
              el.style.pointerEvents = 'none';
            } else {
              el.style.opacity = '1';
              el.style.pointerEvents = 'auto';
              el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
            }
          }
        },
      },
      graphicsQuality,
      townTheme,
    );

    controllerRef.current = controller;
    callbacksRef.current.onRegisterSnapshotFn?.((name, sub) =>
      controller.captureSnapshotDataUrl(name, sub),
    );

    const snap = latestTownDataRef.current;
    controller.loadTown({
      townId: snap.townId,
      townName: snap.townName,
      isMainTown: snap.isMainTown,
      agents: snap.agents,
      structures: snap.structures,
      unlockedBiomes: snap.unlockedBiomes,
      roads: snap.roads,
      railSpurBuilt: snap.railSpurBuilt,
      activeAgentId: snap.activeAgentId,
      selectedAgentId: snap.selectedAgentId,
      selectedPlotId: snap.selectedPlotId,
      timeOfDay: snap.timeOfDay,
      weather: snap.weather,
      theme: snap.townTheme,
    });
    loadedTownKeyRef.current = `${snap.townId}:${snap.isMainTown}:${snap.townName}`;

    return () => {
      callbacksRef.current.onRegisterSnapshotFn?.(null);
      controller.dispose();
      controllerRef.current = null;
      loadedTownKeyRef.current = null;
    };
    // Intentionally mount WebGL once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Immediately rebuild & refresh the 3D scene whenever switching towns or creating a new town
  const currentTownKey = `${townId}:${isMainTown}:${townName}`;
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (loadedTownKeyRef.current === currentTownKey) return;
    const snap = latestTownDataRef.current;
    controller.loadTown({
      townId: snap.townId,
      townName: snap.townName,
      isMainTown: snap.isMainTown,
      agents: snap.agents,
      structures: snap.structures,
      unlockedBiomes: snap.unlockedBiomes,
      roads: snap.roads,
      railSpurBuilt: snap.railSpurBuilt,
      activeAgentId: snap.activeAgentId,
      selectedAgentId: snap.selectedAgentId,
      selectedPlotId: snap.selectedPlotId,
      timeOfDay: snap.timeOfDay,
      weather: snap.weather,
      theme: snap.townTheme,
    });
    loadedTownKeyRef.current = currentTownKey;
  }, [currentTownKey]);

  useEffect(() => {
    if (loadedTownKeyRef.current !== currentTownKey) return;
    controllerRef.current?.syncAgents(agents, activeAgentId, selectedAgentId);
  }, [agents, activeAgentId, selectedAgentId, currentTownKey]);

  useEffect(() => {
    if (loadedTownKeyRef.current !== currentTownKey) return;
    controllerRef.current?.syncExpansion(unlockedBiomes, roads, railSpurBuilt);
  }, [unlockedBiomes, roads, railSpurBuilt, currentTownKey]);

  useEffect(() => {
    if (loadedTownKeyRef.current !== currentTownKey) return;
    controllerRef.current?.syncStructures(structures, selectedPlotId);
  }, [structures, selectedPlotId, currentTownKey]);

  useEffect(() => {
    controllerRef.current?.setAtmosphere(timeOfDay, weather);
    if (loadedTownKeyRef.current === currentTownKey) {
      controllerRef.current?.refreshDailyRoutines(latestTownDataRef.current.agents);
    }
  }, [timeOfDay, weather, currentTownKey]);

  useEffect(() => {
    controllerRef.current?.setTheme(townTheme);
  }, [townTheme]);

  useEffect(() => {
    controllerRef.current?.setGraphicsQuality(graphicsQuality);
  }, [graphicsQuality]);

  useEffect(() => {
    controllerRef.current?.setFollowActive(followActive);
  }, [followActive]);

  useEffect(() => {
    if (loadedTownKeyRef.current !== currentTownKey) return;
    controllerRef.current?.setCameraMode(cameraMode, povVillagerId);
  }, [cameraMode, povVillagerId, currentTownKey]);

  useEffect(() => {
    if (!communicationEvent) return;
    controllerRef.current?.triggerCommunicationArc(
      communicationEvent.speakerId,
      communicationEvent.targetAgentName,
      communicationEvent.accentColor,
    );
  }, [communicationEvent]);

  useEffect(() => {
    if (signalRelayPulseNonce > 0) {
      controllerRef.current?.pulseSignalRelay(8);
    }
  }, [signalRelayPulseNonce]);

  useEffect(() => {
    if (triggerTrainNonce > 0) {
      controllerRef.current?.triggerTrain();
    }
  }, [triggerTrainNonce]);

  useEffect(() => {
    controllerRef.current?.setDecorPacks(decorPacks);
  }, [decorPacks, currentTownKey]);

  useEffect(() => {
    if (triggerCelebrationNonce > 0) {
      controllerRef.current?.triggerCelebration();
    }
  }, [triggerCelebrationNonce]);

  useEffect(() => {
    if (!focusRequest || !controllerRef.current) return;
    if (focusRequest.type === 'agent') {
      controllerRef.current.focusAgent(focusRequest.id);
    } else if (focusRequest.type === 'location') {
      controllerRef.current.focusLocation(focusRequest.id);
    } else if (focusRequest.type === 'plot') {
      controllerRef.current.focusPlot(focusRequest.id);
    } else if (focusRequest.type === 'biome') {
      controllerRef.current.focusBiome(focusRequest.id);
    } else if (focusRequest.type === 'rail_spur') {
      controllerRef.current.focusRailSpur();
    } else if (focusRequest.type === 'signal_relay') {
      controllerRef.current.focusSignalRelay();
    } else {
      controllerRef.current.resetCamera();
    }
  }, [focusRequest]);

  // Lightweight pointer-captured touch joystick for Free-Roam Walk Mode
  const updateJoystickFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const pad = joystickPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = dist > maxR ? maxR / dist : 1;
    const ox = dx * clamped;
    const oy = dy * clamped;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0)`;
    }
    controllerRef.current?.setFreeRoamInput(ox / maxR, oy / maxR);
  };

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    controllerRef.current?.setFreeRoamInput(0, 0);
  };

  const selectedStructure = selectedPlotId
    ? structures.find((s) => s.plotId === selectedPlotId) || null
    : null;
  const assignedWorker = selectedPlotId
    ? agents.find((a) => a.assignedPlotId === selectedPlotId || a.activePlotId === selectedPlotId) ||
      null
    : null;
  const povAgent =
    cameraMode === 'villager_pov' && povVillagerId
      ? agents.find((a) => a.id === povVillagerId) || null
      : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-900">
      <div
        ref={mountRef}
        className="h-full w-full touch-none select-none"
        aria-label="Interactive 3D Alderbrook Town viewport"
      />

      {/* Projected Semantic DOM Nameplates, Live Work Icons & Speech Bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {agents.map((agent) => {
          const isActive = agent.id === activeAgentId;
          const isSelected = agent.id === selectedAgentId;
          const isRecentSpeaker = agent.id === recentSpeakerId;
          const showBubble = isActive || isSelected || isRecentSpeaker;
          const activity = classifyAgentActivity(agent, timeOfDay, structures);
          const ActIcon = ACTIVITY_ICON_MAP[activity.icon];
          const actColor = ACTIVITY_COLOR_MAP[activity.icon];

          return (
            <button
              key={agent.id}
              type="button"
              ref={(el) => {
                labelRefs.current[agent.id] = el;
              }}
              onClick={() => onTogglePovAgent(agent.id)}
              title={`${agent.name} (${activity.shortLabel}) · Tap for First-Person POV`}
              style={{ opacity: 0 }}
              className="absolute top-0 left-0 flex flex-col items-center transition-opacity duration-150 focus:outline-none"
            >
              {showBubble && agent.dialogue && (
                <div className="mb-1.5 max-w-[196px] rounded-xl border border-white/15 bg-slate-950/92 px-2.5 py-1.5 text-left text-[11px] leading-snug text-slate-100 shadow-lg">
                  {agent.dialogue}
                </div>
              )}
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap shadow-md ${
                  isSelected
                    ? 'border-amber-400 bg-slate-950 text-white'
                    : isActive
                      ? 'border-white/40 bg-slate-950/92 text-white'
                      : 'border-white/15 bg-slate-950/85 text-slate-200'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agent.accentColor }}
                  aria-hidden="true"
                />
                <span>{agent.name}</span>
                <ActIcon className={`h-3 w-3 shrink-0 ${actColor}`} aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Contextual Camera Mode Banner (Villager POV / Train Ride / Free-Roam Walk / Scenic Tour) */}
      {cameraMode !== 'orbit' && (
        <div className="fixed top-18 left-1/2 z-25 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-3 py-2 shadow-2xl md:top-20">
          {cameraMode === 'villager_pov' && povAgent && (
            <>
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Eye className="h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5 font-display font-semibold text-white">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: povAgent.accentColor }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{povAgent.name}</span>
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    First-Person POV · {povAgent.role}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onExitPov}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 transition-colors hover:bg-amber-400"
              >
                <EyeOff className="h-3.5 w-3.5" />
                <span>Exit POV</span>
              </button>
            </>
          )}

          {(cameraMode === 'train_cab' || cameraMode === 'train_passenger') && (
            <>
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <TrainFront className="h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-display font-semibold text-white">
                    Steam Express Ride
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    {cameraMode === 'train_cab' ? 'Locomotive Cab View' : 'Passenger Window View'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeCameraMode(
                    cameraMode === 'train_cab' ? 'train_passenger' : 'train_cab',
                  )
                }
                className="inline-flex min-h-[38px] shrink-0 items-center rounded-xl border border-white/15 bg-slate-900 px-2.5 text-xs font-semibold whitespace-nowrap text-slate-100 transition-colors hover:bg-slate-800"
              >
                {cameraMode === 'train_cab' ? 'Coach View' : 'Cab View'}
              </button>
              <button
                type="button"
                onClick={onExitPov}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 transition-colors hover:bg-amber-400"
              >
                <span>Exit</span>
              </button>
            </>
          )}

          {cameraMode === 'free_roam' && (
            <>
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Footprints className="h-4 w-4 shrink-0 text-emerald-300" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-display font-semibold text-white">
                    Street Walk Mode
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    WASD or Pad to walk · Drag screen to look
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onExitPov}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 transition-colors hover:bg-amber-400"
              >
                <span>Exit Walk</span>
              </button>
            </>
          )}

          {cameraMode === 'tour' && (
            <>
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Compass className="h-4 w-4 shrink-0 text-sky-300" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-display font-semibold text-white">
                    Cinematic Town Tour
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    Gliding over landmarks & districts
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onExitPov}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 text-xs font-semibold whitespace-nowrap text-slate-950 transition-colors hover:bg-amber-400"
              >
                <span>Exit Tour</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Mobile & Touch Walk Joystick Pad (Free-Roam Walk Mode Only) */}
      {cameraMode === 'free_roam' && (
        <div
          ref={joystickPadRef}
          onPointerDown={(e) => {
            joystickPointerIdRef.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateJoystickFromEvent(e);
          }}
          onPointerMove={(e) => {
            if (joystickPointerIdRef.current !== e.pointerId) return;
            updateJoystickFromEvent(e);
          }}
          onPointerUp={(e) => {
            if (joystickPointerIdRef.current !== e.pointerId) return;
            resetJoystick();
          }}
          onPointerCancel={resetJoystick}
          aria-label="Touch movement joystick"
          className="fixed bottom-24 left-5 z-25 flex h-28 w-28 touch-none items-center justify-center rounded-full border-2 border-white/25 bg-slate-950/75 shadow-xl md:bottom-20"
        >
          <div
            ref={joystickKnobRef}
            className="h-11 w-11 rounded-full border border-amber-300/60 bg-amber-500/85 shadow-lg"
          />
        </div>
      )}

      {/* Selected Building Plot Manager (Rename, Reassign Worker, Upgrade, 2-Tap Demolish) */}
      {selectedPlotId && (
        <div className="fixed top-18 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950/95 p-3.5 shadow-2xl md:top-20">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400">{PLOT_META[selectedPlotId].label}</div>
              {renameOpen && selectedStructure ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleaned = renameDraft.trim();
                    if (cleaned && onRenameStructure) {
                      onRenameStructure(selectedPlotId, cleaned);
                    }
                    setRenameOpen(false);
                  }}
                  className="mt-1 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    maxLength={40}
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-amber-400/50 bg-slate-900 px-2 text-xs text-white focus:outline-none"
                    placeholder="Building name..."
                  />
                  <button
                    type="submit"
                    aria-label="Save building name"
                    className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate font-display text-sm font-semibold text-white">
                    {selectedStructure
                      ? getStructureDisplayLabel(selectedStructure)
                      : 'Open Town Plot'}
                  </h3>
                  {selectedStructure && onRenameStructure && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameDraft(getStructureDisplayLabel(selectedStructure));
                        setRenameOpen(true);
                      }}
                      title="Rename building"
                      aria-label="Rename building"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-amber-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onDismissPlot}
              aria-label="Close plot inspector"
              className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedStructure ? (
            <div className="mt-2.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>
                  {selectedStructure.status === 'complete'
                    ? `Tier ${selectedStructure.tier}/3 · ${STRUCTURE_META[selectedStructure.structureType].category}`
                    : `Under Construction · Proposed by ${selectedStructure.proposedBy}`}
                </span>
                {selectedStructure.status === 'building' && (
                  <span className="font-mono-tabular font-semibold text-amber-300">
                    {selectedStructure.progress}%
                  </span>
                )}
              </div>

              {selectedStructure.status === 'building' && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${selectedStructure.progress}%` }}
                  />
                </div>
              )}

              {/* Reassign Worker Selector */}
              {onAssignWorkerToPlot && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="plot-worker-assign"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-400"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Staff</span>
                  </label>
                  <select
                    id="plot-worker-assign"
                    value={assignedWorker?.id ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onAssignWorkerToPlot(selectedPlotId, val ? (val as AgentId) : null);
                    }}
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-900 px-2.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">Unassigned (Auto)</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Upgrade & 2-Tap Demolish Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedStructure.status === 'complete' && selectedStructure.tier < 3 && (
                  <button
                    type="button"
                    onClick={() => onWhisperBuildPlot(selectedPlotId, true)}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold whitespace-nowrap text-amber-200 transition-colors hover:bg-amber-500/25"
                  >
                    <Hammer className="h-3.5 w-3.5" />
                    <span>Upgrade</span>
                  </button>
                )}

                {onDemolishStructure && !confirmDemolish && (
                  <button
                    type="button"
                    onClick={() => setConfirmDemolish(true)}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 text-xs font-semibold whitespace-nowrap text-rose-200 transition-colors hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Demolish (+{getDemolishSalvageGold(selectedStructure)}g)</span>
                  </button>
                )}

                {onDemolishStructure && confirmDemolish && (
                  <div className="flex w-full items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onDemolishStructure(selectedPlotId);
                        setConfirmDemolish(false);
                      }}
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-semibold whitespace-nowrap text-white hover:bg-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Confirm Demolish (+{getDemolishSalvageGold(selectedStructure)}g)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDemolish(false)}
                      className="inline-flex min-h-[40px] shrink-0 items-center rounded-xl border border-white/15 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2.5 text-xs text-slate-300">
              <p>Staked and ready. Managers can propose a new building here automatically.</p>
              <button
                type="button"
                onClick={() => onWhisperBuildPlot(selectedPlotId, false)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
              >
                <Hammer className="h-3.5 w-3.5" />
                <span>Ask Architect Lyra to Build Here</span>
              </button>
            </div>
          )}
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 p-6 text-center text-slate-200">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h3 className="font-display text-lg font-semibold text-white">3D Viewport Paused</h3>
            <p className="mt-1.5 text-sm text-slate-300">
              Graphics context was suspended by the browser. Tap reload if it does not resume
              automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
