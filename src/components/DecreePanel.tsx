import { useState } from 'react';
import { CloudRain, Clock, Gauge, Moon, Palette, RotateCcw, Send, Snowflake, Sun, Sunrise, Sunset } from 'lucide-react';
import {
  ALL_TOWN_THEMES,
  TOWN_THEME_META,
  type GraphicsQuality,
  type TimeOfDay,
  type TownTheme,
  type WeatherMode,
} from '../types/town.ts';

interface DecreePanelProps {
  activeDecree: string;
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  townTheme: TownTheme;
  graphicsQuality: GraphicsQuality;
  turnIntervalSeconds: number;
  onIssueDecree: (text: string) => void;
  onChangeTimeOfDay: (tod: TimeOfDay) => void;
  onChangeWeather: (w: WeatherMode) => void;
  onChangeTownTheme: (theme: TownTheme) => void;
  onChangeGraphicsQuality: (q: GraphicsQuality) => void;
  onChangeTurnInterval: (seconds: number) => void;
  onResetTown: () => void;
}

const SAMPLE_DECREES = [
  'Build an artisan bakery and a guard watchtower around the square.',
  'Construct a windmill and greenhouse to boost town prosperity.',
  'Restore the Park fountain and build a quiet garden pavilion.',
];

const TIME_OPTIONS: Array<{ id: TimeOfDay; label: string; Icon: typeof Sun }> = [
  { id: 'dawn', label: 'Dawn', Icon: Sunrise },
  { id: 'day', label: 'Day', Icon: Sun },
  { id: 'twilight', label: 'Dusk', Icon: Sunset },
  { id: 'night', label: 'Night', Icon: Moon },
];

const WEATHER_OPTIONS: Array<{ id: WeatherMode; label: string; Icon: typeof Sun }> = [
  { id: 'summer', label: 'Summer', Icon: Sun },
  { id: 'rain', label: 'Rain', Icon: CloudRain },
  { id: 'winter', label: 'Winter', Icon: Snowflake },
];

const SPEED_OPTIONS = [4, 8, 15];

const QUALITY_OPTIONS: Array<{ id: GraphicsQuality; label: string; summary: string }> = [
  { id: 'low', label: 'Low', summary: 'Battery saver · Crisp 1x DPR, lights & fog only' },
  { id: 'medium', label: 'Medium', summary: 'Mobile balanced · Shadows off, glowing lights & fog' },
  {
    id: 'high',
    label: 'High',
    summary: 'Cinematic · Bloom, vignette, 2048² shadows, 2× DPR (auto-falls back under 45 fps)',
  },
];

export function DecreePanel({
  activeDecree,
  timeOfDay,
  weather,
  townTheme,
  graphicsQuality,
  turnIntervalSeconds,
  onIssueDecree,
  onChangeTimeOfDay,
  onChangeWeather,
  onChangeTownTheme,
  onChangeGraphicsQuality,
  onChangeTurnInterval,
  onResetTown,
}: DecreePanelProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = text.trim();
    if (!cleaned) return;
    onIssueDecree(cleaned);
    setText('');
  };

  return (
    <div className="flex flex-col gap-3 p-3.5">
      {activeDecree && (
        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2">
          <div className="text-xs font-medium text-amber-300">Active Civic Decree</div>
          <p className="mt-0.5 text-xs leading-snug text-amber-50">{activeDecree}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="god-decree-input" className="block text-xs font-medium text-slate-300">
          Issue God Decree to Mayor Sterling
        </label>
        <div className="flex gap-2">
          <input
            id="god-decree-input"
            type="text"
            maxLength={280}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Command the town..."
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send Decree"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Issue</span>
          </button>
        </div>
      </form>

      {/* Quick Suggestions */}
      <div className="flex flex-col gap-1.5">
        {SAMPLE_DECREES.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => onIssueDecree(sample)}
            className="min-h-[40px] rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1.5 text-left text-xs leading-snug text-slate-300 transition-colors hover:border-white/25 hover:bg-slate-800 hover:text-white"
          >
            {sample}
          </button>
        ))}
      </div>

      {/* Atmosphere & Turn Pacing Controls */}
      <div className="space-y-2.5 border-t border-white/10 pt-2.5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Palette className="h-3 w-3" />
              <span>World Theme</span>
            </span>
            <span className="text-[11px] text-slate-400">
              {TOWN_THEME_META[townTheme].label}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {ALL_TOWN_THEMES.map((id) => {
              const meta = TOWN_THEME_META[id];
              const isSelected = townTheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeTownTheme(id)}
                  aria-pressed={isSelected}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {meta.swatches.map((hex) => (
                      <span
                        key={hex}
                        className="h-2 w-2 rounded-full border border-white/25"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </span>
                  <span className="leading-none">{meta.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            {TOWN_THEME_META[townTheme].summary}
          </p>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-slate-400">Time of Day</span>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {TIME_OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTimeOfDay(id)}
                className={`flex min-h-[44px] items-center justify-center gap-1 rounded-lg border text-xs font-medium transition-colors ${
                  timeOfDay === id
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[11px] font-medium text-slate-400">
              Weather · {WEATHER_OPTIONS.find((o) => o.id === weather)?.label ?? 'Summer'}
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {WEATHER_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeWeather(id)}
                  title={label}
                  aria-label={`Weather: ${label}`}
                  className={`flex min-h-[44px] items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                    weather === id
                      ? id === 'summer'
                        ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                        : id === 'winter'
                          ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200'
                          : 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                      : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Clock className="h-3 w-3" />
              <span>Turn Pace</span>
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {SPEED_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangeTurnInterval(sec)}
                  className={`min-h-[44px] rounded-lg border font-mono-tabular text-xs font-medium transition-colors ${
                    turnIntervalSeconds === sec
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Gauge className="h-3 w-3" />
              <span>Graphics Quality</span>
            </span>
            <span className="text-[11px] text-slate-500">
              {QUALITY_OPTIONS.find((q) => q.id === graphicsQuality)?.label ?? 'Medium'}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {QUALITY_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onChangeGraphicsQuality(id)}
                className={`min-h-[44px] rounded-lg border text-xs font-medium transition-colors ${
                  graphicsQuality === id
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-slate-900/70 text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            {QUALITY_OPTIONS.find((q) => q.id === graphicsQuality)?.summary}
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 pt-2">
        <button
          type="button"
          onClick={onResetTown}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Town Simulation</span>
        </button>
      </div>
    </div>
  );
}
