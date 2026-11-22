import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import {
  cleanApiKeysList,
  countCharacterOverrides,
  createProviderEntryFromTemplate,
  formatCompactModelName,
  getConfiguredProviders,
  getOverrideProvidersNeedingKeys,
  getSuggestedModelsForProvider,
  isGeminiEndpoint,
  PROVIDER_TEMPLATES,
  sanitizeProviderConfig,
  type ProviderTemplate,
} from '../lib/aiRouting.ts';
import {
  DEFAULT_PROVIDER_CONFIG,
  EXTERNAL_CLI_PROVIDER_ID,
  type AgentRecord,
  type AIProviderConfig,
  type AIProviderEntry,
} from '../types/town.ts';

interface AIProvidersModalProps {
  isOpen: boolean;
  config: AIProviderConfig;
  agents: AgentRecord[];
  webhookUrl: string;
  hasServerDefaultKey: boolean;
  onClose: () => void;
  onSave: (nextConfig: AIProviderConfig, nextWebhookUrl: string) => void;
  onOpenRemoteBridge: () => void;
  onOpenHelp: () => void;
}

const CUSTOM_SENTINEL = '__custom__';

const RANK_BADGE: Record<1 | 2 | 3, string> = {
  1: 'R1 · Mayor',
  2: 'R2 · Manager',
  3: 'R3 · Worker',
};

function encodeChoice(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

const EXTERNAL_CLI_OPTION = encodeChoice(EXTERNAL_CLI_PROVIDER_ID, 'external-cli');

export function AIProvidersModal({
  isOpen,
  config,
  agents,
  webhookUrl,
  hasServerDefaultKey,
  onClose,
  onSave,
  onOpenRemoteBridge,
  onOpenHelp,
}: AIProvidersModalProps) {
  const [draft, setDraft] = useState<AIProviderConfig>(() => sanitizeProviderConfig(config));
  const [editingProviderId, setEditingProviderId] = useState<string>(
    () => sanitizeProviderConfig(config).defaultProviderId || 'gemini',
  );
  const [showAddProviderMenu, setShowAddProviderMenu] = useState(false);
  const [draftWebhookUrl, setDraftWebhookUrl] = useState(webhookUrl);
  const [showKeys, setShowKeys] = useState(false);
  const [perCharOpen, setPerCharOpen] = useState(() => countCharacterOverrides(config) > 0);
  const [customRowIds, setCustomRowIds] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const clean = sanitizeProviderConfig(config);
      setDraft(clean);
      setEditingProviderId(clean.defaultProviderId || clean.providers?.[0]?.id || 'gemini');
      setShowAddProviderMenu(false);
      setDraftWebhookUrl(webhookUrl);
      setTestResult(null);
      setShowKeys(false);
      setCustomRowIds({});
      setPerCharOpen(countCharacterOverrides(clean) > 0);
    }
  }, [isOpen, config, webhookUrl]);

  const providers = useMemo(() => getConfiguredProviders(draft), [draft]);

  const activeProvider: AIProviderEntry = useMemo(() => {
    return (
      providers.find((p) => p.id === editingProviderId) ??
      providers.find((p) => p.id === draft.defaultProviderId) ??
      providers[0]
    );
  }, [providers, editingProviderId, draft.defaultProviderId]);

  const defaultProvider: AIProviderEntry = useMemo(() => {
    return providers.find((p) => p.id === draft.defaultProviderId) ?? providers[0];
  }, [providers, draft.defaultProviderId]);

  const overrideCount = useMemo(() => countCharacterOverrides(draft), [draft]);

  const missingKeyProviders = useMemo(
    () => getOverrideProvidersNeedingKeys(draft, hasServerDefaultKey),
    [draft, hasServerDefaultKey],
  );

  const presetOptionGroups = useMemo(() => {
    return providers.map((p) => {
      const modelSet = new Set<string>(getSuggestedModelsForProvider(p));
      if (p.defaultModel.trim()) {
        modelSet.add(p.defaultModel.trim());
      }
      const keyCount = cleanApiKeysList(p.apiKeys).length;
      const keySuffix =
        keyCount > 0
          ? ` (${keyCount} ${keyCount === 1 ? 'key' : 'keys'})`
          : isGeminiEndpoint(p.baseUrl) && hasServerDefaultKey
            ? ' (server key)'
            : '';
      return {
        providerId: p.id,
        label: p.name,
        groupLabel: `${p.name}${keySuffix}`,
        models: Array.from(modelSet),
      };
    });
  }, [providers, hasServerDefaultKey]);

  const knownChoiceValues = useMemo(() => {
    const set = new Set<string>([EXTERNAL_CLI_OPTION]);
    for (const g of presetOptionGroups) {
      for (const m of g.models) {
        set.add(encodeChoice(g.providerId, m));
      }
    }
    return set;
  }, [presetOptionGroups]);

  if (!isOpen) return null;

  const updateProvider = (
    providerId: string,
    updater: (entry: AIProviderEntry) => AIProviderEntry,
  ) => {
    setDraft((prev) => {
      const currentList = getConfiguredProviders(prev);
      const nextList = currentList.map((p) => (p.id === providerId ? updater(p) : p));
      const nextDef =
        nextList.find((p) => p.id === prev.defaultProviderId) ?? nextList[0];
      return {
        ...prev,
        providers: nextList,
        defaultProviderId: nextDef.id,
        preset: nextDef.preset,
        baseUrl: nextDef.baseUrl,
        modelName: nextDef.defaultModel,
        apiKey: cleanApiKeysList(nextDef.apiKeys)[0] ?? '',
      };
    });
  };

  const handleSetDefaultProvider = (providerId: string) => {
    setDraft((prev) => {
      const currentList = getConfiguredProviders(prev);
      const nextDef = currentList.find((p) => p.id === providerId);
      if (!nextDef) return prev;
      return {
        ...prev,
        defaultProviderId: nextDef.id,
        preset: nextDef.preset,
        baseUrl: nextDef.baseUrl,
        modelName: nextDef.defaultModel,
        apiKey: cleanApiKeysList(nextDef.apiKeys)[0] ?? '',
      };
    });
  };

  const handleAddProvider = (template: ProviderTemplate) => {
    const existingIds = new Set(providers.map((p) => p.id));
    const created = createProviderEntryFromTemplate(template, existingIds);
    setDraft((prev) => ({
      ...prev,
      providers: [...getConfiguredProviders(prev), created],
    }));
    setEditingProviderId(created.id);
    setShowAddProviderMenu(false);
    setTestResult(null);
  };

  const handleDeleteProvider = (providerId: string) => {
    if (providers.length <= 1) return;
    const remaining = providers.filter((p) => p.id !== providerId);
    const nextDefault =
      draft.defaultProviderId === providerId
        ? remaining[0]
        : remaining.find((p) => p.id === draft.defaultProviderId) ?? remaining[0];

    setDraft((prev) => {
      const nextCharModels: Record<string, { providerId: string; model: string } | null> = {};
      for (const [vid, ov] of Object.entries(prev.characterModels ?? {})) {
        if (ov && ov.providerId !== providerId) {
          nextCharModels[vid] = ov;
        }
      }
      return {
        ...prev,
        providers: remaining,
        defaultProviderId: nextDefault.id,
        preset: nextDefault.preset,
        baseUrl: nextDefault.baseUrl,
        modelName: nextDefault.defaultModel,
        apiKey: cleanApiKeysList(nextDefault.apiKeys)[0] ?? '',
        characterModels: nextCharModels,
      };
    });
    setEditingProviderId(nextDefault.id);
    setTestResult(null);
  };

  // Key pool editors (always show at least 1 input slot for the active provider)
  const keyRows = activeProvider.apiKeys.length > 0 ? activeProvider.apiKeys : [''];
  const activeValidKeyCount = cleanApiKeysList(activeProvider.apiKeys).length;
  const activeStrategy = activeProvider.keyStrategy ?? 'round_robin';
  const suggestedModels = getSuggestedModelsForProvider(activeProvider);

  const handleKeyChange = (index: number, rawValue: string) => {
    // Smart multi-line paste: split pasted lines/commas into multiple key rows
    const parts = rawValue.includes('\n')
      ? rawValue
          .split(/[\r\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    updateProvider(activeProvider.id, (entry) => {
      const nextKeys = entry.apiKeys.length > 0 ? [...entry.apiKeys] : [''];
      if (parts && parts.length > 1) {
        nextKeys.splice(index, 1, ...parts);
      } else {
        nextKeys[index] = rawValue;
      }
      return { ...entry, apiKeys: nextKeys.slice(0, 20) };
    });
  };

  const handleAddKeySlot = () => {
    updateProvider(activeProvider.id, (entry) => {
      const current = entry.apiKeys.length > 0 ? [...entry.apiKeys] : [''];
      if (current.length >= 20) return entry;
      return { ...entry, apiKeys: [...current, ''] };
    });
  };

  const handleRemoveKeySlot = (index: number) => {
    updateProvider(activeProvider.id, (entry) => {
      const current = entry.apiKeys.length > 0 ? [...entry.apiKeys] : [''];
      current.splice(index, 1);
      return { ...entry, apiKeys: current };
    });
  };

  const handleToggleKeyStrategy = () => {
    updateProvider(activeProvider.id, (entry) => ({
      ...entry,
      keyStrategy: entry.keyStrategy === 'failover_only' ? 'round_robin' : 'failover_only',
    }));
  };

  const handleCharacterSelectChange = (agentId: string, rawValue: string) => {
    if (!rawValue) {
      setCustomRowIds((prev) => {
        if (!prev[agentId]) return prev;
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
      setDraft((prev) => ({
        ...prev,
        characterModels: {
          ...(prev.characterModels ?? {}),
          [agentId]: null,
        },
      }));
      return;
    }

    if (rawValue === CUSTOM_SENTINEL) {
      setCustomRowIds((prev) => ({ ...prev, [agentId]: true }));
      setDraft((prev) => {
        const current = prev.characterModels?.[agentId];
        return {
          ...prev,
          characterModels: {
            ...(prev.characterModels ?? {}),
            [agentId]: {
              providerId: current?.providerId ?? defaultProvider.id,
              model: current?.model || defaultProvider.defaultModel,
            },
          },
        };
      });
      return;
    }

    const sepIdx = rawValue.indexOf('::');
    if (sepIdx === -1) return;
    const providerId = rawValue.slice(0, sepIdx);
    const model = rawValue.slice(sepIdx + 2);

    setCustomRowIds((prev) => {
      if (!prev[agentId]) return prev;
      const next = { ...prev };
      delete next[agentId];
      return next;
    });

    setDraft((prev) => ({
      ...prev,
      characterModels: {
        ...(prev.characterModels ?? {}),
        [agentId]: { providerId, model },
      },
    }));
  };

  const handleCharacterCustomUpdate = (
    agentId: string,
    patch: { providerId?: string; model?: string },
  ) => {
    setDraft((prev) => {
      const current = prev.characterModels?.[agentId] ?? {
        providerId: defaultProvider.id,
        model: defaultProvider.defaultModel,
      };
      const nextProviderId = patch.providerId ?? current.providerId;
      const targetProvider = providers.find((p) => p.id === nextProviderId);
      const nextModel =
        patch.model !== undefined
          ? patch.model
          : patch.providerId && patch.providerId !== current.providerId
            ? targetProvider?.defaultModel || current.model
            : current.model;
      return {
        ...prev,
        characterModels: {
          ...(prev.characterModels ?? {}),
          [agentId]: { providerId: nextProviderId, model: nextModel },
        },
      };
    });
  };

  const handleResetAllCharacters = () => {
    setCustomRowIds({});
    setDraft((prev) => ({
      ...prev,
      characterModels: {},
    }));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const validKeys = cleanApiKeysList(activeProvider.apiKeys);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-ai-base-url': activeProvider.baseUrl.trim(),
      'x-ai-model-name': activeProvider.defaultModel.trim(),
      'x-ai-api-key': validKeys[0] ?? '',
    };
    if (validKeys.length > 1) {
      headers['x-ai-api-keys'] = JSON.stringify(validKeys.slice(0, 12));
    }

    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        modelName?: string;
        keyAttemptIndex?: number;
        totalKeys?: number;
        error?: string;
      };
      if (res.ok && data.ok) {
        const keyNote =
          (data.totalKeys ?? validKeys.length) > 1
            ? ` via Key #${(data.keyAttemptIndex ?? 0) + 1}/${data.totalKeys ?? validKeys.length}`
            : '';
        setTestResult({
          ok: true,
          message: `Connected to ${activeProvider.name} (${data.modelName || activeProvider.defaultModel})${keyNote} in ${data.latencyMs ?? 0}ms`,
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
    const cleaned = sanitizeProviderConfig(draft);
    onSave(cleaned, draftWebhookUrl.trim());
    onClose();
  };

  const isEditingDefault = activeProvider.id === defaultProvider.id;

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
              AI Providers &amp; Key Pools
            </h2>
            <p className="text-xs text-slate-400">
              Multiple providers, multi-key rotation &amp; per-character models (local only)
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
        <div className="hud-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 1. Multi-Provider Selector Strip + Add Provider */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Configured Providers ({providers.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddProviderMenu((s) => !s)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/25"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Provider</span>
              </button>
            </div>

            {showAddProviderMenu && (
              <div className="mt-2 rounded-xl border border-amber-400/30 bg-slate-950/90 p-2.5">
                <span className="mb-1.5 block text-[11px] text-slate-400">
                  Choose a provider template to add:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PROVIDER_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleAddProvider(tpl)}
                      className="min-h-[34px] rounded-lg border border-white/10 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:text-amber-200"
                    >
                      + {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {providers.map((provider) => {
                const isSelected = provider.id === activeProvider.id;
                const isDef = provider.id === defaultProvider.id;
                const keyCnt = cleanApiKeysList(provider.apiKeys).length;
                const hasFallback = isGeminiEndpoint(provider.baseUrl) && hasServerDefaultKey;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setEditingProviderId(provider.id);
                      setTestResult(null);
                    }}
                    className={`flex min-h-[46px] flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'border-amber-400/75 bg-amber-500/15 text-amber-100'
                        : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="truncate text-xs font-semibold">{provider.name}</span>
                      {isDef && (
                        <Star
                          className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                          aria-label="Global Default"
                        />
                      )}
                    </div>
                    <span
                      className={`mt-0.5 text-[10px] ${
                        keyCnt > 0 || hasFallback ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {keyCnt > 0
                        ? `${keyCnt} ${keyCnt === 1 ? 'key' : 'keys'}`
                        : hasFallback
                          ? 'Server key'
                          : 'No key'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Selected Provider Configuration & Multi-Key Pool Card */}
          <div className="space-y-3.5 rounded-xl border border-white/10 bg-slate-950/55 p-3.5">
            {/* Provider Name + Default / Delete Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                aria-label="Provider display name"
                value={activeProvider.name}
                onChange={(e) =>
                  updateProvider(activeProvider.id, (entry) => ({
                    ...entry,
                    name: e.target.value,
                  }))
                }
                maxLength={48}
                className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2.5 font-display text-sm font-semibold text-white focus:border-amber-400 focus:outline-none"
              />
              <div className="flex shrink-0 items-center gap-1.5">
                {isEditingDefault ? (
                  <span className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-200">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span>Default</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetDefaultProvider(activeProvider.id)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/15 bg-slate-900 px-2.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:text-amber-200"
                  >
                    <Star className="h-3 w-3" />
                    <span>Set Default</span>
                  </button>
                )}
                {providers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProvider(activeProvider.id)}
                    aria-label={`Remove ${activeProvider.name}`}
                    title={`Remove ${activeProvider.name}`}
                    className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-400 transition-colors hover:border-rose-400/50 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
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
                value={activeProvider.baseUrl}
                onChange={(e) =>
                  updateProvider(activeProvider.id, (entry) => ({
                    ...entry,
                    baseUrl: e.target.value,
                  }))
                }
                placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                required
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* Default Model for this Provider */}
            <div>
              <label htmlFor="ai-model-name" className="block text-xs font-medium text-slate-300">
                Default Model ({activeProvider.name})
              </label>
              <input
                id="ai-model-name"
                type="text"
                value={activeProvider.defaultModel}
                onChange={(e) =>
                  updateProvider(activeProvider.id, (entry) => ({
                    ...entry,
                    defaultModel: e.target.value,
                  }))
                }
                placeholder="gemini-3.1-flash-lite"
                required
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestedModels.map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() =>
                      updateProvider(activeProvider.id, (entry) => ({
                        ...entry,
                        defaultModel: model,
                      }))
                    }
                    className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium transition-colors ${
                      activeProvider.defaultModel === model
                        ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                        : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {formatCompactModelName(model)}
                  </button>
                ))}
              </div>
            </div>

            {/* Multiple API Keys Pool for This Provider */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-amber-300" />
                  <span className="text-xs font-medium text-slate-200">
                    API Keys ({activeValidKeyCount})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {keyRows.length > 1 && (
                    <button
                      type="button"
                      onClick={handleToggleKeyStrategy}
                      title={
                        activeStrategy === 'round_robin'
                          ? 'Rotates across all keys every turn + auto-failover on 429/errors'
                          : 'Uses Key #1 first and switches to Key #2+ only on 429/errors'
                      }
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-white/10 bg-slate-900 px-2 text-[11px] font-medium text-slate-300 hover:border-amber-400/40 hover:text-amber-200"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>
                        {activeStrategy === 'round_robin' ? 'Rotate Keys' : 'Failover Only'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowKeys((s) => !s)}
                    aria-label={showKeys ? 'Hide API keys' : 'Show API keys'}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-white/10 bg-slate-900 px-2 text-[11px] text-slate-300 hover:text-white"
                  >
                    {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showKeys ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
              </div>

              {hasServerDefaultKey &&
                isGeminiEndpoint(activeProvider.baseUrl) &&
                activeValidKeyCount === 0 && (
                  <p className="text-[11px] text-emerald-400">
                    Server fallback key available — or add 1+ personal keys below to rotate quotas.
                  </p>
                )}

              <div className="space-y-1.5">
                {keyRows.map((keyVal, idx) => (
                  <div key={`${activeProvider.id}-key-${idx}`} className="flex items-center gap-1.5">
                    <span className="w-11 shrink-0 font-mono text-[11px] text-slate-400">
                      Key #{idx + 1}
                    </span>
                    <input
                      type={showKeys ? 'text' : 'password'}
                      aria-label={`${activeProvider.name} API Key #${idx + 1}`}
                      value={keyVal}
                      onChange={(e) => handleKeyChange(idx, e.target.value)}
                      placeholder={
                        idx === 0
                          ? `Paste ${activeProvider.name} key (or multiple lines)`
                          : `Backup / rotation key #${idx + 1}`
                      }
                      autoComplete="off"
                      className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    {(keyRows.length > 1 || keyVal.trim().length > 0) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveKeySlot(idx)}
                        aria-label={`Remove Key #${idx + 1}`}
                        className="flex min-h-[40px] min-w-[38px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-400 transition-colors hover:border-rose-400/50 hover:text-rose-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleAddKeySlot}
                  disabled={keyRows.length >= 20}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/15 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:text-amber-200 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Another Key</span>
                </button>
                <span className="text-[10px] text-slate-400">
                  Auto-failover on 429 rate limits
                </span>
              </div>
            </div>
          </div>

          {/* 3. Collapsible Per-Character Models Section */}
          <div className="rounded-xl border border-white/10 bg-slate-950/55">
            <button
              type="button"
              onClick={() => setPerCharOpen((open) => !open)}
              aria-expanded={perCharOpen}
              className="flex min-h-[48px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Cpu className="h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white">
                    Per-Character Models
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {overrideCount > 0
                      ? `${overrideCount} of ${agents.length} villagers using custom models`
                      : `All ${agents.length} villagers using ${defaultProvider.name}`}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {overrideCount > 0 && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-200">
                    {overrideCount} custom
                  </span>
                )}
                {perCharOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </button>

            {perCharOpen && (
              <div className="space-y-3 border-t border-white/10 px-3.5 pt-3 pb-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] leading-snug text-slate-400">
                    Route any villager to any configured provider &amp; key pool.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetAllCharacters}
                    disabled={overrideCount === 0}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:text-amber-200 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset All to Default</span>
                  </button>
                </div>

                {/* Compact Villager Rows */}
                <div className="space-y-2">
                  {agents.map((agent) => {
                    const entry = draft.characterModels?.[agent.id] ?? null;
                    const encodedCurrent =
                      entry && entry.model ? encodeChoice(entry.providerId, entry.model) : '';
                    const isCustomRow =
                      Boolean(customRowIds[agent.id]) ||
                      (Boolean(encodedCurrent) && !knownChoiceValues.has(encodedCurrent));
                    const selectValue = isCustomRow ? CUSTOM_SENTINEL : encodedCurrent;
                    const rankBadge = agent.isHired
                      ? 'R3 · Hired'
                      : RANK_BADGE[agent.rank];

                    return (
                      <div
                        key={agent.id}
                        className="rounded-lg border border-white/10 bg-slate-900/80 p-2.5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: agent.accentColor }}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-white">
                                {agent.name}
                              </div>
                              <div className="truncate text-[10px] text-slate-400">
                                {rankBadge} · {agent.role}
                              </div>
                            </div>
                          </div>

                          <select
                            aria-label={`AI model for ${agent.name}`}
                            value={selectValue}
                            onChange={(e) =>
                              handleCharacterSelectChange(agent.id, e.target.value)
                            }
                            className={`min-h-[40px] w-full rounded-lg border bg-slate-950 px-2.5 text-xs focus:border-amber-400 focus:outline-none sm:w-52 sm:shrink-0 ${
                              entry?.providerId === EXTERNAL_CLI_PROVIDER_ID
                                ? 'border-cyan-400/60 text-cyan-200'
                                : entry
                                  ? 'border-amber-400/50 text-amber-100'
                                  : 'border-white/10 text-slate-300'
                            }`}
                          >
                            <option value="">
                              Global Default ({formatCompactModelName(defaultProvider.defaultModel)})
                            </option>
                            <option value={EXTERNAL_CLI_OPTION}>
                              External CLI Agent (0 API tokens)
                            </option>
                            {presetOptionGroups.map((group) => (
                              <optgroup key={group.providerId} label={group.groupLabel}>
                                {group.models.map((model) => (
                                  <option
                                    key={encodeChoice(group.providerId, model)}
                                    value={encodeChoice(group.providerId, model)}
                                  >
                                    {group.label} · {formatCompactModelName(model)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                            <option value={CUSTOM_SENTINEL}>Custom model ID...</option>
                          </select>
                        </div>

                        {isCustomRow && (
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                            <select
                              aria-label={`Custom provider for ${agent.name}`}
                              value={entry?.providerId ?? defaultProvider.id}
                              onChange={(e) =>
                                handleCharacterCustomUpdate(agent.id, {
                                  providerId: e.target.value,
                                })
                              }
                              className="min-h-[38px] rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-slate-200 focus:border-amber-400 focus:outline-none sm:col-span-2"
                            >
                              {providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              aria-label={`Custom model name for ${agent.name}`}
                              value={entry?.model ?? ''}
                              onChange={(e) =>
                                handleCharacterCustomUpdate(agent.id, {
                                  model: e.target.value,
                                })
                              }
                              placeholder="Enter exact model ID..."
                              className="min-h-[38px] rounded-lg border border-white/10 bg-slate-950 px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none sm:col-span-3"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick jump links if any overridden provider still needs an API key */}
                {missingKeyProviders.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-200">
                      <KeyRound className="h-3.5 w-3.5 shrink-0" />
                      <span>Add at least one API key for these assigned providers:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {missingKeyProviders.map((prov) => (
                        <button
                          key={prov.id}
                          type="button"
                          onClick={() => setEditingProviderId(prov.id)}
                          className="min-h-[32px] rounded-lg border border-amber-400/40 bg-slate-950 px-2.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
                        >
                          Add key to {prov.name} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Webhook Notification URL */}
          <div className="space-y-1.5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="settings-webhook-url"
                className="block text-xs font-medium text-slate-300"
              >
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
              <span>{testing ? 'Testing...' : `Test ${activeProvider.name.split(' ')[0]}`}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomRowIds({});
                const fresh = sanitizeProviderConfig(DEFAULT_PROVIDER_CONFIG);
                setDraft(fresh);
                setEditingProviderId(fresh.defaultProviderId || 'gemini');
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
