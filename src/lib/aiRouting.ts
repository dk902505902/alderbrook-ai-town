import {
  AI_PROVIDER_PRESETS,
  DEFAULT_PROVIDER_CONFIG,
  EXTERNAL_CLI_PROVIDER_ID,
  INSTANT_TACTICS_PROVIDER_ID,
  type AIKeyStrategy,
  type AIProviderConfig,
  type AIProviderEntry,
  type AIProviderPreset,
  type CharacterModelOverride,
  type ProviderPresetMeta,
} from '../types/town.ts';

export interface ResolvedInferenceConfig {
  providerId: string;
  providerLabel: string;
  preset: AIProviderPreset;
  baseUrl: string;
  modelName: string;
  /** Ordered key pool for this call (first key is tried first, rest are automatic failovers) */
  apiKeys: string[];
  apiKey: string;
  keyCount: number;
  /** 1-based index of the starting key in the provider's apiKeys array */
  keyStartIndex: number;
  keyStrategy: AIKeyStrategy;
  isOverride: boolean;
  /** True when villager is delegated to an external CLI agent (uses 0 LLM API tokens) */
  isExternalCli: boolean;
  /** True when routed to built-in zero-token tactical engine (e.g. Enemy Raider Commander) */
  isInstantTactics: boolean;
}

export interface ProviderTemplate {
  id: string;
  preset: AIProviderPreset;
  name: string;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'gemini',
    preset: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.1-flash-lite',
    suggestedModels: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-4-neon'],
  },
  {
    id: 'openrouter',
    preset: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    suggestedModels: [
      'google/gemini-2.5-flash',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
    ],
  },
  {
    id: 'groq',
    preset: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'openai',
    preset: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'deepseek',
    preset: 'custom',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'mistral',
    preset: 'custom',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    suggestedModels: ['mistral-small-latest', 'mistral-large-latest'],
  },
  {
    id: 'custom',
    preset: 'custom',
    name: 'Custom Provider',
    baseUrl: '',
    defaultModel: '',
    suggestedModels: [],
  },
];

const VALID_PRESET_IDS = new Set<AIProviderPreset>(AI_PROVIDER_PRESETS.map((p) => p.id));

/** In-memory round-robin cursor per provider ID (only mutated when a request is dispatched) */
const providerKeyCursors = new Map<string, number>();

export function isValidProviderPreset(val: unknown): val is AIProviderPreset {
  return typeof val === 'string' && VALID_PRESET_IDS.has(val as AIProviderPreset);
}

export function getProviderPresetMeta(preset: AIProviderPreset): ProviderPresetMeta {
  return AI_PROVIDER_PRESETS.find((p) => p.id === preset) ?? AI_PROVIDER_PRESETS[0];
}

export function getSuggestedModelsForProvider(provider: AIProviderEntry): string[] {
  const byTemplate = PROVIDER_TEMPLATES.find(
    (t) =>
      t.id === provider.id ||
      (t.baseUrl && provider.baseUrl.trim().startsWith(t.baseUrl)),
  );
  if (byTemplate && byTemplate.suggestedModels.length > 0) {
    return byTemplate.suggestedModels;
  }
  const byPreset = getProviderPresetMeta(provider.preset);
  if (byPreset.suggestedModels.length > 0) {
    return byPreset.suggestedModels;
  }
  return ['gemini-3.1-flash-lite', 'llama-3.3-70b-versatile', 'gpt-4o-mini'];
}

export function cleanApiKeysList(rawKeys: unknown): string[] {
  if (!Array.isArray(rawKeys)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of rawKeys) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= 20) break;
  }
  return cleaned;
}

export function createDefaultProvidersList(): AIProviderEntry[] {
  return AI_PROVIDER_PRESETS.filter((p) => p.id !== 'custom').map((p) => ({
    id: p.id,
    preset: p.id,
    name: p.label,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    apiKeys: [],
    keyStrategy: 'round_robin',
  }));
}

export function createProviderEntryFromTemplate(
  template: ProviderTemplate,
  existingIds: Set<string>,
): AIProviderEntry {
  const baseSlug = template.id.replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'provider';
  let id = baseSlug;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${baseSlug}_${suffix++}`;
  }
  const existingNameSuffix = suffix > 2 ? ` #${suffix - 1}` : '';
  return {
    id,
    preset: template.preset,
    name: `${template.name}${existingNameSuffix}`,
    baseUrl: template.baseUrl,
    defaultModel: template.defaultModel,
    apiKeys: [],
    keyStrategy: 'round_robin',
  };
}

export function sanitizeProviderConfig(raw: unknown): AIProviderConfig {
  if (!raw || typeof raw !== 'object') {
    const providers = createDefaultProvidersList();
    const def = providers[0];
    return {
      defaultProviderId: def.id,
      providers,
      preset: def.preset,
      baseUrl: def.baseUrl,
      modelName: def.defaultModel,
      apiKey: '',
      characterModels: {},
    };
  }

  const parsed = raw as Partial<AIProviderConfig>;
  let providers: AIProviderEntry[] = [];

  if (Array.isArray(parsed.providers) && parsed.providers.length > 0) {
    const seenIds = new Set<string>();
    for (const rawItem of parsed.providers) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Partial<AIProviderEntry>;
      const rawId = typeof item.id === 'string' ? item.id.trim().slice(0, 48) : '';
      if (!rawId || seenIds.has(rawId)) continue;
      seenIds.add(rawId);

      const preset: AIProviderPreset = isValidProviderPreset(item.preset)
        ? item.preset
        : isValidProviderPreset(rawId)
          ? rawId
          : 'custom';
      const meta = getProviderPresetMeta(preset);
      const name =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim().slice(0, 48)
          : meta.label;
      const baseUrl =
        typeof item.baseUrl === 'string' && item.baseUrl.trim()
          ? item.baseUrl.trim()
          : meta.baseUrl;
      const defaultModel =
        typeof item.defaultModel === 'string' && item.defaultModel.trim()
          ? item.defaultModel.trim()
          : meta.defaultModel || DEFAULT_PROVIDER_CONFIG.modelName;
      const apiKeys = cleanApiKeysList(item.apiKeys);
      const keyStrategy: AIKeyStrategy =
        item.keyStrategy === 'failover_only' ? 'failover_only' : 'round_robin';

      providers.push({
        id: rawId,
        preset,
        name,
        baseUrl,
        defaultModel,
        apiKeys,
        keyStrategy,
      });
    }
  }

  // Backward-compatible migration from legacy single-provider + providerCredentials config
  if (providers.length === 0) {
    const legacyPreset: AIProviderPreset = isValidProviderPreset(parsed.preset)
      ? parsed.preset
      : DEFAULT_PROVIDER_CONFIG.preset;
    const legacyCreds = parsed.providerCredentials ?? {};

    providers = createDefaultProvidersList().map((entry) => {
      const cred = legacyCreds[entry.preset];
      const isActiveLegacy = legacyPreset === entry.preset;
      const keys = cleanApiKeysList([
        isActiveLegacy ? parsed.apiKey : undefined,
        cred?.apiKey,
      ]);
      return {
        ...entry,
        baseUrl:
          (isActiveLegacy && typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()) ||
          cred?.baseUrl?.trim() ||
          entry.baseUrl,
        defaultModel:
          (isActiveLegacy && typeof parsed.modelName === 'string' && parsed.modelName.trim()) ||
          cred?.modelName?.trim() ||
          entry.defaultModel,
        apiKeys: keys,
      };
    });

    const customCred = legacyCreds.custom;
    if (
      legacyPreset === 'custom' ||
      (customCred && (customCred.baseUrl || customCred.apiKey))
    ) {
      providers.push({
        id: 'custom',
        preset: 'custom',
        name: 'Custom Provider',
        baseUrl:
          (legacyPreset === 'custom' && typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()) ||
          customCred?.baseUrl?.trim() ||
          '',
        defaultModel:
          (legacyPreset === 'custom' && typeof parsed.modelName === 'string' && parsed.modelName.trim()) ||
          customCred?.modelName?.trim() ||
          DEFAULT_PROVIDER_CONFIG.modelName,
        apiKeys: cleanApiKeysList([
          legacyPreset === 'custom' ? parsed.apiKey : undefined,
          customCred?.apiKey,
        ]),
        keyStrategy: 'round_robin',
      });
    }
  }

  if (providers.length === 0) {
    providers = createDefaultProvidersList();
  }

  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const requestedDefaultId =
    (typeof parsed.defaultProviderId === 'string' && parsed.defaultProviderId.trim()) ||
    (isValidProviderPreset(parsed.preset) ? parsed.preset : '');
  const defaultProvider = providerMap.get(requestedDefaultId) ?? providers[0];

  const characterModels: Record<string, CharacterModelOverride | null> = {};
  if (parsed.characterModels && typeof parsed.characterModels === 'object') {
    for (const [villagerId, entry] of Object.entries(parsed.characterModels)) {
      const cleanId = villagerId.trim();
      if (!cleanId || !entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<CharacterModelOverride>;
      const providerId = typeof candidate.providerId === 'string' ? candidate.providerId.trim() : '';
      const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
      if (providerId === EXTERNAL_CLI_PROVIDER_ID) {
        characterModels[cleanId] = {
          providerId: EXTERNAL_CLI_PROVIDER_ID,
          model: model || 'external-cli',
        };
      } else if (providerId === INSTANT_TACTICS_PROVIDER_ID) {
        characterModels[cleanId] = {
          providerId: INSTANT_TACTICS_PROVIDER_ID,
          model: model || 'instant-tactics',
        };
      } else if (providerId && providerMap.has(providerId) && model) {
        characterModels[cleanId] = { providerId, model };
      }
    }
  }

  return {
    defaultProviderId: defaultProvider.id,
    providers,
    preset: defaultProvider.preset,
    baseUrl: defaultProvider.baseUrl || DEFAULT_PROVIDER_CONFIG.baseUrl,
    modelName: defaultProvider.defaultModel || DEFAULT_PROVIDER_CONFIG.modelName,
    apiKey: defaultProvider.apiKeys[0] ?? '',
    characterModels,
  };
}

export function getConfiguredProviders(config: AIProviderConfig): AIProviderEntry[] {
  if (Array.isArray(config.providers) && config.providers.length > 0) {
    return config.providers;
  }
  return sanitizeProviderConfig(config).providers ?? createDefaultProvidersList();
}

export function getProviderById(
  config: AIProviderConfig,
  providerId?: string | null,
): AIProviderEntry {
  const list = getConfiguredProviders(config);
  if (providerId) {
    const exact = list.find((p) => p.id === providerId);
    if (exact) return exact;
  }
  const defId = config.defaultProviderId || config.preset;
  return list.find((p) => p.id === defId) ?? list[0];
}

export function getRotatedKeyPool(
  provider: AIProviderEntry,
): { orderedKeys: string[]; startSlot: number; strategy: AIKeyStrategy } {
  const keys = cleanApiKeysList(provider.apiKeys);
  const strategy: AIKeyStrategy =
    provider.keyStrategy === 'failover_only' ? 'failover_only' : 'round_robin';
  if (keys.length <= 1 || strategy === 'failover_only') {
    return { orderedKeys: keys, startSlot: 1, strategy };
  }
  const cursor = (providerKeyCursors.get(provider.id) ?? 0) % keys.length;
  const orderedKeys = [...keys.slice(cursor), ...keys.slice(0, cursor)];
  return { orderedKeys, startSlot: cursor + 1, strategy };
}

/**
 * Call once per actual network inference dispatch so round-robin rotates to the next key on the next turn.
 */
export function advanceProviderKeyCursor(resolved: ResolvedInferenceConfig): void {
  if (resolved.keyCount <= 1 || resolved.keyStrategy === 'failover_only') return;
  const current = providerKeyCursors.get(resolved.providerId) ?? 0;
  providerKeyCursors.set(resolved.providerId, (current + 1) % resolved.keyCount);
}

/**
 * Resolves `characterModels[villagerId] ?? globalDefaultConfig` without mutating rotation cursors.
 * Never leaks one provider's API keys to a different provider endpoint.
 */
export function resolveInferenceConfig(
  config: AIProviderConfig,
  villagerId?: string | null,
): ResolvedInferenceConfig {
  const override = villagerId ? config.characterModels?.[villagerId] ?? null : null;
  const providers = getConfiguredProviders(config);

  if (override && override.providerId === EXTERNAL_CLI_PROVIDER_ID) {
    return {
      providerId: EXTERNAL_CLI_PROVIDER_ID,
      providerLabel: 'External CLI Agent',
      preset: 'custom',
      baseUrl: '',
      modelName: 'External CLI',
      apiKeys: [],
      apiKey: '',
      keyCount: 0,
      keyStartIndex: 1,
      keyStrategy: 'failover_only',
      isOverride: true,
      isExternalCli: true,
      isInstantTactics: false,
    };
  }

  if (override && override.providerId === INSTANT_TACTICS_PROVIDER_ID) {
    return {
      providerId: INSTANT_TACTICS_PROVIDER_ID,
      providerLabel: 'Instant Zero-Token Tactics',
      preset: 'custom',
      baseUrl: '',
      modelName: 'Instant Tactics',
      apiKeys: [],
      apiKey: '',
      keyCount: 0,
      keyStartIndex: 1,
      keyStrategy: 'failover_only',
      isOverride: true,
      isExternalCli: false,
      isInstantTactics: true,
    };
  }

  if (override && override.providerId && override.model.trim()) {
    const matched = providers.find((p) => p.id === override.providerId);
    if (matched) {
      const { orderedKeys, startSlot, strategy } = getRotatedKeyPool(matched);
      return {
        providerId: matched.id,
        providerLabel: matched.name,
        preset: matched.preset,
        baseUrl: matched.baseUrl.trim() || getProviderPresetMeta(matched.preset).baseUrl,
        modelName: override.model.trim(),
        apiKeys: orderedKeys,
        apiKey: orderedKeys[0] ?? '',
        keyCount: orderedKeys.length,
        keyStartIndex: startSlot,
        keyStrategy: strategy,
        isOverride: true,
        isExternalCli: false,
        isInstantTactics: false,
      };
    }
  }

  const defProvider = getProviderById(config, config.defaultProviderId);
  const { orderedKeys, startSlot, strategy } = getRotatedKeyPool(defProvider);
  return {
    providerId: defProvider.id,
    providerLabel: defProvider.name,
    preset: defProvider.preset,
    baseUrl:
      defProvider.baseUrl.trim() ||
      config.baseUrl.trim() ||
      DEFAULT_PROVIDER_CONFIG.baseUrl,
    modelName:
      defProvider.defaultModel.trim() ||
      config.modelName.trim() ||
      DEFAULT_PROVIDER_CONFIG.modelName,
    apiKeys: orderedKeys,
    apiKey: orderedKeys[0] ?? '',
    keyCount: orderedKeys.length,
    keyStartIndex: startSlot,
    keyStrategy: strategy,
    isOverride: false,
    isExternalCli: false,
    isInstantTactics: false,
  };
}

export function buildInferenceHeaders(resolved: ResolvedInferenceConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-ai-base-url': resolved.baseUrl,
    'x-ai-model-name': resolved.modelName,
    'x-ai-api-key': resolved.apiKey,
  };
  if (resolved.apiKeys.length > 1) {
    headers['x-ai-api-keys'] = JSON.stringify(resolved.apiKeys.slice(0, 12));
  }
  return headers;
}

export function computeActualKeySlot(
  resolved: ResolvedInferenceConfig,
  keyAttemptIndex?: number,
): number | undefined {
  if (resolved.keyCount <= 0) return undefined;
  const offset = typeof keyAttemptIndex === 'number' && keyAttemptIndex >= 0 ? keyAttemptIndex : 0;
  return ((resolved.keyStartIndex - 1 + offset) % resolved.keyCount) + 1;
}

export function countCharacterOverrides(config: AIProviderConfig): number {
  if (!config.characterModels) return 0;
  let count = 0;
  for (const val of Object.values(config.characterModels)) {
    if (val && val.providerId && val.model.trim()) {
      count += 1;
    }
  }
  return count;
}

export function isGeminiEndpoint(baseUrl: string): boolean {
  return baseUrl.trim().toLowerCase().startsWith('https://generativelanguage.googleapis.com');
}

export function getOverrideProvidersNeedingKeys(
  config: AIProviderConfig,
  hasServerDefaultKey: boolean,
): AIProviderEntry[] {
  if (!config.characterModels) return [];
  const providers = getConfiguredProviders(config);
  const byId = new Map(providers.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const missing: AIProviderEntry[] = [];

  for (const val of Object.values(config.characterModels)) {
    if (!val || !val.providerId || !val.model.trim()) continue;
    if (
      val.providerId === EXTERNAL_CLI_PROVIDER_ID ||
      val.providerId === INSTANT_TACTICS_PROVIDER_ID
    ) {
      continue;
    }
    if (seen.has(val.providerId)) continue;
    seen.add(val.providerId);
    const provider = byId.get(val.providerId);
    if (!provider) continue;
    if (cleanApiKeysList(provider.apiKeys).length > 0) continue;
    if (isGeminiEndpoint(provider.baseUrl) && hasServerDefaultKey) continue;
    missing.push(provider);
  }
  return missing;
}

export function formatCompactModelName(modelName: string): string {
  const cleaned = modelName.trim();
  if (!cleaned) return DEFAULT_PROVIDER_CONFIG.modelName;
  const slashIdx = cleaned.lastIndexOf('/');
  const short = slashIdx >= 0 ? cleaned.slice(slashIdx + 1) : cleaned;
  return short.length > 26 ? `${short.slice(0, 24)}…` : short;
}
