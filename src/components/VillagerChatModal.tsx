import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { buildInferenceHeaders, resolveInferenceConfig } from '../lib/aiRouting.ts';
import { getAgentTopBonds } from '../lib/townSystems.ts';
import {
  getStructureDisplayLabel,
  LOCATION_LABELS,
  type AgentId,
  type AgentRecord,
  type AIProviderConfig,
  type TimeOfDay,
  type TownRelationship,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';

interface ChatMessage {
  id: string;
  role: 'player' | 'villager';
  text: string;
  modelUsed?: string;
}

interface VillagerChatModalProps {
  agent: AgentRecord | null;
  agents: AgentRecord[];
  structures: TownStructure[];
  relationships: TownRelationship[];
  townName: string;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  providerConfig: AIProviderConfig;
  onClose: () => void;
  onVillagerReplied: (agentId: AgentId, reply: string) => void;
}

function buildLocalVillagerReply(
  agent: AgentRecord,
  userMessage: string,
  townName: string,
  workplace: string,
  topFriendName: string | null,
  weather: WeatherMode,
  timeOfDay: TimeOfDay,
): string {
  const lower = userMessage.toLowerCase();
  if (/(how are you|hello|hi|hey|morning|evening|greetings)/.test(lower)) {
    const moodBit =
      weather === 'rain'
        ? 'staying dry while the rain patters down'
        : weather === 'winter'
          ? 'keeping warm in the crisp winter air'
          : timeOfDay === 'night'
            ? 'winding down under the warm lanterns'
            : `enjoying a fine ${timeOfDay} in ${townName}`;
    return `Good to see you! I'm ${moodBit} over by ${workplace}, right in the middle of ${agent.currentTask.toLowerCase()}.`;
  }
  if (/(work|task|doing|build|craft|busy|job)/.test(lower)) {
    return `Right now as ${agent.role}, my focus is: ${agent.currentTask}. ${
      topFriendName
        ? `${topFriendName} checked in earlier and kept spirits high!`
        : 'Everything at the site is moving smoothly!'
    }`;
  }
  if (/(friend|neighbor|town|dog|barnaby|feel|happy|like)/.test(lower)) {
    return topFriendName
      ? `${townName} feels like home! I've been chatting a lot with ${topFriendName} lately, and Barnaby the town dog even trotted past ${workplace} to say hello.`
      : `${townName} is coming together wonderfully — Barnaby the town dog trotted right past ${workplace} earlier and cheered everyone up!`;
  }
  if (/(idea|suggest|need|wish|next|build)/.test(lower)) {
    return `If you ask me, adding street decor or launching a plaza festival would lift morale across ${townName} — and I'll keep giving my best at ${workplace}!`;
  }
  return `Thanks for stopping by ${workplace}! As ${agent.role}, I'll keep that in mind while I finish ${agent.currentTask.toLowerCase()}.`;
}

export function VillagerChatModal({
  agent,
  agents,
  structures,
  relationships,
  townName,
  weather,
  timeOfDay,
  providerConfig,
  onClose,
  onVillagerReplied,
}: VillagerChatModalProps) {
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const workplace = useMemo(() => {
    if (!agent) return 'Town Square';
    const plotKey = agent.assignedPlotId || agent.activePlotId;
    const assigned = plotKey ? structures.find((s) => s.plotId === plotKey) : null;
    if (assigned) return getStructureDisplayLabel(assigned);
    return LOCATION_LABELS[agent.location] || 'Town Square';
  }, [agent, structures]);

  const topBonds = useMemo(() => {
    if (!agent) return [];
    return getAgentTopBonds(agent.id, relationships, agents, 2);
  }, [agent, relationships, agents]);

  const messages: ChatMessage[] = useMemo(() => {
    if (!agent) return [];
    const existing = messagesByAgent[agent.id];
    if (existing && existing.length > 0) return existing;
    return [
      {
        id: `greet-${agent.id}`,
        role: 'villager',
        text:
          agent.dialogue ||
          `Hello! I'm ${agent.name}, ${agent.role} at ${workplace}. What brings you by today?`,
      },
    ];
  }, [agent, messagesByAgent, workplace]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, agent?.id]);

  if (!agent) return null;

  const starterChips = [
    'How is your work going today?',
    'Who are your closest friends here?',
    'Any ideas for our town next?',
  ];

  const handleSend = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);

    const playerMsg: ChatMessage = {
      id: `p-${Date.now()}`,
      role: 'player',
      text,
    };
    const prior = messages;
    const nextWithPlayer = [...prior, playerMsg].slice(-16);
    setMessagesByAgent((prev) => ({ ...prev, [agent.id]: nextWithPlayer }));

    const resolved = resolveInferenceConfig(providerConfig, agent.id);
    let replyText = '';
    let modelUsed: string | undefined;

    if (!resolved.isExternalCli && resolved.apiKeys.length > 0) {
      try {
        const resp = await fetch('/api/town/villager-chat', {
          method: 'POST',
          headers: buildInferenceHeaders(resolved),
          body: JSON.stringify({
            villager: {
              name: agent.name,
              role: agent.role,
              department: agent.department,
              personality: agent.personality,
              currentTask: agent.currentTask,
              location: agent.location,
            },
            message: text,
            history: prior.slice(-4).map((m) => ({ role: m.role, text: m.text })),
            townName,
            weather,
            timeOfDay,
            friends: topBonds.map((b) => b.partnerName),
            workplace,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { reply?: string; modelUsed?: string };
          if (data.reply) {
            replyText = data.reply;
            modelUsed = data.modelUsed;
          }
        }
      } catch {
        // Fall through to zero-token local reply
      }
    }

    if (!replyText) {
      replyText = buildLocalVillagerReply(
        agent,
        text,
        townName,
        workplace,
        topBonds[0]?.partnerName || null,
        weather,
        timeOfDay,
      );
    }

    const villagerMsg: ChatMessage = {
      id: `v-${Date.now()}`,
      role: 'villager',
      text: replyText,
      modelUsed,
    };
    setMessagesByAgent((prev) => ({
      ...prev,
      [agent.id]: [...nextWithPlayer, villagerMsg].slice(-16),
    }));
    onVillagerReplied(agent.id, replyText);
    setSending(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${agent.name}`}
    >
      <div className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 font-display text-sm font-bold text-slate-950"
              style={{ backgroundColor: agent.accentColor }}
            >
              {agent.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate font-display text-sm font-semibold text-white">
                  {agent.name}
                </h2>
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              </div>
              <p className="truncate text-[11px] text-slate-400">
                {agent.role} · {workplace}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close villager chat"
            className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Bonds & Task Context Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/60 px-4 py-2 text-[11px] text-slate-300">
          <span className="truncate">Task: {agent.currentTask}</span>
          {topBonds.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-rose-300">
              <Heart className="h-3 w-3" />
              <span>{topBonds.map((b) => b.partnerName).join(', ')}</span>
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="hud-scroll flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'player' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'player'
                    ? 'bg-amber-500 font-medium text-slate-950'
                    : 'border border-white/10 bg-slate-900 text-slate-100'
                }`}
              >
                {m.text}
              </div>
              {m.modelUsed && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>{m.modelUsed}</span>
                </span>
              )}
            </div>
          ))}
          {sending && (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              <span>{agent.name} is replying...</span>
            </div>
          )}
        </div>

        {/* Starter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/10 px-3 py-2">
          {starterChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={sending}
              onClick={() => void handleSend(chip)}
              className="shrink-0 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-slate-300 transition-colors hover:border-amber-400/40 hover:text-white disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend(draft);
          }}
          className="flex items-center gap-2 border-t border-white/10 bg-slate-900/80 p-3"
        >
          <input
            type="text"
            maxLength={240}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Talk to ${agent.name}...`}
            className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 text-base text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="inline-flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-45"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
