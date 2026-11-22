import type { AgentWorldCoord } from '../three/townScene.ts';
import {
  ALL_PLOT_IDS,
  PLOT_META,
  STRUCTURE_META,
  type AgentId,
  type AgentRecord,
  type LocationId,
  type PlotId,
  type TownStructure,
} from '../types/town.ts';

interface TownMinimapProps {
  agents: AgentRecord[];
  structures: TownStructure[];
  coords: Partial<Record<AgentId, AgentWorldCoord>>;
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
  selectedPlotId: PlotId | null;
  onSelectAgent: (id: AgentId) => void;
  onFocusLocation: (loc: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
}

const LANDMARK_MARKERS: Array<{ id: LocationId; label: string; x: number; z: number }> = [
  { id: 'town_hall', label: 'Hall', x: 0, z: -10.5 },
  { id: 'workshop', label: 'Work', x: 10.5, z: -0.5 },
  { id: 'market', label: 'Mkt', x: -10.5, z: -0.5 },
  { id: 'park', label: 'Park', x: 0, z: 10.2 },
];

function toMapCoord(val: number): number {
  // World range [-15, 15] -> SVG [12, 128]
  return 70 + (val / 15) * 56;
}

export function TownMinimap({
  agents,
  structures,
  coords,
  activeAgentId,
  selectedAgentId,
  selectedPlotId,
  onSelectAgent,
  onFocusLocation,
  onSelectPlot,
  onSelectSignalRelay,
}: TownMinimapProps) {
  const structureByPlot = new Map<PlotId, TownStructure>();
  for (const s of structures) {
    structureByPlot.set(s.plotId, s);
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-xl">
      <svg
        viewBox="0 0 140 140"
        className="h-28 w-28 sm:h-32 sm:w-32"
        role="img"
        aria-label="Overhead Town Radar"
      >
        {/* Grass Ring */}
        <circle cx="70" cy="70" r="64" fill="#1e293b" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Walkways */}
        <line x1="70" y1="22" x2="70" y2="118" stroke="rgba(148,163,184,0.28)" strokeWidth="6" strokeLinecap="round" />
        <line x1="22" y1="68" x2="118" y2="68" stroke="rgba(148,163,184,0.28)" strokeWidth="6" strokeLinecap="round" />
        {/* Central Plaza */}
        <circle cx="70" cy="70" r="14" fill="rgba(148,163,184,0.22)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

        {/* 8 Buildable Plots */}
        {ALL_PLOT_IDS.map((plotId) => {
          const pm = PLOT_META[plotId];
          const cx = toMapCoord(pm.x);
          const cy = toMapCoord(pm.z);
          const st = structureByPlot.get(plotId);
          const isSelected = selectedPlotId === plotId;
          const fillColor = st
            ? st.status === 'complete'
              ? STRUCTURE_META[st.structureType].color
              : 'rgba(245, 158, 11, 0.35)'
            : 'rgba(15, 23, 42, 0.45)';
          const strokeColor = isSelected
            ? '#ffffff'
            : st
              ? st.status === 'complete'
                ? '#f8fafc'
                : '#f59e0b'
              : 'rgba(148, 163, 184, 0.45)';

          return (
            <g
              key={plotId}
              onClick={() => onSelectPlot(plotId)}
              className="cursor-pointer"
            >
              <rect
                x={cx - 4.5}
                y={cy - 4.5}
                width="9"
                height="9"
                rx="2"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 1.5 : 1}
                strokeDasharray={st ? undefined : '2 1.5'}
              />
            </g>
          );
        })}

        {/* Landmarks */}
        {LANDMARK_MARKERS.map((lm) => {
          const cx = toMapCoord(lm.x);
          const cy = toMapCoord(lm.z);
          return (
            <g
              key={lm.id}
              onClick={() => onFocusLocation(lm.id)}
              className="cursor-pointer"
            >
              <rect
                x={cx - 12}
                y={cy - 9}
                width="24"
                height="18"
                rx="4"
                fill="rgba(15,23,42,0.9)"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
              />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="8"
                fontWeight="600"
              >
                {lm.label}
              </text>
            </g>
          );
        })}

        {/* Signal Relay Hub Marker */}
        {onSelectSignalRelay && (
          <g onClick={onSelectSignalRelay} className="cursor-pointer">
            <rect
              x={toMapCoord(10.6) - 13}
              y={toMapCoord(12.2) - 8}
              width="26"
              height="16"
              rx="4"
              fill="rgba(8, 51, 68, 0.92)"
              stroke="#22d3ee"
              strokeWidth="1.2"
            />
            <text
              x={toMapCoord(10.6)}
              y={toMapCoord(12.2) + 3}
              textAnchor="middle"
              fill="#a5f3fc"
              fontSize="7.5"
              fontWeight="700"
            >
              Relay
            </text>
          </g>
        )}

        {/* Agents */}
        {agents.map((agent) => {
          const pos = coords[agent.id];
          const cx = pos ? toMapCoord(pos.x) : 70;
          const cy = pos ? toMapCoord(pos.z) : 70;
          const isSelected = agent.id === selectedAgentId;
          const isActive = agent.id === activeAgentId;
          return (
            <g
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className="cursor-pointer"
            >
              {isActive && (
                <circle
                  cx={cx}
                  cy={cy}
                  r="7"
                  fill="none"
                  stroke={agent.accentColor}
                  strokeWidth="1.5"
                  opacity="0.85"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 5 : 4}
                fill={agent.accentColor}
                stroke={isSelected ? '#ffffff' : '#0f172a'}
                strokeWidth={isSelected ? 1.5 : 1}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
