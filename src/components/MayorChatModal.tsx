import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu,
  Crown,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  advanceProviderKeyCursor,
  buildInferenceHeaders,
  formatCompactModelName,
  resolveInferenceConfig,
} from '../lib/aiRouting.ts';
import {
  executeWebSearch,
  hasAnySearchApiKey,
  MAYOR_WEB_SEARCH_TOGGLE_KEY,
  type WebSearchConfig,
  type WebSearchResult,
} from '../lib/webSearch.ts';
import {
  getWeatherSeasonEffect,
  MAX_TOWN_AGENTS,
  STRUCTURE_META,
  type AgentRecord,
  type AIProviderConfig,
  type StructureType,
  type TimeOfDay,
  type TownLogItem,
  type TownMetrics,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';

export interface MayorBuildResult {
  ok: boolean;
  badge: string;
  detail: string;
}

export interface ResearchDispatchResult {
  scoutName: string;
  hiredNew: boolean;
}

interface MayorChatModalProps {
  isOpen: boolean;
  isPlaying: boolean;
  agents: AgentRecord[];
  structures: TownStructure[];
  logs: TownLogItem[];
  metrics: TownMetrics;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  activeDecree: string;
  providerConfig: AIProviderConfig;
  webSearchConfig: WebSearchConfig;
  hasServerDefaultKey: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onBuildStructure: (structureType: StructureType, displayLabel?: string) => Promise<MayorBuildResult>;
  onHireWorker: (prompt: string) => Promise<string | null>;
  onIssueDecree: (decree: string) => Promise<void>;
  onDispatchResearcher: (topic: string) => Promise<ResearchDispatchResult>;
  onMayorSpeak: (dialogue: string) => void;
  onOpenWebSearchSettings: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'player' | 'mayor';
  text: string;
  badge?: string;
  modelTag?: string;
  sources?: WebSearchResult[];
  needsSearchSetup?: boolean;
  timestampMs: number;
}

interface MayorActionPlan {
  type: 'none' | 'build' | 'hire' | 'decree';
  target?: string;
  workerPrompt?: string;
  decree?: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const BASE_STARTER_CHIPS = [
  "What's happening in town?",
  'Build a Cafe Shop',
  'Hire a worker',
  'Status report',
];

const MAX_CHAT_MESSAGES = 30;

function loadWebSearchEnabled(config: WebSearchConfig): boolean {
  try {
    const saved = window.localStorage.getItem(MAYOR_WEB_SEARCH_TOGGLE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Ignore storage issues
  }
  return hasAnySearchApiKey(config);
}

function mapBuildingRequest(rawText: string): {
  structureType: StructureType;
  displayLabel: string;
} {
  const lower = rawText.toLowerCase();
  if (lower.includes('cafe') || lower.includes('coffee') || lower.includes('espresso') || lower.includes('tea')) {
    return { structureType: 'bakery', displayLabel: 'Artisan Cafe' };
  }
  if (lower.includes('bakery') || lower.includes('bread') || lower.includes('pastry')) {
    return { structureType: 'bakery', displayLabel: STRUCTURE_META.bakery.label };
  }
  if (lower.includes('watchtower') || lower.includes('tower') || lower.includes('guard') || lower.includes('fort')) {
    return { structureType: 'watchtower', displayLabel: STRUCTURE_META.watchtower.label };
  }
  if (lower.includes('greenhouse') || lower.includes('farm') || lower.includes('garden') || lower.includes('botanic')) {
    return { structureType: 'greenhouse', displayLabel: STRUCTURE_META.greenhouse.label };
  }
  if (lower.includes('windmill') || lower.includes('mill') || lower.includes('wind')) {
    return { structureType: 'windmill', displayLabel: STRUCTURE_META.windmill.label };
  }
  if (lower.includes('library') || lower.includes('book') || lower.includes('school') || lower.includes('archive')) {
    return { structureType: 'library', displayLabel: STRUCTURE_META.library.label };
  }
  if (lower.includes('granary') || lower.includes('barn') || lower.includes('silo') || lower.includes('storage')) {
    return { structureType: 'granary', displayLabel: STRUCTURE_META.granary.label };
  }
  if (lower.includes('pavilion') || lower.includes('stage') || lower.includes('music') || lower.includes('gazebo')) {
    return { structureType: 'pavilion', displayLabel: STRUCTURE_META.pavilion.label };
  }
  if (lower.includes('clock') || lower.includes('bell')) {
    return { structureType: 'clock_tower', displayLabel: STRUCTURE_META.clock_tower.label };
  }
  return { structureType: 'bakery', displayLabel: rawText.trim().slice(0, 32) || 'Artisan Cafe' };
}

function buildLiveStatusSummary(
  weather: WeatherMode,
  timeOfDay: TimeOfDay,
  metrics: TownMetrics,
  agents: AgentRecord[],
  structures: TownStructure[],
  logs: TownLogItem[],
): string {
  const eff = getWeatherSeasonEffect(weather, structures);
  const built = structures.filter((s) => s.status === 'complete').length;
  const building = structures.filter((s) => s.status === 'building');
  const latestLog = logs.find((l) => l.dialogue && l.agentId !== 'weather_shift');
  const activeWorker = agents.find((a) => a.rank >= 2) ?? agents[0];

  const sitePart =
    building.length > 0
      ? `${STRUCTURE_META[building[0].structureType].label} is at ${building[0].progress}% construction`
      : built > 0
        ? `${built}/8 town structures are open and active`
        : 'all 8 building plots are ready for your first project';

  const pulsePart = `Pulse sits at Prosperity ${metrics.prosperity}, Order ${metrics.orderLevel}, Morale ${metrics.morale}`;
  const activityPart = latestLog
    ? `Most recently, ${latestLog.agentName} reported: "${latestLog.dialogue.slice(0, 72)}"`
    : activeWorker
      ? `${activeWorker.name} is busy with "${activeWorker.currentTask.slice(0, 56)}"`
      : 'Everyone is awaiting orders';

  return `It's a ${timeOfDay} in ${eff.label} with ${agents.length}/${MAX_TOWN_AGENTS} villagers — ${sitePart}. ${pulsePart}. ${activityPart}.`;
}

function isSimpleGreeting(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[!?.,']/g, '').trim();
  return /^(hi|hello|hey|howdy|yo|greetings|good morning|good afternoon|good evening|hi mayor|hello mayor|hey mayor|mayor sterling|mayor)$/.test(
    cleaned,
  );
}

function isSimpleStatusCheck(text: string): boolean {
  const lower = text.toLowerCase();
  const hasActionVerb = /\b(build|construct|make|open|hire|recruit|employ|decree|announce|festival|news|search|weather in)\b/.test(
    lower,
  );
  if (hasActionVerb) return false;
  return /\b(what'?s happening|what is happening|status|report|how is (the )?town|how are things|whats up|what's up|town update|brief me)\b/.test(
    lower,
  );
}

function isLiveWebResearchQuery(text: string): boolean {
  const lower = text.toLowerCase();
  // Avoid triggering web search for purely local Alderbrook build/hire commands
  if (
    /\b(build|construct|hire|recruit|upgrade)\b/.test(lower) &&
    !/\b(news|search|look up|internet|web|headlines|latest)\b/.test(lower)
  ) {
    return false;
  }
  return /\b(world news|5 world news|news|headlines|search|look up|lookup|google|latest|breaking|weather in|forecast in|price of|stock|bitcoin|crypto|score|who won|what happened in|today'?s|live info|internet|online|research)\b/.test(
    lower,
  );
}

function cleanSearchQueryFromMessage(text: string): string {
  const stripped = text
    .replace(/^🌐\s*/u, '')
    .replace(/^(mayor\s*,?\s*)/i, '')
    .replace(/^(give me|tell me|can you|please|search for|search|look up|find)\s+/i, '')
    .trim();
  if (/^5\s+world\s+news$/i.test(stripped) || /^world\s+news$/i.test(stripped)) {
    return 'top 5 world news headlines today';
  }
  return stripped.slice(0, 180) || 'top 5 world news headlines today';
}

function parseLocalIntent(text: string): { reply: string; action: MayorActionPlan } | null {
  const lower = text.toLowerCase();

  if (
    /\b(build|construct|erect|open|add|make|create|upgrade)\b/.test(lower) &&
    /\b(cafe|coffee|shop|bakery|watchtower|tower|greenhouse|farm|windmill|mill|library|granary|pavilion|clock|building|plot|store)\b/.test(
      lower,
    )
  ) {
    const mapped = mapBuildingRequest(text);
    return {
      reply: `Splendid idea! I'm rallying Architect Lyra and our builders to get the ${mapped.displayLabel} underway right away.`,
      action: { type: 'build', target: mapped.displayLabel },
    };
  }

  if (/\b(hire|recruit|employ|bring in|add a worker|need a|get a)\b/.test(lower)) {
    const cleanedPrompt = text
      .replace(/^(mayor\s*,?\s*)/i, '')
      .trim()
      .slice(0, 180);
    return {
      reply: `On it! I'm sending word to the Guild Hall to recruit for "${cleanedPrompt}".`,
      action: { type: 'hire', workerPrompt: cleanedPrompt || 'Hire a skilled town worker' },
    };
  }

  if (/\b(decree|proclaim|announce|festival|celebrate|declare)\b/.test(lower)) {
    const cleanedDecree = text.replace(/^(mayor\s*,?\s*)/i, '').trim().slice(0, 220);
    return {
      reply: `By order of Town Hall, I'll proclaim this across Alderbrook immediately!`,
      action: { type: 'decree', decree: cleanedDecree },
    };
  }

  return null;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function MayorChatModal({
  isOpen,
  isPlaying,
  agents,
  structures,
  logs,
  metrics,
  weather,
  timeOfDay,
  activeDecree,
  providerConfig,
  webSearchConfig,
  hasServerDefaultKey,
  onClose,
  onTogglePlay,
  onBuildStructure,
  onHireWorker,
  onIssueDecree,
  onDispatchResearcher,
  onMayorSpeak,
  onOpenWebSearchSettings,
}: MayorChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'mayor-welcome',
      sender: 'mayor',
      text: "Welcome to Town Hall! Ask what's happening in Alderbrook, tell me what to build (like a Cafe Shop), hire workers, or enable Web Search for live world news.",
      modelTag: 'Instant · 0 tokens',
      timestampMs: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('Mayor Sterling is checking the town ledger…');
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() =>
    loadWebSearchEnabled(webSearchConfig),
  );
  const [voiceReadout, setVoiceReadout] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const resolvedMayorModel = useMemo(
    () => resolveInferenceConfig(providerConfig, 'mayor_sterling'),
    [providerConfig],
  );

  const speechInputSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const speechOutputSupported = useMemo(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    [],
  );

  const hasUsableMayorLlm =
    !resolvedMayorModel.isExternalCli &&
    (resolvedMayorModel.apiKeys.length > 0 ||
      (resolvedMayorModel.providerId === 'gemini' && hasServerDefaultKey));

  const modelBadgeLabel = resolvedMayorModel.isExternalCli
    ? 'External CLI · 0 tokens'
    : hasUsableMayorLlm
      ? formatCompactModelName(resolvedMayorModel.modelName)
      : 'Fast Local Mode · 0 tokens';

  const starterChips = useMemo(
    () => (webSearchEnabled ? ['🌐 5 World News', ...BASE_STARTER_CHIPS] : BASE_STARTER_CHIPS),
    [webSearchEnabled],
  );

  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen) {
      recognitionRef.current?.stop();
      setIsListening(false);
      if (speechOutputSupported) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen, speechOutputSupported]);

  if (!isOpen) return null;

  const handleToggleWebSearch = () => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MAYOR_WEB_SEARCH_TOGGLE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const speakMayorReply = (text: string) => {
    if (!voiceReadout || !speechOutputSupported) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      utter.pitch = 0.96;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore browser TTS issues
    }
  };

  const appendMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg].slice(-MAX_CHAT_MESSAGES));
  };

  const executeMayorAction = async (
    action: MayorActionPlan,
    fallbackText: string,
  ): Promise<{ badge?: string; extraNote?: string }> => {
    if (action.type === 'build') {
      const mapped = mapBuildingRequest(action.target || fallbackText);
      const res = await onBuildStructure(mapped.structureType, mapped.displayLabel);
      return {
        badge: res.ok ? `🏗️ ${res.badge}` : `⚠️ ${res.badge}`,
        extraNote: res.ok ? undefined : res.detail,
      };
    }

    if (action.type === 'hire') {
      if (agents.length >= MAX_TOWN_AGENTS) {
        return {
          badge: `⚠️ Town Full (${MAX_TOWN_AGENTS}/${MAX_TOWN_AGENTS})`,
          extraNote: `We're already at our ${MAX_TOWN_AGENTS}-villager capacity for smooth mobile performance.`,
        };
      }
      const prompt = (action.workerPrompt || fallbackText).trim();
      const recruited = await onHireWorker(prompt);
      if (recruited) {
        return { badge: `👷 Hired: ${recruited}` };
      }
      return {
        badge: '⚠️ Hiring needs an AI key in Settings',
        extraNote: 'Open AI Providers settings to configure a key if you want AI-generated workers.',
      };
    }

    if (action.type === 'decree') {
      const decreeText = (action.decree || fallbackText).trim().slice(0, 220);
      if (decreeText) {
        await onIssueDecree(decreeText);
        return { badge: `📜 Decree: ${decreeText.slice(0, 42)}${decreeText.length > 42 ? '…' : ''}` };
      }
    }

    return {};
  };

  const handleSend = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setInput('');
    const now = Date.now();
    appendMessage({
      id: `player-${now}`,
      sender: 'player',
      text: trimmed,
      timestampMs: now,
    });

    setIsSending(true);
    setStatusNotice('Mayor Sterling is checking the town ledger…');

    try {
      // 1) Live Web Research Path (when Web Search is ON and user asks for live info)
      if (webSearchEnabled && isLiveWebResearchQuery(trimmed)) {
        if (!hasAnySearchApiKey(webSearchConfig)) {
          const setupReply =
            'Web Search is turned ON, but I need a Search API key (Tavily, Exa, Serper, or Brave Search) before my scouts can check the outside world.';
          onMayorSpeak(setupReply);
          appendMessage({
            id: `mayor-${Date.now()}`,
            sender: 'mayor',
            text: setupReply,
            badge: '🌐 Add a Web Search API Key',
            modelTag: 'Web Search Setup · 0 tokens',
            needsSearchSetup: true,
            timestampMs: Date.now(),
          });
          return;
        }

        const searchQuery = cleanSearchQueryFromMessage(trimmed);
        setStatusNotice(`Dispatching News Scout to research "${searchQuery.slice(0, 40)}"…`);

        // Dispatch existing News Scout / Archivist or recruit one (respecting 15-villager cap) & query search in parallel
        const [dispatchRes, searchRes] = await Promise.all([
          onDispatchResearcher(searchQuery),
          executeWebSearch(webSearchConfig, searchQuery, 5),
        ]);

        if (!searchRes.ok || searchRes.results.length === 0) {
          const failReply = `My scout ${dispatchRes.scoutName} tried searching via ${searchRes.providerName}, but hit a snag: ${
            searchRes.error || 'no results returned'
          }.`;
          onMayorSpeak(failReply.slice(0, 180));
          appendMessage({
            id: `mayor-${Date.now()}`,
            sender: 'mayor',
            text: failReply,
            badge: `⚠️ Search failed (${searchRes.providerName})`,
            modelTag: searchRes.providerName,
            needsSearchSetup: true,
            timestampMs: Date.now(),
          });
          return;
        }

        const topResults = searchRes.results.slice(0, 5);
        let summaryReply = '';
        let usedTag = `${searchRes.providerName} · 0 LLM tokens`;

        // Summarize with Mayor Sterling's configured LLM if available (1 compact call)
        if (hasUsableMayorLlm) {
          setStatusNotice(`Mayor Sterling is summarizing ${topResults.length} reports from ${dispatchRes.scoutName}…`);
          try {
            advanceProviderKeyCursor(resolvedMayorModel);
            const res = await fetch('/api/town/mayor-chat', {
              method: 'POST',
              headers: buildInferenceHeaders(resolvedMayorModel),
              body: JSON.stringify({
                message: trimmed,
                weather,
                timeOfDay,
                activeDecree,
                metrics,
                agents: agents.slice(0, 6).map((a) => ({
                  name: a.name,
                  role: a.role,
                  currentTask: a.currentTask,
                  location: a.location,
                })),
                structures: structures.map((s) => ({
                  plotId: s.plotId,
                  structureType: s.structureType,
                  status: s.status,
                  tier: s.tier,
                })),
                webResults: topResults,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { reply?: string; modelUsed?: string };
              if (data.reply) {
                summaryReply = data.reply;
                usedTag = `${formatCompactModelName(data.modelUsed || resolvedMayorModel.modelName)} + ${searchRes.providerName}`;
              }
            }
          } catch {
            // Fall back to direct zero-token formatted summary below
          }
        }

        if (!summaryReply) {
          summaryReply = `${dispatchRes.scoutName} just returned from the wire with ${topResults.length} fresh dispatches:\n${topResults
            .map((r, i) => `${i + 1}. ${r.title} (${r.source}) — ${r.snippet}`)
            .join('\n')}`;
        }

        const scoutBadge = dispatchRes.hiredNew
          ? `🌐 Hired & Dispatched ${dispatchRes.scoutName} · ${topResults.length} sources (${searchRes.providerName})`
          : `🌐 Researched by ${dispatchRes.scoutName} · ${topResults.length} sources (${searchRes.providerName})`;

        onMayorSpeak(`${dispatchRes.scoutName} brought back ${topResults.length} fresh reports on "${searchQuery.slice(0, 48)}"!`);
        speakMayorReply(summaryReply.slice(0, 320));
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: summaryReply,
          badge: scoutBadge,
          modelTag: usedTag,
          sources: topResults,
          timestampMs: Date.now(),
        });
        return;
      }

      // 2) Zero-Token Fast Path: simple greetings & status reports
      if (isSimpleGreeting(trimmed)) {
        const eff = getWeatherSeasonEffect(weather, structures);
        const reply = `Good day, friend! Alderbrook is in ${eff.label} (${timeOfDay}) with ${agents.length} villagers active. Ask for a status report, tell me what to build, or have me hire new hands!`;
        onMayorSpeak(reply);
        speakMayorReply(reply);
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: reply,
          modelTag: 'Instant · 0 tokens',
          timestampMs: Date.now(),
        });
        return;
      }

      if (isSimpleStatusCheck(trimmed)) {
        const reply = buildLiveStatusSummary(weather, timeOfDay, metrics, agents, structures, logs);
        onMayorSpeak(reply.slice(0, 180));
        speakMayorReply(reply);
        appendMessage({
          id: `mayor-${Date.now()}`,
          sender: 'mayor',
          text: reply,
          modelTag: 'Live Status · 0 tokens',
          timestampMs: Date.now(),
        });
        return;
      }

      // 3) Single-Call LLM Path (when Mayor Sterling has an active AI provider key)
      let replyText = '';
      let actionPlan: MayorActionPlan = { type: 'none' };
      let modelTag = 'Local Intent · 0 tokens';

      if (hasUsableMayorLlm) {
        try {
          advanceProviderKeyCursor(resolvedMayorModel);
          const res = await fetch('/api/town/mayor-chat', {
            method: 'POST',
            headers: buildInferenceHeaders(resolvedMayorModel),
            body: JSON.stringify({
              message: trimmed,
              history: messages.slice(-4).map((m) => ({ role: m.sender, text: m.text })),
              weather,
              timeOfDay,
              activeDecree,
              metrics,
              agents: agents.map((a) => ({
                name: a.name,
                role: a.role,
                currentTask: a.currentTask,
                location: a.location,
              })),
              structures: structures.map((s) => ({
                plotId: s.plotId,
                structureType: s.structureType,
                status: s.status,
                tier: s.tier,
              })),
              recentLogs: logs.slice(0, 4).map((l) => ({
                agentName: l.agentName,
                dialogue: l.dialogue,
              })),
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              reply?: string;
              action?: MayorActionPlan;
              modelUsed?: string;
            };
            if (data.reply) {
              replyText = data.reply;
              actionPlan = data.action ?? { type: 'none' };
              modelTag = formatCompactModelName(data.modelUsed || resolvedMayorModel.modelName);
            }
          }
        } catch {
          // Fall back cleanly to local intent parser below
        }
      }

      // 4) Local Intent Fallback (guaranteed action execution even offline / zero-token mode)
      if (!replyText) {
        const localIntent = parseLocalIntent(trimmed);
        if (localIntent) {
          replyText = localIntent.reply;
          actionPlan = localIntent.action;
        } else {
          replyText = `Heard loud and clear! ${buildLiveStatusSummary(
            weather,
            timeOfDay,
            metrics,
            agents,
            structures,
            logs,
          )} Say "Build a Cafe Shop" or "Hire a barista" anytime to put me to work.`;
        }
      } else if (actionPlan.type === 'none') {
        const fallbackIntent = parseLocalIntent(trimmed);
        if (fallbackIntent) {
          actionPlan = fallbackIntent.action;
        }
      }

      const execOutcome = await executeMayorAction(actionPlan, trimmed);
      const finalReply = execOutcome.extraNote
        ? `${replyText} ${execOutcome.extraNote}`
        : replyText;

      onMayorSpeak(finalReply.slice(0, 180));
      speakMayorReply(finalReply);
      appendMessage({
        id: `mayor-${Date.now()}`,
        sender: 'mayor',
        text: finalReply,
        badge: execOutcome.badge,
        modelTag,
        timestampMs: Date.now(),
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleMic = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput(transcript);
          void handleSend(transcript);
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mayor-chat-title"
    >
      <div className="flex h-[86dvh] max-h-[700px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-900 shadow-2xl">
        {/* Header Bar with Pause/Play + Web Search Toggle */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
              <Crown className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="mayor-chat-title"
                className="truncate font-display text-sm font-semibold text-white"
              >
                Mayor Sterling
              </h2>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Cpu className="h-3 w-3 shrink-0 text-amber-300/80" />
                <span className="truncate font-mono">{modelBadgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Web Search ON/OFF Toggle */}
            <button
              type="button"
              onClick={handleToggleWebSearch}
              aria-pressed={webSearchEnabled}
              title={
                webSearchEnabled
                  ? 'Web Search is ON — Mayor can look up live internet news'
                  : 'Web Search is OFF — tap to enable live internet search'
              }
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors ${
                webSearchEnabled
                  ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                  : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-slate-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span>Web: {webSearchEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Pause / Play Town Toggle */}
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause town simulation' : 'Play town simulation'}
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              }`}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {speechOutputSupported && (
              <button
                type="button"
                onClick={() => {
                  const next = !voiceReadout;
                  setVoiceReadout(next);
                  if (!next) window.speechSynthesis.cancel();
                }}
                title={voiceReadout ? 'Mute Mayor voice readout' : 'Read Mayor replies aloud'}
                aria-label={voiceReadout ? 'Mute Mayor voice' : 'Enable Mayor voice'}
                className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border transition-colors ${
                  voiceReadout
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {voiceReadout ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Mayor chat"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Live Back-and-Forth Chat Feed */}
        <div className="hud-scroll flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
          {messages.map((msg) => {
            const isPlayer = msg.sender === 'player';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isPlayer
                      ? 'rounded-br-sm bg-amber-500 font-medium text-slate-950'
                      : 'rounded-bl-sm border border-white/10 bg-slate-950/90 text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {msg.badge && (
                    <div className="mt-2 inline-flex items-center rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                      {msg.badge}
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2">
                      <div className="text-[10px] font-semibold tracking-wide text-cyan-300 uppercase">
                        Verified Web Sources
                      </div>
                      {msg.sources.map((src, idx) => (
                        <a
                          key={`${msg.id}-src-${idx}`}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                        >
                          <span className="truncate">
                            {idx + 1}. {src.title}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-slate-400">
                            <span>{src.source}</span>
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.needsSearchSetup && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenWebSearchSettings();
                      }}
                      className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Open Web Search Providers →</span>
                    </button>
                  )}
                </div>
                {!isPlayer && msg.modelTag && (
                  <span className="mt-1 px-1 font-mono text-[10px] text-slate-500">
                    Mayor Sterling · {msg.modelTag}
                  </span>
                )}
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-amber-200">
                {statusNotice}
              </div>
            </div>
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Starter Chips + Input Bar */}
        <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/95 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {starterChips.map((chip) => {
              const isWebChip = chip.startsWith('🌐');
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleSend(chip)}
                  className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    isWebChip
                      ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                      : 'border-white/10 bg-slate-900 text-slate-200 hover:border-amber-400/50 hover:text-amber-200'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend(input);
            }}
            className="flex items-center gap-1.5"
          >
            {speechInputSupported && (
              <button
                type="button"
                onClick={handleToggleMic}
                disabled={isSending}
                aria-label={isListening ? 'Stop voice input' : 'Speak to Mayor Sterling'}
                className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  isListening
                    ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                    : 'border-white/15 bg-slate-900 text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={260}
              disabled={isSending}
              placeholder={
                isListening
                  ? 'Listening… speak to Mayor Sterling'
                  : webSearchEnabled
                    ? 'Ask Mayor Sterling or search live world news…'
                    : 'Ask Mayor Sterling or give an order…'
              }
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-900 px-3 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!input.trim() || isSending}
              aria-label="Send message to Mayor Sterling"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
