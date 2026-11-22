import { AlertTriangle, Coins, Mountain, TreePine, Wheat } from 'lucide-react';
import {
  RESOURCE_IDS,
  RESOURCE_META,
  formatResourceDelta,
  type TownResourceFlow,
  type TownResources,
} from '../lib/economy.ts';

interface ResourceBarProps {
  resources: TownResources;
  flow: TownResourceFlow;
}

const RESOURCE_ICONS = {
  timber: TreePine,
  stone: Mountain,
  food: Wheat,
  gold: Coins,
} as const;

export function ResourceBar({ resources, flow }: ResourceBarProps) {
  return (
    <div className="flex flex-col gap-1 px-3.5 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
          Town Stores
        </span>
        <span
          className={`text-[11px] font-medium ${
            flow.starvation ? 'text-rose-300' : flow.net.food >= 0 ? 'text-emerald-300' : 'text-amber-300'
          }`}
        >
          {flow.net.food >= 0
            ? `+${flow.net.food} food / turn`
            : `${flow.net.food} food / turn`}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {RESOURCE_IDS.map((id) => {
          const Icon = RESOURCE_ICONS[id];
          const meta = RESOURCE_META[id];
          const value = resources[id];
          const cap = flow.caps[id];
          const net = flow.net[id];
          const full = value >= cap;
          const low = value <= cap * 0.15;
          return (
            <div
              key={id}
              title={`${meta.label}: ${value} / ${cap} (${formatResourceDelta(net)} per turn)`}
              className={`flex min-h-[46px] flex-col justify-center gap-0.5 rounded-lg border px-1.5 py-1 ${
                full
                  ? 'border-amber-400/50 bg-amber-500/10'
                  : low
                    ? 'border-rose-400/40 bg-rose-500/10'
                    : 'border-white/10 bg-slate-900/70'
              }`}
            >
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Icon className="h-3 w-3 shrink-0" style={{ color: meta.color }} aria-hidden="true" />
                <span className="truncate">{meta.label}</span>
              </span>
              <span className="flex items-baseline gap-1 font-mono-tabular text-xs font-semibold text-white">
                <span>{value}</span>
                <span className="text-[10px] font-normal text-slate-500">/{cap}</span>
                <span
                  className={`ml-auto text-[10px] font-medium ${
                    net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}
                >
                  {formatResourceDelta(net)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          {flow.upkeep.food} villagers eat {flow.upkeep.food} food / turn
        </span>
        {flow.starvation && (
          <span className="flex items-center gap-1 font-semibold text-rose-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Starving — morale falling
          </span>
        )}
      </div>
    </div>
  );
}
