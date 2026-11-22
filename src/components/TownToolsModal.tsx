import { useEffect, useState } from 'react';
import { ArrowRightLeft, BookOpen, Save, X } from 'lucide-react';
import { RESOURCE_META, RESOURCE_IDS, type TownResources } from '../lib/economy.ts';
import {
  EXCHANGE_OFFERS,
  applyExchange,
  type ExchangeOffer,
} from '../lib/resourceExchange.ts';
import { loadJournal, saveJournal } from '../lib/townJournal.ts';

type ToolTab = 'exchange' | 'journal';

interface TownToolsModalProps {
  isOpen: boolean;
  townId: string;
  townName: string;
  resources: TownResources;
  caps: TownResources;
  onClose: () => void;
  onExchange: (next: TownResources, summary: string) => void;
}

export function TownToolsModal({
  isOpen,
  townId,
  townName,
  resources,
  caps,
  onClose,
  onExchange,
}: TownToolsModalProps) {
  const [tab, setTab] = useState<ToolTab>('exchange');
  const [selectedOfferId, setSelectedOfferId] = useState(EXCHANGE_OFFERS[0].id);
  const [bundles, setBundles] = useState(1);
  const [journal, setJournal] = useState('');
  const [journalSavedAt, setJournalSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setJournal(loadJournal(townId));
    setJournalSavedAt(null);
  }, [isOpen, townId]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      saveJournal(townId, journal);
      setJournalSavedAt(Date.now());
    }, 700);
    return () => window.clearTimeout(timer);
  }, [journal, isOpen, townId]);

  if (!isOpen) return null;

  const offer = EXCHANGE_OFFERS.find((entry) => entry.id === selectedOfferId) ?? EXCHANGE_OFFERS[0];
  const costAmount = offer.rateFrom * bundles;
  const gainAmount = offer.rateTo * bundles;
  const canTrade =
    resources[offer.from] >= costAmount &&
    resources[offer.to] + gainAmount <= caps[offer.to];

  const handleTrade = () => {
    const next = applyExchange(resources, caps, offer, bundles);
    if (!next) return;
    onExchange(
      next,
      `${offer.label}: spent ${costAmount} ${RESOURCE_META[offer.from].label}, gained ${gainAmount} ${RESOURCE_META[offer.to].label}.`,
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-3 py-6 backdrop-blur-sm md:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Town Tools</h2>
            <p className="text-xs text-slate-400">
              {townName} · Market exchange and the town journal
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close town tools"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => setTab('exchange')}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
              tab === 'exchange'
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Exchange
          </button>
          <button
            type="button"
            onClick={() => setTab('journal')}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
              tab === 'journal'
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" /> Journal
          </button>
        </div>

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'exchange' && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-slate-400">
                Trade surplus resources at the Market. Conversions respect town storage caps.
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                  Conversion
                </span>
                <select
                  value={selectedOfferId}
                  onChange={(event) => setSelectedOfferId(event.target.value)}
                  className="min-h-[40px] rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-white"
                >
                  {EXCHANGE_OFFERS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500">{offer.summary}</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                  Bundles
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBundles((value) => Math.max(1, value - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={bundles}
                    onChange={(event) =>
                      setBundles(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
                    }
                    className="min-h-[40px] flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 text-center text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setBundles((value) => Math.min(99, value + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                  >
                    +
                  </button>
                </div>
              </label>

              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">You spend</span>
                  <span className="font-mono-tabular font-semibold text-rose-300">
                    −{costAmount} {RESOURCE_META[offer.from].label}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">You receive</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    +{gainAmount} {RESOURCE_META[offer.to].label}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    {RESOURCE_META[offer.from].label}: {resources[offer.from]} / {caps[offer.from]}
                  </span>
                  <span>
                    {RESOURCE_META[offer.to].label}: {resources[offer.to]} / {caps[offer.to]}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTrade}
                disabled={!canTrade}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Trade now
              </button>
              {!canTrade && (
                <p className="text-[11px] text-rose-300">
                  Not enough stock or the receiving store is full.
                </p>
              )}
            </div>
          )}

          {tab === 'journal' && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-slate-400">
                A private notebook for this town. Saved automatically to this browser.
              </p>
              <textarea
                value={journal}
                onChange={(event) => setJournal(event.target.value)}
                rows={12}
                placeholder="Notes, plans, reminders for the Mayor's eyes only…"
                className="min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400/40 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500">
                {journalSavedAt
                  ? `Saved ${new Date(journalSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Type to save…'}
                {' · '}
                {journal.length}/8000
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          <Save className="mr-1 inline h-3 w-3" /> Journal is local to this browser slot.
        </div>
      </div>
    </div>
  );
}
