export type SearchProviderPreset = 'tavily' | 'exa' | 'serper' | 'brave' | 'custom';
export type SearchKeyStrategy = 'round_robin' | 'failover';

export interface SearchProviderEntry {
  id: string;
  name: string;
  preset: SearchProviderPreset;
  endpointUrl: string;
  apiKeys: string[];
  keyStrategy: SearchKeyStrategy;
  builtIn?: boolean;
}

export interface WebSearchConfig {
  defaultProviderId: string;
  providers: SearchProviderEntry[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchResponse {
  ok: boolean;
  results: WebSearchResult[];
  providerName: string;
  mode: 'proxy' | 'direct';
  keySlotUsed?: number;
  error?: string;
}

export const WEB_SEARCH_STORAGE_KEY = 'alderbrook_web_search_v1';
export const MAYOR_WEB_SEARCH_TOGGLE_KEY = 'alderbrook_mayor_web_search_enabled';

export const DEFAULT_SEARCH_PROVIDERS: SearchProviderEntry[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    preset: 'tavily',
    endpointUrl: 'https://api.tavily.com/search',
    apiKeys: [],
    keyStrategy: 'round_robin',
    builtIn: true,
  },
  {
    id: 'exa',
    name: 'Exa',
    preset: 'exa',
    endpointUrl: 'https://api.exa.ai/search',
    apiKeys: [],
    keyStrategy: 'round_robin',
    builtIn: true,
  },
  {
    id: 'serper',
    name: 'Serper',
    preset: 'serper',
    endpointUrl: 'https://google.serper.dev/search',
    apiKeys: [],
    keyStrategy: 'round_robin',
    builtIn: true,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    preset: 'brave',
    endpointUrl: 'https://api.search.brave.com/res/v1/web/search',
    apiKeys: [],
    keyStrategy: 'round_robin',
    builtIn: true,
  },
];

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  defaultProviderId: 'tavily',
  providers: DEFAULT_SEARCH_PROVIDERS.map((p) => ({ ...p, apiKeys: [] })),
};

const searchKeyCursors = new Map<string, number>();

export function cleanSearchApiKeys(rawKeys: string[] | undefined): string[] {
  if (!Array.isArray(rawKeys)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of rawKeys) {
    const trimmed = String(k ?? '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 20) break;
  }
  return out;
}

export function sanitizeWebSearchConfig(raw: unknown): WebSearchConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<WebSearchConfig>;
  const rawList = Array.isArray(input.providers) ? input.providers : [];
  const byId = new Map<string, SearchProviderEntry>();

  // Always seed built-in presets so Tavily, Exa, Serper, and Brave are ready out-of-the-box
  for (const preset of DEFAULT_SEARCH_PROVIDERS) {
    byId.set(preset.id, { ...preset, apiKeys: [] });
  }

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id ?? '').trim().slice(0, 48);
    if (!id) continue;
    const existing = byId.get(id);
    const preset: SearchProviderPreset =
      item.preset === 'tavily' ||
      item.preset === 'exa' ||
      item.preset === 'serper' ||
      item.preset === 'brave' ||
      item.preset === 'custom'
        ? item.preset
        : existing?.preset ?? 'custom';
    const keyStrategy: SearchKeyStrategy =
      item.keyStrategy === 'failover' ? 'failover' : 'round_robin';
    byId.set(id, {
      id,
      name: String(item.name ?? existing?.name ?? 'Custom Search').trim().slice(0, 48) || 'Custom Search',
      preset,
      endpointUrl:
        String(item.endpointUrl ?? existing?.endpointUrl ?? '').trim().slice(0, 300) ||
        existing?.endpointUrl ||
        '',
      apiKeys: cleanSearchApiKeys(item.apiKeys),
      keyStrategy,
      builtIn: Boolean(existing?.builtIn),
    });
  }

  const providers = Array.from(byId.values());
  const defaultProviderId = byId.has(String(input.defaultProviderId ?? ''))
    ? String(input.defaultProviderId)
    : providers[0]?.id ?? 'tavily';

  return { defaultProviderId, providers };
}

export function loadWebSearchConfig(): WebSearchConfig {
  try {
    const raw = window.localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
    if (!raw) return sanitizeWebSearchConfig(DEFAULT_WEB_SEARCH_CONFIG);
    return sanitizeWebSearchConfig(JSON.parse(raw));
  } catch {
    return sanitizeWebSearchConfig(DEFAULT_WEB_SEARCH_CONFIG);
  }
}

export function saveWebSearchConfig(config: WebSearchConfig): WebSearchConfig {
  const clean = sanitizeWebSearchConfig(config);
  try {
    window.localStorage.setItem(WEB_SEARCH_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota errors
  }
  return clean;
}

export function createCustomSearchProvider(existingIds: Set<string>): SearchProviderEntry {
  let idx = 1;
  let id = `custom_search_${idx}`;
  while (existingIds.has(id)) {
    idx++;
    id = `custom_search_${idx}`;
  }
  return {
    id,
    name: idx === 1 ? 'Custom Search' : `Custom Search ${idx}`,
    preset: 'custom',
    endpointUrl: 'https://api.example.com/search',
    apiKeys: [],
    keyStrategy: 'round_robin',
    builtIn: false,
  };
}

export function getActiveSearchProvider(config: WebSearchConfig): SearchProviderEntry {
  const clean = sanitizeWebSearchConfig(config);
  const chosen = clean.providers.find((p) => p.id === clean.defaultProviderId);
  if (chosen && cleanSearchApiKeys(chosen.apiKeys).length > 0) {
    return chosen;
  }
  // Auto-fallback to any other search provider that has at least 1 API key configured
  const withKey = clean.providers.find((p) => cleanSearchApiKeys(p.apiKeys).length > 0);
  return withKey ?? chosen ?? clean.providers[0];
}

export function hasAnySearchApiKey(config: WebSearchConfig): boolean {
  return config.providers.some((p) => cleanSearchApiKeys(p.apiKeys).length > 0);
}

function getRotatedKeys(provider: SearchProviderEntry): { keys: string[]; startSlot: number } {
  const valid = cleanSearchApiKeys(provider.apiKeys);
  if (valid.length <= 1 || provider.keyStrategy === 'failover') {
    return { keys: valid, startSlot: 0 };
  }
  const cursor = searchKeyCursors.get(provider.id) ?? 0;
  const startSlot = cursor % valid.length;
  searchKeyCursors.set(provider.id, (cursor + 1) % valid.length);
  return {
    keys: [...valid.slice(startSlot), ...valid.slice(0, startSlot)],
    startSlot,
  };
}

function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

export function normalizeRawSearchResults(
  preset: SearchProviderPreset,
  data: unknown,
  maxResults = 5,
): WebSearchResult[] {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  let rawItems: unknown[] = [];

  if (preset === 'tavily' || preset === 'exa') {
    rawItems = Array.isArray(obj.results) ? obj.results : [];
  } else if (preset === 'serper') {
    rawItems = Array.isArray(obj.organic)
      ? obj.organic
      : Array.isArray(obj.news)
        ? obj.news
        : [];
  } else if (preset === 'brave') {
    const web = obj.web as { results?: unknown[] } | undefined;
    rawItems = Array.isArray(web?.results)
      ? web.results
      : Array.isArray(obj.results)
        ? obj.results
        : [];
  } else {
    rawItems = Array.isArray(obj.results)
      ? obj.results
      : Array.isArray(obj.organic)
        ? obj.organic
        : Array.isArray(obj.items)
          ? obj.items
          : Array.isArray(obj.data)
            ? obj.data
            : [];
  }

  const out: WebSearchResult[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const url = String(rec.url ?? rec.link ?? '').trim();
    const title = String(rec.title ?? rec.name ?? url).trim().slice(0, 140);
    const rawSnippet =
      rec.content ??
      rec.snippet ??
      rec.description ??
      rec.text ??
      (Array.isArray(rec.highlights) ? rec.highlights[0] : '') ??
      '';
    const snippet = String(rawSnippet).replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!title && !url) continue;
    out.push({
      title: title || 'Web Result',
      url: url || '#',
      snippet: snippet || title,
      source: extractHostname(url),
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

async function directBrowserSearch(
  provider: SearchProviderEntry,
  rotatedKeys: string[],
  startSlot: number,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  let lastError = 'Direct browser search failed (CORS may require full-stack proxy).';

  for (let i = 0; i < rotatedKeys.length; i++) {
    const key = rotatedKeys[i];
    const slot = (startSlot + i) % rotatedKeys.length;
    try {
      let res: Response;
      if (provider.preset === 'tavily') {
        res = await fetch(provider.endpointUrl || 'https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: key,
            query,
            max_results: maxResults,
            search_depth: 'basic',
          }),
        });
      } else if (provider.preset === 'exa') {
        res = await fetch(provider.endpointUrl || 'https://api.exa.ai/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
          },
          body: JSON.stringify({
            query,
            numResults: maxResults,
            contents: { highlights: { numSentences: 2 } },
          }),
        });
      } else if (provider.preset === 'serper') {
        res = await fetch(provider.endpointUrl || 'https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': key,
          },
          body: JSON.stringify({ q: query, num: maxResults }),
        });
      } else if (provider.preset === 'brave') {
        const u = new URL(provider.endpointUrl || 'https://api.search.brave.com/res/v1/web/search');
        u.searchParams.set('q', query);
        u.searchParams.set('count', String(maxResults));
        res = await fetch(u.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': key,
          },
        });
      } else {
        res = await fetch(provider.endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'x-api-key': key,
          },
          body: JSON.stringify({ query, q: query, max_results: maxResults, num: maxResults }),
        });
      }

      if (res.ok) {
        const data = (await res.json()) as unknown;
        const results = normalizeRawSearchResults(provider.preset, data, maxResults);
        return {
          ok: true,
          results,
          providerName: provider.name,
          mode: 'direct',
          keySlotUsed: slot + 1,
        };
      }

      const errText = await res.text().catch(() => '');
      lastError = `${provider.name} HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`;
      // Rotate to next key on auth/quota/rate-limit/server errors
      if (![401, 402, 403, 429, 500, 502, 503, 504].includes(res.status)) {
        break;
      }
    } catch (err) {
      lastError =
        err instanceof Error
          ? `${err.message} (${provider.name} may block browser CORS on static hosts — Tavily/Exa work best on static hosts)`
          : 'Network error during direct search.';
      break;
    }
  }

  return {
    ok: false,
    results: [],
    providerName: provider.name,
    mode: 'direct',
    error: lastError,
  };
}

export async function executeWebSearch(
  config: WebSearchConfig,
  query: string,
  maxResults = 5,
  overrideProvider?: SearchProviderEntry,
): Promise<WebSearchResponse> {
  const provider = overrideProvider ?? getActiveSearchProvider(config);
  const { keys: rotatedKeys, startSlot } = getRotatedKeys(provider);

  if (rotatedKeys.length === 0) {
    return {
      ok: false,
      results: [],
      providerName: provider.name,
      mode: 'proxy',
      error: `No API key configured for ${provider.name}. Open AI Providers → Web Search Providers to add a key.`,
    };
  }

  // 1) Try full-stack backend proxy first (handles Brave/Serper CORS seamlessly on Render/Node)
  try {
    const proxyRes = await fetch('/api/search/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: provider.preset,
        providerName: provider.name,
        endpointUrl: provider.endpointUrl,
        apiKeys: rotatedKeys,
        query: query.trim().slice(0, 260),
        maxResults: Math.max(1, Math.min(8, maxResults)),
      }),
    });

    if (proxyRes.status !== 404) {
      const data = (await proxyRes.json()) as {
        ok?: boolean;
        results?: WebSearchResult[];
        keyAttemptIndex?: number;
        error?: string;
      };
      if (proxyRes.ok && data.ok) {
        const slot = (startSlot + (data.keyAttemptIndex ?? 0)) % rotatedKeys.length;
        return {
          ok: true,
          results: Array.isArray(data.results) ? data.results.slice(0, maxResults) : [],
          providerName: provider.name,
          mode: 'proxy',
          keySlotUsed: slot + 1,
        };
      }
      return {
        ok: false,
        results: [],
        providerName: provider.name,
        mode: 'proxy',
        error: data.error || `Search proxy failed (HTTP ${proxyRes.status}).`,
      };
    }
  } catch {
    // 404 or static host (Hugging Face Spaces) -> fall back cleanly to direct browser fetch
  }

  // 2) Static host fallback: direct browser fetch (works for CORS-friendly APIs like Tavily & Exa)
  return directBrowserSearch(provider, rotatedKeys, startSlot, query, maxResults);
}
