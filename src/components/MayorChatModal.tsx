import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu,
  Crown,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
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
  hasServerDefaultKey: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onBuildStructure: (structureType: StructureType, displayLabel?: string) => Promise<MayorBuildResult>;
  onHireWorker: (prompt: string) => Promise<string | null>;
  onIssueDecree: (decree: string) => Promise<void>;
  onMayorSpeak: (dialogue: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'player' | 'mayor';
  text: string;
  badge?: string;
  modelTag?: string;
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

const STARTER_CHIPS = [
  "What's happening in town?",
  'Build a Cafe Shop',
  'Hire a worker',
  'Status report',
];

const MAX_CHAT_MESSAGES = 30;

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
  const hasActionVerb = /\b(build|construct|make|open|hire|recruit|employ|decree|announce|festival)\b/.test(
    lower,
  );
  if (hasActionVerb) return false;
  return /\b(what'?s happening|what is happening|status|report|how is (the )?town|how are things|whats up|what's up|town update|brief me|news)\b/.test(
    lower,
  );
}

function parseLocalIntent(text: string): { reply: string; action: MayorActionPlan } | null {
  const lower = text.toLowerCase();

  // Build intent
  if (/\b(build|construct|erect|open|add|make|create|upgrade)\b/.test(lower) &&
      /\b(cafe|coffee|shop|bakery|watchtower|tower|greenhouse|farm|windmill|mill|library|granary|pavilion|clock|building|plot|store)\b/.test(lower)) {
    const mapped = mapBuildingRequest(text);
    return {
      reply: `Splendid idea! I'm rallying Architect Lyra and our builders to get the ${mapped.displayLabel} underway right away.`,
      action: { type: 'build', target: mapped.displayLabel },
    };
  }

  // Hire intent
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

  // Decree intent
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
  hasServerDefaultKey,
  onClose,
  onTogglePlay,
  onBuildStructure,
  onHireWorker,
  onIssueDecree,
  onMayorSpeak,
}: MayorChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'mayor-welcome',
      sender: 'mayor',
      text: "Welcome to Town Hall! Ask what's happening in Alderbrook, tell me what to build (like a Cafe Shop), or have me hire new workers.",
      modelTag: 'Instant · 0 tokens',
      timestampMs: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
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

    try {
      // 1) Zero-Token Fast Path: simple greetings & status reports
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

      // 2) Single-Call LLM Path (when Mayor Sterling has an active AI provider key)
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

      // 3) Local Intent Fallback (guaranteed action execution even offline / zero-token mode)
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
        // Safety net: if LLM replied conversationally but missed an obvious build/hire order, catch it
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
      <div className="flex h-[84dvh] max-h-[680px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-900 shadow-2xl">
        {/* Header Bar with Pause / Play Toggle */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="mayor-chat-title"
                className="truncate font-display text-sm font-semibold text-white sm:text-base"
              >
                Mayor Sterling
              </h2>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Cpu className="h-3 w-3 shrink-0 text-amber-300/80" />
                <span className="truncate font-mono">{modelBadgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause town simulation' : 'Play town simulation'}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
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
                className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border transition-colors ${
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
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isPlayer
                      ? 'rounded-br-sm bg-amber-500 font-medium text-slate-950'
                      : 'rounded-bl-sm border border-white/10 bg-slate-950/90 text-slate-100'
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.badge && (
                    <div className="mt-2 inline-flex items-center rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                      {msg.badge}
                    </div>
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
                Mayor Sterling is checking the town ledger…
              </div>
            </div>
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Starter Chips + Input Bar */}
        <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/95 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isSending}
                onClick={() => void handleSend(chip)}
                className="min-h-[32px] rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:text-amber-200 disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
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
