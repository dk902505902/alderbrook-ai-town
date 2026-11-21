import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Play,
  Radio,
  RotateCcw,
  Send,
  Webhook,
  X,
} from 'lucide-react';
import {
  DEFAULT_REMOTE_BRIDGE_CONFIG,
  type RemoteBridgeConfig,
  type RemoteCommandType,
} from '../types/town.ts';

interface RemoteBridgeModalProps {
  isOpen: boolean;
  config: RemoteBridgeConfig;
  uid: string | null;
  recentRemoteCount: number;
  onClose: () => void;
  onSave: (nextConfig: RemoteBridgeConfig) => void;
  onSimulateCommand: (type: RemoteCommandType, value: string) => Promise<void>;
}

const SAMPLE_COMMANDS: Array<{ label: string; type: RemoteCommandType; value: string }> = [
  { label: 'Rain Storm', type: 'set_weather', value: 'rain' },
  { label: 'Build Bakery', type: 'build_structure', value: 'bakery' },
  { label: 'God Decree', type: 'god_decree', value: 'Prepare town reserves for winter' },
  { label: 'Hire Mason', type: 'hire_worker', value: 'Hire a master stone mason' },
];

export function RemoteBridgeModal({
  isOpen,
  config,
  uid,
  recentRemoteCount,
  onClose,
  onSave,
  onSimulateCommand,
}: RemoteBridgeModalProps) {
  const [draft, setDraft] = useState<RemoteBridgeConfig>(config);
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'path' | 'json' | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [simType, setSimType] = useState<RemoteCommandType>('set_weather');
  const [simValue, setSimValue] = useState('rain');
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setShowToken(false);
      setTestResult(null);
      setCopiedKey(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const firestorePath = `/towns/${uid || '<your-user-uid>'}/remoteCommands/{commandId}`;
  const samplePayload = JSON.stringify(
    {
      type: 'set_weather',
      value: 'rain',
      source: 'telegram',
      status: 'pending',
    },
    null,
    2,
  );

  const handleCopy = async (kind: 'path' | 'json', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleTestOutgoing = async (channel: 'webhook' | 'telegram' | 'all') => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        webhookUrl: channel === 'telegram' ? '' : draft.webhookUrl.trim(),
        telegramBotToken: channel === 'webhook' ? '' : draft.telegramBotToken.trim(),
        telegramChatId: channel === 'webhook' ? '' : draft.telegramChatId.trim(),
        eventType: 'bridge_test',
        title: 'Alderbrook Remote Bridge Connected',
        message: 'Test alert from Alderbrook AI Town! Outgoing notifications are active.',
      };

      const res = await fetch('/api/bridge/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        webhook?: { ok: boolean; status?: number; error?: string };
        telegram?: { ok: boolean; status?: number; error?: string };
      };

      const notes: string[] = [];
      if (data.webhook) {
        notes.push(
          data.webhook.ok
            ? `Webhook OK (${data.webhook.status ?? 200})`
            : `Webhook error: ${data.webhook.error || 'failed'}`,
        );
      }
      if (data.telegram) {
        notes.push(
          data.telegram.ok
            ? 'Telegram message sent!'
            : `Telegram error: ${data.telegram.error || 'failed'}`,
        );
      }
      if (notes.length === 0 && data.error) {
        notes.push(data.error);
      }

      setTestResult({
        ok: Boolean(data.ok),
        message: notes.join(' · ') || 'Notification test completed.',
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Network error during bridge test.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleQueueTestCommand = async () => {
    if (!uid || !simValue.trim() || simBusy) return;
    setSimBusy(true);
    setTestResult(null);
    try {
      await onSimulateCommand(simType, simValue.trim());
      setTestResult({
        ok: true,
        message: `Queued remote command (${simType}: "${simValue.trim()}"). Listener will execute it live.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to queue remote command.',
      });
    } finally {
      setSimBusy(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...draft,
      webhookUrl: draft.webhookUrl.trim(),
      telegramBotToken: draft.telegramBotToken.trim(),
      telegramChatId: draft.telegramChatId.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-bridge-title"
    >
      <form
        onSubmit={handleSave}
        className="flex h-[100dvh] w-full flex-col bg-slate-900 text-slate-100 md:h-auto md:max-h-[90dvh] md:max-w-xl md:rounded-2xl md:border md:border-white/10 md:shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <h2 id="remote-bridge-title" className="font-display text-lg font-semibold text-white">
                Remote Bridge
              </h2>
              <p className="text-xs text-slate-400">
                Firestore live listener &amp; Telegram / Webhook alerts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Remote Bridge"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="hud-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Section 1: Incoming Real-Time Listener */}
          <div className="space-y-3 rounded-2xl border border-emerald-500/25 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    uid ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-500'
                  }`}
                />
                <span className="text-xs font-semibold tracking-wide text-white uppercase">
                  Incoming Firestore Listener
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {uid
                  ? `Active (${recentRemoteCount} executed)`
                  : 'Sign in (Cloud Save) to enable'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Collection Path</span>
                <button
                  type="button"
                  onClick={() => void handleCopy('path', firestorePath)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-emerald-300 hover:bg-white/5"
                >
                  {copiedKey === 'path' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'path' ? 'Copied' : 'Copy Path'}</span>
                </button>
              </div>
              <code className="block overflow-x-auto rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-200">
                {firestorePath}
              </code>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  Document Schema (<code>set_weather</code>, <code>hire_worker</code>, <code>god_decree</code>, <code>build_structure</code>, <code>build_plot</code>)
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy('json', samplePayload)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-emerald-300 hover:bg-white/5"
                >
                  {copiedKey === 'json' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'json' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300">
                {samplePayload}
              </pre>
            </div>

            {uid && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <span className="block text-xs font-medium text-slate-300">
                  Test Live Listener (writes pending command to Firestore)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_COMMANDS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSimType(preset.type);
                        setSimValue(preset.value);
                      }}
                      className="min-h-[34px] rounded-lg border border-white/10 bg-slate-900 px-2.5 text-xs text-slate-300 hover:border-emerald-400/50 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label="Test command type"
                    value={simType}
                    onChange={(e) => setSimType(e.target.value as RemoteCommandType)}
                    className="min-h-[44px] rounded-xl border border-white/10 bg-slate-900 px-3 text-base text-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="set_weather">set_weather</option>
                    <option value="build_structure">build_structure</option>
                    <option value="build_plot">build_plot</option>
                    <option value="hire_worker">hire_worker</option>
                    <option value="god_decree">god_decree</option>
                  </select>
                  <input
                    type="text"
                    value={simValue}
                    onChange={(e) => setSimValue(e.target.value)}
                    placeholder="Value (e.g., rain or bakery)"
                    className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-base text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={simBusy || !simValue.trim()}
                    onClick={() => void handleQueueTestCommand()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    <span>{simBusy ? 'Sending...' : 'Send'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Webhook Notification URL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="bridge-webhook-url" className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Webhook className="h-3.5 w-3.5 text-amber-300" />
                <span>Webhook Notification URL (HTTPS POST)</span>
              </label>
              <button
                type="button"
                disabled={testing || !draft.webhookUrl.trim()}
                onClick={() => void handleTestOutgoing('webhook')}
                className="min-h-[34px] rounded-lg border border-white/10 bg-slate-800 px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                Test Webhook
              </button>
            </div>
            <input
              id="bridge-webhook-url"
              type="url"
              value={draft.webhookUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, webhookUrl: e.target.value }))}
              placeholder="https://example.com/alderbrook-webhook"
              className="min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Section 3: Telegram Bot Integration */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-sky-300 uppercase">
                Telegram Bot Alerts (Optional)
              </span>
              <button
                type="button"
                disabled={testing || !draft.telegramBotToken.trim() || !draft.telegramChatId.trim()}
                onClick={() => void handleTestOutgoing('telegram')}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2.5 text-xs font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Test Telegram</span>
              </button>
            </div>

            <div>
              <label htmlFor="tg-bot-token" className="block text-xs font-medium text-slate-300">
                Telegram Bot Token
              </label>
              <div className="relative mt-1.5 flex items-center">
                <input
                  id="tg-bot-token"
                  type={showToken ? 'text' : 'password'}
                  value={draft.telegramBotToken}
                  onChange={(e) => setDraft((prev) => ({ ...prev, telegramBotToken: e.target.value }))}
                  placeholder="123456789:ABCdefGHIjklMNO..."
                  autoComplete="off"
                  className="min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 py-2 pr-12 pl-3.5 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  aria-label={showToken ? 'Hide bot token' : 'Show bot token'}
                  className="absolute right-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:text-white"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="tg-chat-id" className="block text-xs font-medium text-slate-300">
                Telegram Chat ID
              </label>
              <input
                id="tg-chat-id"
                type="text"
                value={draft.telegramChatId}
                onChange={(e) => setDraft((prev) => ({ ...prev, telegramChatId: e.target.value }))}
                placeholder="123456789 or @channel_name"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 4: Outgoing Event Triggers */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">
              Outgoing Notification Events
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  { key: 'notifyOnBuildComplete', label: 'Building completed' },
                  { key: 'notifyOnTier3', label: 'Building reaches Tier 3' },
                  { key: 'notifyOnWeatherShift', label: 'Season / Storm hits' },
                  { key: 'notifyOnRemoteCommand', label: 'Remote command executed' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-200 hover:border-white/20"
                >
                  <input
                    type="checkbox"
                    checked={draft[item.key]}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [item.key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 accent-amber-400"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {testResult && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-sm ${
                testResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              setDraft(DEFAULT_REMOTE_BRIDGE_CONFIG);
              setTestResult(null);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </button>

          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Check className="h-4 w-4" />
            <span>Save Bridge</span>
          </button>
        </div>
      </form>
    </div>
  );
}
