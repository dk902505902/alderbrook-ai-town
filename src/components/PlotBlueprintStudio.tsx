import { useEffect, useState } from 'react';
import { Building2, Hammer, Sparkles, X } from 'lucide-react';
import {
  generateFallbackBuildingBlueprint,
  PLOT_META,
  type BuildingBlueprint,
  type BuildingRoofStyle,
  type PlotId,
  type StructureType,
} from '../types/town.ts';

interface PlotBlueprintStudioProps {
  open: boolean;
  plotId: PlotId | null;
  initialBlueprint?: BuildingBlueprint | null;
  isRemodel?: boolean;
  onClose: () => void;
  onBuildOnPlot: (
    plotId: PlotId,
    structureType: StructureType,
    blueprint?: BuildingBlueprint,
  ) => void;
}

const ROOF_OPTIONS: Array<{ value: BuildingRoofStyle; label: string }> = [
  { value: 'gable', label: 'Gable' },
  { value: 'dome', label: 'Dome' },
  { value: 'flat_helipad', label: 'Flat / Helipad' },
  { value: 'pagoda', label: 'Pagoda' },
  { value: 'spire', label: 'Spire' },
];

const PRIMARY_SWATCHES = [
  '#f1e8d9',
  '#334155',
  '#0f766e',
  '#b45309',
  '#4338ca',
  '#9f1239',
  '#cbd5e1',
  '#1e293b',
];

const ACCENT_SWATCHES = [
  '#f59e0b',
  '#06b6d4',
  '#10b981',
  '#ec4899',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#e2e8f0',
];

const GLOW_SWATCHES = ['#fde68a', '#67e8f9', '#6ee7b7', '#f9a8d4', '#fed7aa', '#c4b5fd'];

const QUICK_PRESETS: Array<{
  label: string;
  structureType: StructureType;
  prompt?: string;
  summary: string;
}> = [
  {
    label: '5-Story Apartment',
    structureType: 'apartment',
    prompt: '5-Story Sunlit Terrace Apartments',
    summary: '+32 crowd housing · rent income',
  },
  {
    label: 'Futuristic Sky-Tower',
    structureType: 'custom',
    prompt: '6-Story Neon Sky-Tower with Helipad',
    summary: '6F spire · high prestige',
  },
  {
    label: 'Crystal Dome Temple',
    structureType: 'custom',
    prompt: 'Crystal Dome Civic Temple',
    summary: 'Dome roof · boosts morale',
  },
  {
    label: 'Pagoda Flats',
    structureType: 'apartment',
    prompt: '4-Story Crimson Pagoda Apartments',
    summary: '+24 crowd housing · pagoda roof',
  },
  {
    label: 'Artisan Bakery',
    structureType: 'bakery',
    summary: 'Food coverage · cozy smoke',
  },
  {
    label: 'Town Hospital',
    structureType: 'hospital',
    summary: 'Safety & medic coverage',
  },
  {
    label: 'Triple-Gun Tower',
    structureType: 'triple_gun_tower',
    summary: 'Anti-raid defense turret',
  },
];

export function PlotBlueprintStudio({
  open,
  plotId,
  initialBlueprint = null,
  isRemodel = false,
  onClose,
  onBuildOnPlot,
}: PlotBlueprintStudioProps) {
  const [prompt, setPrompt] = useState('5-Story Terrace Apartment');
  const [blueprint, setBlueprint] = useState<BuildingBlueprint>(() =>
    initialBlueprint ? { ...initialBlueprint } : generateFallbackBuildingBlueprint('5-Story Terrace Apartment'),
  );

  useEffect(() => {
    if (!open) return;
    if (initialBlueprint) {
      setPrompt(initialBlueprint.name);
      setBlueprint({ ...initialBlueprint });
    } else {
      setPrompt('5-Story Terrace Apartment');
      setBlueprint(generateFallbackBuildingBlueprint('5-Story Terrace Apartment'));
    }
  }, [open, plotId, initialBlueprint]);

  if (!open || !plotId) return null;

  const plotMeta = PLOT_META[plotId];
  const isApartment = blueprint.apartmentCapacity > 0;

  const handleGenerateFromPrompt = () => {
    const cleaned = prompt.trim() || 'Civic Landmark';
    setBlueprint(generateFallbackBuildingBlueprint(cleaned));
  };

  const handleBuildProcedural = () => {
    const type: StructureType = blueprint.apartmentCapacity > 0 ? 'apartment' : 'custom';
    onBuildOnPlot(plotId, type, {
      ...blueprint,
      name: blueprint.name.trim() || 'Procedural Landmark',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-amber-300">
              {plotMeta.label} · {plotMeta.biome ? `${plotMeta.biome} district` : 'Town Core'}
            </div>
            <h2 className="truncate font-display text-base font-semibold text-white">
              {isRemodel ? 'Remodel Building Blueprint' : 'Plot Blueprint Studio'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Blueprint Studio"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5 text-xs">
          {/* Quick 1-Tap Presets */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">
              One-Tap Blueprints
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    if (preset.prompt) {
                      const bp = generateFallbackBuildingBlueprint(preset.prompt);
                      onBuildOnPlot(plotId, preset.structureType, bp);
                    } else {
                      onBuildOnPlot(plotId, preset.structureType);
                    }
                    onClose();
                  }}
                  className="flex min-h-[48px] flex-col items-start justify-center rounded-xl border border-white/10 bg-slate-900 px-2.5 py-2 text-left transition-colors hover:border-amber-400/45 hover:bg-slate-800"
                >
                  <span className="font-semibold text-white">{preset.label}</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">{preset.summary}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt-to-Blueprint Generator */}
          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
            <label
              htmlFor="blueprint-prompt-input"
              className="mb-1.5 block text-[11px] font-medium text-slate-300"
            >
              Describe Any Custom Building
            </label>
            <div className="flex gap-2">
              <input
                id="blueprint-prompt-input"
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleGenerateFromPrompt();
                  }
                }}
                placeholder="e.g., 4-story glass rooftop cafe..."
                className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleGenerateFromPrompt}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 font-semibold text-cyan-200 hover:bg-cyan-500/25"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Design</span>
              </button>
            </div>
          </div>

          {/* Fine-Tune Architectural Controls */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Architectural Specs</span>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {blueprint.floors}F · {blueprint.width.toFixed(1)}×{blueprint.depth.toFixed(1)}m ·{' '}
                {isApartment ? `+${blueprint.apartmentCapacity} residents` : 'Civic Landmark'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Building Name</label>
                <input
                  type="text"
                  maxLength={36}
                  value={blueprint.name}
                  onChange={(e) => setBlueprint((prev) => ({ ...prev, name: e.target.value }))}
                  className="min-h-[38px] w-full rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Roof Style</label>
                <select
                  value={blueprint.roofStyle}
                  onChange={(e) =>
                    setBlueprint((prev) => ({
                      ...prev,
                      roofStyle: e.target.value as BuildingRoofStyle,
                    }))
                  }
                  className="min-h-[38px] w-full rounded-lg border border-white/15 bg-slate-950 px-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  {ROOF_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Floors</span>
                  <span className="font-mono-tabular font-semibold text-white">
                    {blueprint.floors}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={blueprint.floors}
                  onChange={(e) => {
                    const floors = Number(e.target.value);
                    setBlueprint((prev) => ({
                      ...prev,
                      floors,
                      apartmentCapacity:
                        prev.apartmentCapacity > 0 ? Math.min(40, floors * 6 + 2) : 0,
                    }));
                  }}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Apartment Capacity</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    {blueprint.apartmentCapacity}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={4}
                  value={blueprint.apartmentCapacity}
                  onChange={(e) =>
                    setBlueprint((prev) => ({
                      ...prev,
                      apartmentCapacity: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-emerald-400"
                />
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Wall</span>
                <div className="flex flex-wrap gap-1.5">
                  {PRIMARY_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Primary color ${hex}`}
                      onClick={() => setBlueprint((prev) => ({ ...prev, primaryColor: hex }))}
                      className={`h-6 w-6 rounded-md border ${
                        blueprint.primaryColor.toLowerCase() === hex
                          ? 'scale-110 border-white ring-2 ring-amber-400'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Roof & Trim</span>
                <div className="flex flex-wrap gap-1.5">
                  {ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Accent color ${hex}`}
                      onClick={() => setBlueprint((prev) => ({ ...prev, accentColor: hex }))}
                      className={`h-6 w-6 rounded-md border ${
                        blueprint.accentColor.toLowerCase() === hex
                          ? 'scale-110 border-white ring-2 ring-amber-400'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Window Glow</span>
                <div className="flex flex-wrap gap-1.5">
                  {GLOW_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Window glow ${hex}`}
                      onClick={() => setBlueprint((prev) => ({ ...prev, windowGlow: hex }))}
                      className={`h-6 w-6 rounded-md border ${
                        blueprint.windowGlow.toLowerCase() === hex
                          ? 'scale-110 border-white ring-2 ring-amber-400'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <label className="flex min-h-[36px] cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3">
              <span className="text-xs text-slate-200">Include Exterior Balconies</span>
              <input
                type="checkbox"
                checked={blueprint.hasBalconies}
                onChange={(e) =>
                  setBlueprint((prev) => ({ ...prev, hasBalconies: e.target.checked }))
                }
                className="h-4 w-4 accent-amber-400"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-slate-900/80 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Building2 className="h-4 w-4 text-amber-300" />
            <span className="truncate font-medium">{blueprint.name || 'Custom Building'}</span>
          </div>
          <button
            type="button"
            onClick={handleBuildProcedural}
            className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Hammer className="h-4 w-4" />
            <span>Build on {plotMeta.label}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
