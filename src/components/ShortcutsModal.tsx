import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: '⌘K / Ctrl+K', action: 'Open the command palette' },
  { keys: '⌘Z / Ctrl+Z', action: 'Undo the last town change' },
  { keys: '?', action: 'Show this shortcut sheet' },
  { keys: 'Space', action: 'Play or pause the turn timer' },
  { keys: 'M', action: 'Toggle the town radar' },
  { keys: 'Esc', action: 'Close the palette or this sheet' },
  { keys: 'Enter', action: 'Run the highlighted palette action' },
  { keys: '↑ / ↓', action: 'Move through palette results' },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
            <Keyboard className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="divide-y divide-white/5">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-xs text-slate-300">{shortcut.action}</dt>
              <dd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                {shortcut.keys}
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          Shortcuts are ignored while typing in a text field.
        </p>
      </div>
    </div>
  );
}
