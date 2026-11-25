import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Compass,
  FastForward,
  Flame,
  Footprints,
  MapPin,
  Search,
  Sparkles,
  Undo2,
  User,
  X,
} from 'lucide-react';
import {
  getStructureDisplayLabel,
  PLOT_META,
  type AgentId,
  type AgentRecord,
  type CameraBookmark,
  type PlotId,
  type TownStructure,
} from '../types/town.ts';

export interface PaletteActionItem {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  run: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  agents: AgentRecord[];
  structures: TownStructure[];
  cameraBookmarks: CameraBookmark[];
  onFocusAgent: (id: AgentId) => void;
  onFocusPlot: (plotId: PlotId) => void;
  onGlideBookmark: (bm: CameraBookmark) => void;
  quickActions: PaletteActionItem[];
}

export function CommandPaletteModal({
  open,
  onClose,
  agents,
  structures,
  cameraBookmarks,
  onFocusAgent,
  onFocusPlot,
  onGlideBookmark,
  quickActions,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const allItems = useMemo<PaletteActionItem[]>(() => {
    const items: PaletteActionItem[] = [...quickActions];

    for (const bm of cameraBookmarks) {
      items.push({
        id: `bm-${bm.id}`,
        category: 'Camera',
        title: bm.name,
        subtitle: `Saved viewpoint · FOV ${bm.fov}°`,
        run: () => onGlideBookmark(bm),
      });
    }

    for (const a of agents) {
      items.push({
        id: `agent-${a.id}`,
        category: 'Villager',
        title: a.name,
        subtitle: `${a.role} · ${a.location.replace('_', ' ')}`,
        run: () => onFocusAgent(a.id),
      });
    }

    for (const s of structures) {
      items.push({
        id: `struct-${s.plotId}`,
        category: 'Building',
        title: getStructureDisplayLabel(s),
        subtitle: `${PLOT_META[s.plotId].label} · Tier ${s.tier}`,
        run: () => onFocusPlot(s.plotId),
      });
    }

    return items;
  }, [agents, structures, cameraBookmarks, quickActions, onFocusAgent, onFocusPlot, onGlideBookmark]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 16);
    return allItems
      .filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.subtitle.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q),
      )
      .slice(0, 18);
  }, [allItems, query]);

  if (!open) return null;

  const iconForCategory = (cat: string) => {
    if (cat === 'Villager') return <User className="h-3.5 w-3.5 text-cyan-300" />;
    if (cat === 'Building') return <Building2 className="h-3.5 w-3.5 text-amber-300" />;
    if (cat === 'Camera') return <Camera className="h-3.5 w-3.5 text-emerald-300" />;
    if (cat === 'Festival') return <Flame className="h-3.5 w-3.5 text-rose-300" />;
    if (cat === 'Time') return <FastForward className="h-3.5 w-3.5 text-amber-300" />;
    if (cat === 'History') return <Undo2 className="h-3.5 w-3.5 text-slate-300" />;
    if (cat === 'Walk') return <Footprints className="h-3.5 w-3.5 text-emerald-300" />;
    if (cat === 'Plot') return <MapPin className="h-3.5 w-3.5 text-amber-300" />;
    if (cat === 'Studio') return <Sparkles className="h-3.5 w-3.5 text-amber-300" />;
    return <Compass className="h-3.5 w-3.5 text-slate-300" />;
  };

  return (
    <div
      className="fixed inset-0 z-55 flex items-start justify-center bg-slate-950/75 px-3 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="flex max-h-[72dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-amber-300" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) {
                filtered[0].run();
                onClose();
              }
            }}
            placeholder="Jump to villager, building, camera, or action..."
            className="min-h-[38px] min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick command palette"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-400">
              No matching town command, villager, or building.
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {iconForCategory(item.category)}
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{item.title}</div>
                      <div className="truncate text-[11px] text-slate-400">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">{item.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
