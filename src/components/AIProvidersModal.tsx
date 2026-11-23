import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Swords,
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
  cleanSearchApiKeys,
  createCustomSearchProvider,
  DEFAULT_WEB_SEARCH_CONFIG,
  executeWebSearch,
  sanitizeWebSearchConfig,
  type SearchProviderEntry,
  type WebSearchConfig,
} from '../lib/webSearch.ts';
import {
  DEFAULT_PROVIDER_CONFIG,
  ENEMY_RAIDER_AGENT_ID,
  EXTERNAL_CLI_PROVIDER_ID,
  INSTANT_TACTICS_PROVIDER_ID,
  type AgentRecord,
  type AIProviderConfig,
  type AIProviderEntry,
} from '../types/town.ts';

interface AIProvidersModalProps {
  isOpen: boolean;
  config: AIProviderConfig;
  webSearchConfig: WebSearchConfig;
  initialTab?: 'llm' | 'search';
  agents: AgentRecord[];
  webhookUrl: string;
  hasServerDefaultKey: boolean;
  enemyRaidsEnabled: boolean;
  onToggleEnemyRaids: (next?: boolean) => void;
  onClose: () => void;
  onSave: (nextConfig: AIProviderConfig, nextWebhookUrl: string) => void;
  onSaveWebSearchConfig: (nextSearchConfig: WebSearchConfig) => void;
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
const INSTANT_TACTICS_OPTION = encodeChoice(INSTANT_TACTICS_PROVIDER_ID, 'instant-tactics');

export function AIProvidersModal({
  isOpen,
  config,
  webSearchConfig,
  initialTab = 'llm',
  agents,
  webhookUrl,
  hasServerDefaultKey,
  enemyRaidsEnabled,
  onToggleEnemyRaids,
  onClose,
  onSave,
  onSaveWebSearchConfig,
  onOpenRemoteBridge,
  onOpenHelp,
}: AIProvidersModalProps) {
  const [modalTab, setModalTab] = useState<'llm' | 'search'>(initialTab);
  const [draft, setDraft] = useState<AIProviderConfig>(() => sanitizeProviderConfig(config));
  const [editingProviderId, setEditingProviderId] = useState<string>(
    () => sanitizeProviderConfig(config).defaultProviderId || 'gemini',
  );
  const [searchDraft, setSearchDraft] = useState<WebSearchConfig>(() =>
    sanitizeWebSearchConfig(webSearchConfig),
  );
  const [editingSearchId, setEditingSearchId] = useState<string>(
    () => sanitizeWebSearchConfig(webSearchConfig).defaultProviderId || 'tavily',
  );
  const [showSearchKeys, setShowSearchKeys] = useState(false);
  const [testingSearch, setTestingSearch] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
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
      const cleanSearch = sanitizeWebSearchConfig(webSearchConfig);
      setModalTab(initialTab);
      setDraft(clean);
      setEditingProviderId(clean.defaultProviderId || clean.providers?.[0]?.id || 'gemini');
      setSearchDraft(cleanSearch);
      setEditingSearchId(cleanSearch.defaultProviderId || 'tavily');
      setShowSearchKeys(false);
      setSearchTestResult(null);
      setShowAddProviderMenu(false);
      setDraftWebhookUrl(webhookUrl);
      setTestResult(null);
      setShowKeys(false);
      setCustomRowIds({});
      setPerCharOpen(countCharacterOverrides(clean) > 0);
    }
  }, [isOpen, config, webSearchConfig, initialTab, webhookUrl]);

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
    const set = new Set<string>([EXTERNAL_CLI_OPTION, INSTANT_TACTICS_OPTION]);
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
    const cleanedSearch = sanitizeWebSearchConfig(searchDraft);
    onSave(cleaned, draftWebhookUrl.trim());
    onSaveWebSearchConfig(cleanedSearch);
    onClose();
  };

  const searchProviders = searchDraft.providers;
  const activeSearchProvider: SearchProviderEntry =
    searchProviders.find((p) => p.id === editingSearchId) ??
    searchProviders.find((p) => p.id === searchDraft.defaultProviderId) ??
    searchProviders[0];
  const defaultSearchProvider: SearchProviderEntry =
    searchProviders.find((p) => p.id === searchDraft.defaultProviderId) ?? searchProviders[0];
  const searchKeyRows =
    activeSearchProvider.apiKeys.length > 0 ? activeSearchProvider.apiKeys : [''];
  const activeSearchValidKeys = cleanSearchApiKeys(activeSearchProvider.apiKeys).length;
  const totalSearchProvidersWithKeys = searchProviders.filter(
    (p) => cleanSearchApiKeys(p.apiKeys).length > 0,
  ).length;

  const updateSearchProvider = (
    providerId: string,
    updater: (entry: SearchProviderEntry) => SearchProviderEntry,
  ) => {
    setSearchDraft((prev) => ({
      ...prev,
      providers: prev.providers.map((p) => (p.id === providerId ? updater(p) : p)),
    }));
  };

  const handleAddCustomSearchProvider = () => {
    const existingIds = new Set(searchProviders.map((p) => p.id));
    const created = createCustomSearchProvider(existingIds);
    setSearchDraft((prev) => ({
      ...prev,
      providers: [...prev.providers, created],
    }));
    setEditingSearchId(created.id);
    setSearchTestResult(null);
  };

  const handleDeleteSearchProvider = (providerId: string) => {
    const target = searchProviders.find((p) => p.id === providerId);
    if (!target || target.builtIn) return;
    const remaining = searchProviders.filter((p) => p.id !== providerId);
    const nextDefaultId =
      searchDraft.defaultProviderId === providerId
        ? remaining[0]?.id ?? 'tavily'
        : searchDraft.defaultProviderId;
    setSearchDraft({ defaultProviderId: nextDefaultId, providers: remaining });
    setEditingSearchId(nextDefaultId);
    setSearchTestResult(null);
  };

  const handleSearchKeyChange = (index: number, rawValue: string) => {
    const parts = rawValue.includes('\n')
      ? rawValue
          .split(/[\r\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    updateSearchProvider(activeSearchProvider.id, (entry) => {
      const nextKeys = entry.apiKeys.length > 0 ? [...entry.apiKeys] : [''];
      if (parts && parts.length > 1) {
        nextKeys.splice(index, 1, ...parts);
      } else {
        nextKeys[index] = rawValue;
      }
      return { ...entry, apiKeys: nextKeys.slice(0, 20) };
    });
  };

  const handleAddSearchKeyRow = () => {
    updateSearchProvider(activeSearchProvider.id, (entry) => {
      const next = entry.apiKeys.length > 0 ? [...entry.apiKeys, ''] : ['', ''];
      return { ...entry, apiKeys: next.slice(0, 20) };
    });
  };

  const handleRemoveSearchKeyRow = (index: number) => {
    updateSearchProvider(activeSearchProvider.id, (entry) => {
      const next = entry.apiKeys.filter((_, i) => i !== index);
      return { ...entry, apiKeys: next.length > 0 ? next : [''] };
    });
  };

  const handleTestSearch = async () => {
    setTestingSearch(true);
    setSearchTestResult(null);
    const started = performance.now();
    try {
      const result = await executeWebSearch(
        sanitizeWebSearchConfig(searchDraft),
        'world news today',
        3,
        activeSearchProvider,
      );
      const elapsedMs = Math.round(performance.now() - started);
      if (result.ok) {
        const sampleTitle = result.results[0]?.title
          ? ` · Top: "${result.results[0].title.slice(0, 52)}"`
          : '';
        const keyNote = result.keySlotUsed ? ` via Key #${result.keySlotUsed}` : '';
        setSearchTestResult({
          ok: true,
          message: `${activeSearchProvider.name} OK (${result.results.length} results${keyNote}, ${result.mode}, ${elapsedMs}ms)${sampleTitle}`,
        });
      } else {
        setSearchTestResult({
          ok: false,
          message: result.error || 'Web search test failed.',
        });
      }
    } catch (err) {
      setSearchTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Search test failed.',
      });
    } finally {
      setTestingSearch(false);
    }
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
              LLM models, multi-key rotation &amp; live Web Search providers (local only)
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

        {/* Sub-Navigation Tabs: LLM Providers vs Web Search Providers */}
        <div className="flex shrink-0 gap-1.5 border-b border-white/10 bg-slate-950/70 px-5 py-2">
          <button
            type="button"
            onClick={() => setModalTab('llm')}
            className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
              modalTab === 'llm'
                ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/45'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>LLM Providers</span>
          </button>
          <button
            type="button"
            onClick={() => setModalTab('search')}
            className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
              modalTab === 'search'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/45'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Web Search Providers</span>
            {totalSearchProvidersWithKeys > 0 && (
              <span className="rounded bg-cyan-500/25 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
                {totalSearchProvidersWithKeys}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="hud-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {modalTab === 'search' ? (
            <>
              {/* Web Search Provider Strip + Add Custom Search Provider */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Web Search Providers ({searchProviders.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCustomSearchProvider}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Search Provider</span>
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {searchProviders.map((sp) => {
                    const isSelected = sp.id === activeSearchProvider.id;
                    const isDef = sp.id === defaultSearchProvider.id;
                    const kCnt = cleanSearchApiKeys(sp.apiKeys).length;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          setEditingSearchId(sp.id);
                          setSearchTestResult(null);
                        }}
                        className={`flex min-h-[50px] flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-500/15 text-white'
                            : 'border-white/10 bg-slate-950/70 text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <span className="truncate text-xs font-semibold">{sp.name}</span>
                          {isDef && <Star className="h-3 w-3 shrink-0 fill-cyan-400 text-cyan-400" />}
                        </div>
                        <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {kCnt > 0 ? `${kCnt} ${kCnt === 1 ? 'key' : 'keys'}` : 'No key yet'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Web Search Provider Editor */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-300" />
                    <span className="text-sm font-semibold text-white">
                      {activeSearchProvider.name}
                    </span>
                    {activeSearchProvider.id === defaultSearchProvider.id && (
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                        Active Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeSearchProvider.id !== defaultSearchProvider.id && (
                      <button
                        type="button"
                        onClick={() =>
                          setSearchDraft((prev) => ({
                            ...prev,
                            defaultProviderId: activeSearchProvider.id,
                          }))
                        }
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25"
                      >
                        <Star className="h-3 w-3" />
                        <span>Set Default</span>
                      </button>
                    )}
                    {!activeSearchProvider.builtIn && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSearchProvider(activeSearchProvider.id)}
                        aria-label={`Remove ${activeSearchProvider.name}`}
                        className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Custom Provider Name + Endpoint URL */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="search-provider-name"
                      className="mb-1 block text-xs font-medium text-slate-300"
                    >
                      Provider Name
                    </label>
                    <input
                      id="search-provider-name"
                      type="text"
                      value={activeSearchProvider.name}
                      onChange={(e) =>
                        updateSearchProvider(activeSearchProvider.id, (p) => ({
                          ...p,
                          name: e.target.value,
                        }))
                      }
                      className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="search-endpoint-url"
                      className="mb-1 block text-xs font-medium text-slate-300"
                    >
                      Search API URL
                    </label>
                    <input
                      id="search-endpoint-url"
                      type="url"
                      value={activeSearchProvider.endpointUrl}
                      onChange={(e) =>
                        updateSearchProvider(activeSearchProvider.id, (p) => ({
                          ...p,
                          endpointUrl: e.target.value,
                        }))
                      }
                      placeholder="https://api.tavily.com/search"
                      className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Multi-Key Pool for Active Search Provider */}
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                      <KeyRound className="h-3.5 w-3.5 text-cyan-300" />
                      <span>
                        API Key Pool ({activeSearchValidKeys}{' '}
                        {activeSearchValidKeys === 1 ? 'key' : 'keys'})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSearchKeys((s) => !s)}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-white/10 bg-slate-900 px-2 text-[11px] text-slate-300 hover:text-white"
                      >
                        {showSearchKeys ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        <span>{showSearchKeys ? 'Hide' : 'Show'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddSearchKeyRow}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Another Key</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] leading-snug text-slate-400">
                    Paste one key per row (or paste multiple lines at once). Keys automatically rotate and fall back if one hits quota or 429 rate limits. Stored locally in your browser only.
                  </p>

                  <div className="space-y-1.5">
                    {searchKeyRows.map((keyVal, idx) => (
                      <div key={`${activeSearchProvider.id}-skey-${idx}`} className="flex gap-1.5">
                        <input
                          type={showSearchKeys ? 'text' : 'password'}
                          value={keyVal}
                          onChange={(e) => handleSearchKeyChange(idx, e.target.value)}
                          placeholder={`${activeSearchProvider.name} API Key #${idx + 1}...`}
                          className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                        />
                        {searchKeyRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSearchKeyRow(idx)}
                            aria-label={`Remove search key ${idx + 1}`}
                            className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Key Rotation Strategy */}
                  {activeSearchValidKeys > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <RefreshCw className="h-3 w-3 text-cyan-300" />
                        <span>Multi-Key Mode</span>
                      </span>
                      <div className="flex gap-1">
                        {(['round_robin', 'failover'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              updateSearchProvider(activeSearchProvider.id, (p) => ({
                                ...p,
                                keyStrategy: mode,
                              }))
                            }
                            className={`min-h-[30px] rounded-lg px-2.5 text-[11px] font-medium transition-colors ${
                              activeSearchProvider.keyStrategy === mode
                                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {mode === 'round_robin' ? 'Round-Robin' : 'Failover Only'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Note on Static Hosting vs Render Proxy */}
                <p className="rounded-lg border border-white/5 bg-slate-900/80 px-2.5 py-2 text-[11px] text-slate-400">
                  Uses the built-in backend proxy (<code className="text-cyan-300">/api/search/proxy</code>) on full-stack hosts so Brave &amp; Serper work without CORS errors, and falls back to direct browser fetch for Tavily/Exa on static hosts.
                </p>

                {searchTestResult && (
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      searchTestResult.ok
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                    }`}
                  >
                    {searchTestResult.message}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
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

          {/* 2b. Quick Toggle: Enemy Raider AI & Town Defense */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Swords className="h-4 w-4 shrink-0 text-rose-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">
                  Enemy Raider AI &amp; Town Defense
                </div>
                <div className="text-[11px] text-slate-400">
                  {enemyRaidsEnabled
                    ? 'Active: Low-poly raiders attack the perimeter · Workers are rescued at Town Hospital'
                    : 'Peaceful Mode (OFF) — Enable anytime or say "Trigger enemy raid" to Mayor'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleEnemyRaids(!enemyRaidsEnabled)}
              aria-pressed={enemyRaidsEnabled}
              className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                enemyRaidsEnabled
                  ? 'border-rose-400/70 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
                  : 'border-white/15 bg-slate-900 text-slate-300 hover:border-rose-400/40 hover:text-rose-200'
              }`}
            >
              <Swords className="h-3.5 w-3.5" />
              <span>Raids: {enemyRaidsEnabled ? 'ON' : 'OFF'}</span>
            </button>
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
                    Per-Character Models (incl. Enemy Raider AI)
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {overrideCount > 0
                      ? `${overrideCount} custom character model${overrideCount === 1 ? '' : 's'} assigned`
                      : `All villagers & Enemy Raider using ${defaultProvider.name}`}
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
                    Route any villager or the Enemy Raider Commander to any configured provider &amp; key pool.
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

                {/* Dedicated Enemy Raider Commander AI Slot */}
                {(() => {
                  const raiderEntry = draft.characterModels?.[ENEMY_RAIDER_AGENT_ID] ?? null;
                  const raiderEncoded =
                    raiderEntry && raiderEntry.model
                      ? encodeChoice(raiderEntry.providerId, raiderEntry.model)
                      : '';
                  const isRaiderCustom =
                    Boolean(customRowIds[ENEMY_RAIDER_AGENT_ID]) ||
                    (Boolean(raiderEncoded) && !knownChoiceValues.has(raiderEncoded));
                  const raiderSelectVal = isRaiderCustom ? CUSTOM_SENTINEL : raiderEncoded;

                  return (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <Swords className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-rose-100">
                              Supreme Warlord Malakor (Ironhold AI)
                            </div>
                            <div className="truncate text-[10px] text-rose-300/80">
                              100% Autonomous Enemy · Builds rival city, rail, jets, helis &amp; raids (no player orders)
                            </div>
                          </div>
                        </div>

                        <select
                          aria-label="AI model for Supreme Warlord Malakor"
                          value={raiderSelectVal}
                          onChange={(e) =>
                            handleCharacterSelectChange(ENEMY_RAIDER_AGENT_ID, e.target.value)
                          }
                          className={`min-h-[40px] w-full rounded-lg border bg-slate-950 px-2.5 text-xs focus:border-rose-400 focus:outline-none sm:w-52 sm:shrink-0 ${
                            raiderEntry?.providerId === INSTANT_TACTICS_PROVIDER_ID
                              ? 'border-emerald-400/60 text-emerald-200'
                              : raiderEntry?.providerId === EXTERNAL_CLI_PROVIDER_ID
                                ? 'border-cyan-400/60 text-cyan-200'
                                : raiderEntry
                                  ? 'border-rose-400/60 text-rose-100'
                                  : 'border-white/15 text-slate-300'
                          }`}
                        >
                          <option value="">
                            Global Default ({formatCompactModelName(defaultProvider.defaultModel)})
                          </option>
                          <option value={INSTANT_TACTICS_OPTION}>
                            Instant Zero-Token Tactics (0 API tokens)
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

                      {isRaiderCustom && (
                        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                          <select
                            aria-label="Custom provider for Enemy Raider Commander"
                            value={raiderEntry?.providerId ?? defaultProvider.id}
                            onChange={(e) =>
                              handleCharacterCustomUpdate(ENEMY_RAIDER_AGENT_ID, {
                                providerId: e.target.value,
                              })
                            }
                            className="min-h-[38px] rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-slate-200 focus:border-rose-400 focus:outline-none sm:col-span-2"
                          >
                            {providers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            aria-label="Custom model name for Enemy Raider Commander"
                            value={raiderEntry?.model ?? ''}
                            onChange={(e) =>
                              handleCharacterCustomUpdate(ENEMY_RAIDER_AGENT_ID, {
                                model: e.target.value,
                              })
                            }
                            placeholder="Enter exact model ID..."
                            className="min-h-[38px] rounded-lg border border-white/10 bg-slate-950 px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none sm:col-span-3"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

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
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {modalTab === 'search' ? (
              <button
                type="button"
                onClick={handleTestSearch}
                disabled={testingSearch}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                <span>{testingSearch ? 'Searching...' : 'Test Search'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-3.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <Wifi className="h-4 w-4" />
                <span>{testing ? 'Testing...' : `Test ${activeProvider.name.split(' ')[0]}`}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (modalTab === 'search') {
                  const freshSearch = sanitizeWebSearchConfig(DEFAULT_WEB_SEARCH_CONFIG);
                  setSearchDraft(freshSearch);
                  setEditingSearchId(freshSearch.defaultProviderId);
                  setSearchTestResult(null);
                } else {
                  setCustomRowIds({});
                  const fresh = sanitizeProviderConfig(DEFAULT_PROVIDER_CONFIG);
                  setDraft(fresh);
                  setEditingProviderId(fresh.defaultProviderId || 'gemini');
                  setTestResult(null);
                }
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
