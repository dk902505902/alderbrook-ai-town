import type { AgentWorldCoord, RaiderRadarSnapshot } from '../three/townScene.ts';
import {
  BIOME_META,
  getAvailablePlotIds,
  getStructureColor,
  PLOT_META,
  type AgentId,
  type AgentRecord,
  type BiomeId,
  type LocationId,
  type PlotId,
  type TownStructure,
} from '../types/town.ts';

interface TownMinimapProps {
  agents: AgentRecord[];
  structures: TownStructure[];
  unlockedBiomes?: BiomeId[];
  railSpurBuilt?: boolean;
  interTownRailBuilt?: boolean;
  busPos?: { x: number; z: number; atStop: boolean } | null;
  coords: Partial<Record<AgentId, AgentWorldCoord>>;
  raiderRadar?: RaiderRadarSnapshot | null;
  activeAgentId: AgentId | null;
  selectedAgentId: AgentId | null;
  selectedPlotId: PlotId | null;
  onSelectAgent: (id: AgentId) => void;
  onFocusLocation: (loc: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onFocusBiome?: (biome: BiomeId) => void;
  onFocusRailSpur?: () => void;
  onFocusInterTownRail?: () => void;
  onFocusBus?: () => void;
  onSelectSignalRelay?: () => void;
  onFocusBattle?: () => void;
  onFocusEnemyCity?: () => void;
}

const LANDMARK_MARKERS: Array<{ id: LocationId; label: string; x: number; z: number }> = [
  { id: 'town_hall', label: 'Hall', x: 0, z: -10.5 },
  { id: 'workshop', label: 'Work', x: 10.5, z: -0.5 },
  { id: 'market', label: 'Mkt', x: -10.5, z: -0.5 },
  { id: 'park', label: 'Park', x: 0, z: 10.2 },
];

export function TownMinimap({
  agents,
  structures,
  unlockedBiomes = [],
  railSpurBuilt = false,
  interTownRailBuilt = false,
  busPos = null,
  coords,
  raiderRadar = null,
  activeAgentId,
  selectedAgentId,
  selectedPlotId,
  onSelectAgent,
  onFocusLocation,
  onSelectPlot,
  onFocusBiome,
  onFocusRailSpur,
  onFocusInterTownRail,
  onFocusBus,
  onSelectSignalRelay,
  onFocusBattle,
  onFocusEnemyCity,
}: TownMinimapProps) {
  const structureByPlot = new Map<PlotId, TownStructure>();
  for (const s of structures) {
    structureByPlot.set(s.plotId, s);
  }

  const hasFarTerrain =
    unlockedBiomes.some((b) => b === 'alpine' || b === 'river' || b === 'canyon') ||
    interTownRailBuilt;
  const expandedView = unlockedBiomes.length > 0 || railSpurBuilt || interTownRailBuilt;
  const raidActive = Boolean(raiderRadar?.raidActive);
  const counterActive = Boolean(raiderRadar?.counterRaidActive);
  // Minimum span of 34 keeps permanent Ironhold Bastion (-25.2, 14.8) always visible on radar
  const worldSpan = hasFarTerrain ? 66 : expandedView ? 46 : 34;
  const compactMarkers = true;
  const toMapCoord = (val: number) => 70 + (val / worldSpan) * 58;
  const visiblePlots = getAvailablePlotIds(unlockedBiomes);

  return (
    <div
      className={`rounded-2xl border bg-slate-950/90 p-2 shadow-xl ${
        raidActive
          ? 'border-rose-500/65'
          : counterActive
            ? 'border-cyan-400/65'
            : 'border-white/15'
      }`}
    >
      <svg
        viewBox="0 0 140 140"
        className="h-28 w-28 sm:h-32 sm:w-32"
        role="img"
        aria-label="Overhead Town Radar"
      >
        {/* Outer Terrain Ring */}
        <circle cx="70" cy="70" r="64" fill="#1e293b" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {/* Unlocked Outer Biome Zones */}
        {unlockedBiomes.map((bId) => {
          const meta = BIOME_META[bId];
          const bx = toMapCoord(meta.center.x);
          const by = toMapCoord(meta.center.z);
          return (
            <g
              key={bId}
              onClick={() => onFocusBiome?.(bId)}
              className="cursor-pointer"
            >
              <circle
                cx={bx}
                cy={by}
                r="17"
                fill={meta.color}
                fillOpacity="0.22"
                stroke={meta.color}
                strokeWidth="1"
                strokeDasharray="2.5 2"
              />
              <text
                x={bx}
                y={by - 10}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize="6.2"
                fontWeight="700"
              >
                {meta.shortLabel}
              </text>
            </g>
          );
        })}

        {/* Railway Ring & Connected East Outer Railway Loop + Frontier Station */}
        {compactMarkers && (
          <circle
            cx="70"
            cy="70"
            r={(19.6 / worldSpan) * 58}
            fill="none"
            stroke="rgba(148,163,184,0.32)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
        )}
        {railSpurBuilt && (
          <g onClick={() => onFocusRailSpur?.()} className="cursor-pointer">
            <path
              d={`M ${toMapCoord(13.9).toFixed(1)} ${toMapCoord(-13.9).toFixed(1)} C ${toMapCoord(28.5).toFixed(1)} ${toMapCoord(-11.5).toFixed(1)}, ${toMapCoord(35.0).toFixed(1)} ${toMapCoord(-4.0).toFixed(1)}, ${toMapCoord(33.2).toFixed(1)} ${toMapCoord(2.2).toFixed(1)} C ${toMapCoord(32.0).toFixed(1)} ${toMapCoord(9.0).toFixed(1)}, ${toMapCoord(26.0).toFixed(1)} ${toMapCoord(12.2).toFixed(1)}, ${toMapCoord(13.9).toFixed(1)} ${toMapCoord(13.9).toFixed(1)}`}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle
              cx={toMapCoord(35.0)}
              cy={toMapCoord(2.2)}
              r="3.2"
              fill="#083344"
              stroke="#22d3ee"
              strokeWidth="1.2"
            />
          </g>
        )}
        {/* Inter-Town Express Railway Track & Portal Arch */}
        {interTownRailBuilt && (
          <g onClick={() => onFocusInterTownRail?.()} className="cursor-pointer">
            <line
              x1={toMapCoord(33.2)}
              y1={toMapCoord(2.2)}
              x2={Math.min(130, toMapCoord(57.5))}
              y2={toMapCoord(2.2)}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="3 1.5"
              strokeLinecap="round"
            />
            <polygon
              points={`${Math.min(130, toMapCoord(57.5))},${toMapCoord(2.2) - 4} ${Math.min(130, toMapCoord(57.5)) + 4},${toMapCoord(2.2)} ${Math.min(130, toMapCoord(57.5))},${toMapCoord(2.2) + 4} ${Math.min(130, toMapCoord(57.5)) - 4},${toMapCoord(2.2)}`}
              fill="#f59e0b"
              stroke="#fffbeb"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Inter-Town Shuttle Bus Live Dot */}
        {busPos && (
          <g onClick={() => onFocusBus?.()} className="cursor-pointer">
            <rect
              x={Math.max(8, Math.min(126, toMapCoord(busPos.x))) - 3.2}
              y={Math.max(8, Math.min(128, toMapCoord(busPos.z))) - 2.2}
              width="6.4"
              height="4.4"
              rx="1.2"
              fill="#f59e0b"
              stroke="#fef3c7"
              strokeWidth="0.9"
            />
          </g>
        )}

        {/* Walkways */}
        <line
          x1="70"
          y1={toMapCoord(-11)}
          x2="70"
          y2={toMapCoord(11)}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth={compactMarkers ? 3 : 6}
          strokeLinecap="round"
        />
        <line
          x1={toMapCoord(-11)}
          y1={toMapCoord(-0.5)}
          x2={toMapCoord(11)}
          y2={toMapCoord(-0.5)}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth={compactMarkers ? 3 : 6}
          strokeLinecap="round"
        />
        {/* Central Plaza */}
        <circle
          cx="70"
          cy="70"
          r={compactMarkers ? 8 : 14}
          fill="rgba(148,163,184,0.22)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />

        {/* Visible Buildable Plots (8 Core + Unlocked Biome Plots) */}
        {visiblePlots.map((plotId) => {
          const pm = PLOT_META[plotId];
          const cx = toMapCoord(pm.x);
          const cy = toMapCoord(pm.z);
          const st = structureByPlot.get(plotId);
          const isSelected = selectedPlotId === plotId;
          const fillColor = st
            ? st.status === 'complete'
              ? getStructureColor(st)
              : 'rgba(245, 158, 11, 0.35)'
            : 'rgba(15, 23, 42, 0.45)';
          const strokeColor = isSelected
            ? '#ffffff'
            : st
              ? st.status === 'complete'
                ? '#f8fafc'
                : '#f59e0b'
              : 'rgba(148, 163, 184, 0.45)';
          const boxSize = compactMarkers ? 7 : 9;

          return (
            <g
              key={plotId}
              onClick={() => onSelectPlot(plotId)}
              className="cursor-pointer"
            >
              <rect
                x={cx - boxSize / 2}
                y={cy - boxSize / 2}
                width={boxSize}
                height={boxSize}
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
                x={cx - (compactMarkers ? 9 : 12)}
                y={cy - (compactMarkers ? 6.5 : 9)}
                width={compactMarkers ? 18 : 24}
                height={compactMarkers ? 13 : 18}
                rx="3.5"
                fill="rgba(15,23,42,0.9)"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
              />
              <text
                x={cx}
                y={cy + 2.5}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize={compactMarkers ? '6.3' : '8'}
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
              x={toMapCoord(10.6) - (compactMarkers ? 9 : 13)}
              y={toMapCoord(12.2) - (compactMarkers ? 6 : 8)}
              width={compactMarkers ? 18 : 26}
              height={compactMarkers ? 12 : 16}
              rx="3.5"
              fill="rgba(8, 51, 68, 0.92)"
              stroke="#22d3ee"
              strokeWidth="1.2"
            />
            <text
              x={toMapCoord(10.6)}
              y={toMapCoord(12.2) + 2.5}
              textAnchor="middle"
              fill="#a5f3fc"
              fontSize={compactMarkers ? '6' : '7.5'}
              fontWeight="700"
            >
              Relay
            </text>
          </g>
        )}

        {/* Permanent Rival Enemy City (Ironhold Bastion), Ore Railway, Raiders, Air Force & Counter-Raid Squad */}
        {raiderRadar && (() => {
          const cityCx = Math.max(11, Math.min(129, toMapCoord(raiderRadar.cityX)));
          const cityCy = Math.max(11, Math.min(129, toMapCoord(raiderRadar.cityZ)));
          const railRx = (6.8 / worldSpan) * 58;
          const railRy = (5.4 / worldSpan) * 58;
          return (
            <g>
              {/* Ironhold Enemy Ore Railway Loop (once built by Engineer Vex) */}
              {raiderRadar.railBuilt && (
                <ellipse
                  cx={cityCx}
                  cy={cityCy}
                  rx={Math.max(5.5, railRx)}
                  ry={Math.max(4.5, railRy)}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="1.2"
                  strokeDasharray="2.2 1.4"
                  opacity="0.85"
                />
              )}

              {/* Permanent Ironhold Bastion Fortress Marker (click to jump camera) */}
              <g
                onClick={() => (onFocusEnemyCity ? onFocusEnemyCity() : onFocusBattle?.())}
                className="cursor-pointer"
              >
                {raidActive && (
                  <circle cx={cityCx} cy={cityCy} r="7" fill="rgba(239,68,68,0.22)" stroke="#ef4444" strokeWidth="1.2">
                    <animate attributeName="r" values="6;11.5;6" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <polygon
                  points={`${cityCx},${cityCy - 5.2} ${cityCx + 5.2},${cityCy} ${cityCx},${cityCy + 5.2} ${cityCx - 5.2},${cityCy}`}
                  fill={raidActive ? '#dc2626' : '#7f1d1d'}
                  stroke={raidActive ? '#fef08a' : '#fca5a5'}
                  strokeWidth="1.2"
                />
                <text
                  x={cityCx}
                  y={Math.min(134, cityCy + 11.2)}
                  textAnchor="middle"
                  fill={raidActive ? '#fca5a5' : '#fda4af'}
                  fontSize="5.8"
                  fontWeight="800"
                >
                  IRONHOLD
                </text>
              </g>

              {/* Active Marching Enemy Raider Squad Dots */}
              {raidActive &&
                raiderRadar.squad.map((dot, idx) => {
                  const rx = Math.max(8, Math.min(132, toMapCoord(dot.x)));
                  const ry = Math.max(8, Math.min(132, toMapCoord(dot.z)));
                  return (
                    <g
                      key={`raider-dot-${idx}`}
                      onClick={() => onFocusBattle?.()}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={rx}
                        cy={ry}
                        r={dot.isCaptain ? 3.2 : 2.3}
                        fill={dot.isCaptain ? '#f97316' : '#ef4444'}
                        stroke="#ffffff"
                        strokeWidth="0.7"
                      />
                    </g>
                  );
                })}

              {/* Airborne Enemy Attack Helicopters & Fighter Jets */}
              {raiderRadar.aircraft.map((ac, idx) => {
                const ax = Math.max(8, Math.min(132, toMapCoord(ac.x)));
                const ay = Math.max(8, Math.min(132, toMapCoord(ac.z)));
                return (
                  <g
                    key={`enemy-air-${idx}`}
                    onClick={() => onFocusBattle?.()}
                    className="cursor-pointer"
                  >
                    {ac.kind === 'jet' ? (
                      <polygon
                        points={`${ax},${ay - 4.2} ${ax + 3.4},${ay + 3.2} ${ax},${ay + 1.4} ${ax - 3.4},${ay + 3.2}`}
                        fill="#fb923c"
                        stroke="#fffbeb"
                        strokeWidth="0.8"
                      />
                    ) : (
                      <g>
                        <circle cx={ax} cy={ay} r="3" fill="#f43f5e" stroke="#fef08a" strokeWidth="0.8" />
                        <line x1={ax - 4.2} y1={ay} x2={ax + 4.2} y2={ay} stroke="#fef08a" strokeWidth="0.9" />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Active Alderbrook Counter-Raid Strike Squad Dots */}
              {counterActive &&
                raiderRadar.counterSquad.map((dot, idx) => {
                  const cx = Math.max(8, Math.min(132, toMapCoord(dot.x)));
                  const cy = Math.max(8, Math.min(132, toMapCoord(dot.z)));
                  return (
                    <circle
                      key={`counter-dot-${idx}`}
                      cx={cx}
                      cy={cy}
                      r="2.6"
                      fill="#38bdf8"
                      stroke="#fef08a"
                      strokeWidth="0.9"
                    />
                  );
                })}
            </g>
          );
        })()}

        {/* Agents */}
        {agents.map((agent) => {
          const pos = coords[agent.id];
          const cx = pos ? Math.max(8, Math.min(132, toMapCoord(pos.x))) : 70;
          const cy = pos ? Math.max(8, Math.min(132, toMapCoord(pos.z))) : 70;
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
                  r="6.5"
                  fill="none"
                  stroke={agent.accentColor}
                  strokeWidth="1.5"
                  opacity="0.85"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 4.8 : 3.8}
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
