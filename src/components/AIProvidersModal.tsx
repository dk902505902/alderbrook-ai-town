import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, HelpCircle, RotateCcw, Wifi, X } from 'lucide-react';
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_PROVIDER_CONFIG,
  type AIProviderConfig,
  type AIProviderPreset,
} from '../types/town.ts';

interface AIProvidersModalProps {
  isOpen: boolean;
  config: AIProviderConfig;
  webhookUrl: string;
  hasServerDefaultKey: boolean;
  onClose: () => void;
  onSave: (nextConfig: AIProviderConfig, nextWebhookUrl: string) => void;
  onOpenRemoteBridge: () => void;
  onOpenHelp: () => void;
}

const SUGGESTED_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'llama-3.3-70b-versatile',
  'gpt-4o-mini',
];

export function AIProvidersModal({
  isOpen,
  config,
  webhookUrl,
  hasServerDefaultKey,
  onClose,
  onSave,
  onOpenRemoteBridge,
  onOpenHelp,
}: AIProvidersModalProps) {
  const [draft, setDraft] = useState<AIProviderConfig>(config);
  const [draftWebhookUrl, setDraftWebhookUrl] = useState(webhookUrl);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setDraftWebhookUrl(webhookUrl);
      setTestResult(null);
      setShowKey(false);
    }
  }, [isOpen, config, webhookUrl]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetId: AIProviderPreset) => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTestResult(null);
    setDraft((prev) => ({
      ...prev,
      preset: preset.id,
      baseUrl: preset.id === 'custom' ? prev.baseUrl : preset.baseUrl,
      modelName: preset.id === 'custom' ? prev.modelName : preset.defaultModel,
    }));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-base-url': draft.baseUrl.trim(),
          'x-ai-model-name': draft.modelName.trim(),
          'x-ai-api-key': draft.apiKey.trim(),
        },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        modelName?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: `Connected to ${data.modelName || draft.modelName} in ${data.latencyMs ?? 0}ms`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'Connection test failed.',
        });
      }
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Network error during test.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(
      {
        preset: draft.preset,
        baseUrl: draft.baseUrl.trim(),
        modelName: draft.modelName.trim() || DEFAULT_PROVIDER_CONFIG.modelName,
        apiKey: draft.apiKey.trim(),
      },
      draftWebhookUrl.trim(),
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-providers-title"
    >
      <form
        onSubmit={handleSave}
        className="flex h-[100dvh] w-full flex-col bg-slate-900 text-slate-100 md:h-auto md:max-h-[90dvh] md:max-w-lg md:rounded-2xl md:border md:border-white/10 md:shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div>
            <h2 id="ai-providers-title" className="font-display text-lg font-semibold text-white">
              AI Providers
            </h2>
            <p className="text-xs text-slate-400">
              OpenAI-compatible endpoint stored locally in your browser
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="hud-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Provider Presets */}
          <div>
            <span className="block text-xs font-medium text-slate-300">Provider Preset</span>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AI_PROVIDER_PRESETS.map((preset) => {
                const active = draft.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                        : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Base URL */}
          <div>
            <label htmlFor="ai-base-url" className="block text-xs font-medium text-slate-300">
              API Base URL
            </label>
            <input
              id="ai-base-url"
              type="url"
              value={draft.baseUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Model Name */}
          <div>
            <label htmlFor="ai-model-name" className="block text-xs font-medium text-slate-300">
              Model Name
            </label>
            <input
              id="ai-model-name"
              type="text"
              value={draft.modelName}
              onChange={(e) => setDraft((prev) => ({ ...prev, modelName: e.target.value }))}
              placeholder="gemini-3.1-flash-lite"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_MODELS.map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, modelName: model }))}
                  className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                    draft.modelName === model
                      ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ai-api-key" className="block text-xs font-medium text-slate-300">
                API Key
              </label>
              {hasServerDefaultKey && !draft.apiKey && (
                <span className="text-xs text-emerald-400">
                  Server fallback key available
                </span>
              )}
            </div>
            <div className="relative mt-1.5 flex items-center">
              <input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={
                  hasServerDefaultKey
                    ? 'Optional (leave blank to use server key)'
                    : 'Paste your API key'
                }
                autoComplete="off"
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 py-2 pr-12 pl-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:text-white"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Webhook Notification URL */}
          <div className="space-y-1.5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="settings-webhook-url" className="block text-xs font-medium text-slate-300">
                Webhook Notification URL (Optional)
              </label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRemoteBridge();
                }}
                className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
              >
                Open Remote Bridge &amp; Telegram →
              </button>
            </div>
            <input
              id="settings-webhook-url"
              type="url"
              value={draftWebhookUrl}
              onChange={(e) => setDraftWebhookUrl(e.target.value)}
              placeholder="https://example.com/alderbrook-webhook"
              className="min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Test Connection Result */}
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

        {/* Footer Actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-3.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <Wifi className="h-4 w-4" />
              <span>{testing ? 'Testing...' : 'Test'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_PROVIDER_CONFIG);
                setTestResult(null);
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHelp();
              }}
              aria-label="Open Help & AI Integration Guide"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm font-medium text-amber-200 transition-colors hover:bg-white/5 hover:text-amber-100"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Help</span>
            </button>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Check className="h-4 w-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
