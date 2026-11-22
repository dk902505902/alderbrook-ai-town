import { useEffect, useRef, useState } from 'react';
import { Hammer, X } from 'lucide-react';
import {
  TownSceneController,
  type AgentWorldCoord,
  type ProjectedLabel,
} from '../three/townScene.ts';
import {
  PLOT_META,
  STRUCTURE_META,
  type AgentId,
  type AgentRecord,
  type GraphicsQuality,
  type LocationId,
  type PlotId,
  type TimeOfDay,
  type TownStructure,
  type TownTheme,
  type WeatherMode,
} from '../types/town.ts';

interface TownViewportProps {
  agents: AgentRecord[];
  structures: TownStructure[];
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
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
    | { type: 'signal_relay'; nonce: number }
    | { type: 'reset'; nonce: number }
    | null;
  signalRelayPulseNonce?: number;
  triggerTrainNonce?: number;
  onSelectAgent: (agentId: AgentId) => void;
  onSelectLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
  onDismissPlot: () => void;
  onWhisperBuildPlot: (plotId: PlotId, isUpgrade: boolean) => void;
  onMinimapUpdate?: (coords: Record<AgentId, AgentWorldCoord>) => void;
  onUserOrbitStart?: () => void;
}

export function TownViewport({
  agents,
  structures,
  activeAgentId,
  selectedAgentId,
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
  onSelectAgent,
  onSelectLocation,
  onSelectPlot,
  onSelectSignalRelay,
  onDismissPlot,
  onWhisperBuildPlot,
  onMinimapUpdate,
  onUserOrbitStart,
}: TownViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<TownSceneController | null>(null);
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const callbacksRef = useRef({
    onSelectAgent,
    onSelectLocation,
    onSelectPlot,
    onSelectSignalRelay,
    onMinimapUpdate,
    onUserOrbitStart,
  });
  callbacksRef.current = {
    onSelectAgent,
    onSelectLocation,
    onSelectPlot,
    onSelectSignalRelay,
    onMinimapUpdate,
    onUserOrbitStart,
  };

  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const controller = new TownSceneController(container, agents, {
      onSelectAgent: (id) => callbacksRef.current.onSelectAgent(id),
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
    }, graphicsQuality, townTheme);

    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
    // Intentionally mount WebGL once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.syncAgents(agents, activeAgentId, selectedAgentId);
  }, [agents, activeAgentId, selectedAgentId]);

  useEffect(() => {
    controllerRef.current?.syncStructures(structures, selectedPlotId);
  }, [structures, selectedPlotId]);

  useEffect(() => {
    controllerRef.current?.setAtmosphere(timeOfDay, weather);
  }, [timeOfDay, weather]);

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
    if (!focusRequest || !controllerRef.current) return;
    if (focusRequest.type === 'agent') {
      controllerRef.current.focusAgent(focusRequest.id);
    } else if (focusRequest.type === 'location') {
      controllerRef.current.focusLocation(focusRequest.id);
    } else if (focusRequest.type === 'plot') {
      controllerRef.current.focusPlot(focusRequest.id);
    } else if (focusRequest.type === 'signal_relay') {
      controllerRef.current.focusSignalRelay();
    } else {
      controllerRef.current.resetCamera();
    }
  }, [focusRequest]);

  const selectedStructure = selectedPlotId
    ? structures.find((s) => s.plotId === selectedPlotId) || null
    : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-900">
      <div
        ref={mountRef}
        className="h-full w-full touch-none select-none"
        aria-label="Interactive 3D Alderbrook Town viewport"
      />

      {/* Projected Semantic DOM Nameplates & Active Speech Bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {agents.map((agent) => {
          const isActive = agent.id === activeAgentId;
          const isSelected = agent.id === selectedAgentId;
          const showBubble = isActive || isSelected;

          return (
            <button
              key={agent.id}
              type="button"
              ref={(el) => {
                labelRefs.current[agent.id] = el;
              }}
              onClick={() => onSelectAgent(agent.id)}
              style={{ opacity: 0 }}
              className="absolute top-0 left-0 flex flex-col items-center transition-opacity duration-150 focus:outline-none"
            >
              {showBubble && agent.dialogue && (
                <div className="mb-1.5 max-w-[190px] rounded-xl border border-white/15 bg-slate-950/92 px-2.5 py-1.5 text-left text-[11px] leading-snug text-slate-100 shadow-lg">
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
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Building Plot Quick Inspector */}
      {selectedPlotId && (
        <div className="fixed top-18 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950/95 p-3.5 shadow-2xl md:top-20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-400">
                {PLOT_META[selectedPlotId].label}
              </div>
              <h3 className="truncate font-display text-sm font-semibold text-white">
                {selectedStructure
                  ? STRUCTURE_META[selectedStructure.structureType].label
                  : 'Open Town Plot'}
              </h3>
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
            <div className="mt-2 space-y-2 text-xs">
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

              {selectedStructure.status === 'building' ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${selectedStructure.progress}%` }}
                  />
                </div>
              ) : (
                selectedStructure.tier < 3 && (
                  <button
                    type="button"
                    onClick={() => onWhisperBuildPlot(selectedPlotId, true)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
                  >
                    <Hammer className="h-3.5 w-3.5" />
                    <span>Ask Architect Lyra to Upgrade</span>
                  </button>
                )
              )}
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
              Graphics context was suspended by the browser. Tap reload if it does not resume automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
