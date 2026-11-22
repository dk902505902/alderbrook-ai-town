import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Radio,
  Send,
  Settings,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import type {
  AgentRecord,
  CliAgentActivity,
  SignalRelayConfig,
} from '../types/town.ts';

interface SignalRelayModalProps {
  isOpen: boolean;
  config: SignalRelayConfig;
  effectiveBaseUrl: string;
  effectiveTownId: string;
  agents: AgentRecord[];
  recentCliAgents: CliAgentActivity[];
  relayServerOnline: boolean;
  onClose: () => void;
  onUpdateConfig: (next: SignalRelayConfig) => void;
  onTestSignal: () => Promise<{ ok: boolean; message: string }>;
  onOpenAIProviders: () => void;
}

function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function generateRandomSecret(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(20);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted iframe contexts
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function SignalRelayModal({
  isOpen,
  config,
  effectiveBaseUrl,
  effectiveTownId,
  agents,
  recentCliAgents,
  relayServerOnline,
  onClose,
  onUpdateConfig,
  onTestSignal,
  onOpenAIProviders,
}: SignalRelayModalProps) {
  const [activeTab, setActiveTab] = useState<'relay' | 'help'>('relay');
  const [showSecret, setShowSecret] = useState(false);
  const [showSkillPreview, setShowSkillPreview] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testingSignal, setTestingSignal] = useState(false);
  const [testBanner, setTestBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const cleanBaseUrl = (config.baseUrl.trim() || effectiveBaseUrl).replace(/\/+$/, '');
  const cleanTownId = config.customTownId.trim() || effectiveTownId;
  const secret = config.agentSecret.trim();

  const villagerDirectory = useMemo(
    () => agents.map((a) => `- \`${a.id}\` — ${a.name} (${a.role}, Rank ${a.rank})`).join('\n'),
    [agents],
  );

  const skillMarkdown = useMemo(() => {
    const secretHeaderLine = secret
      ? `  -H "x-town-secret: ${secret}" \\\n`
      : '';
    const secretNote = secret
      ? `Include header \`x-town-secret: ${secret}\` on every request.`
      : `No \`x-town-secret\` header is currently required (optional).`;

    return `---
name: alderbrook-signal-relay
description: Observe and act inside Alderbrook AI Town via The Signal Relay REST API (works with OpenCode, Antigravity CLI agy, Freepuff, and Hermes Agent).
---

# Alderbrook AI Town — Signal Relay Skill

Connect directly to **Alderbrook AI Town** to read live town state and issue commands or speak/act as any villager (zero in-app LLM tokens needed).

## Connection Config
- **Base URL**: \`${cleanBaseUrl}\`
- **Town ID**: \`${cleanTownId}\`
- **Auth**: ${secretNote}
- **Hosting**: Requires the full-stack Node server (\`server.ts\`). The static Hugging Face build has no \`/api/*\` routes.

## 1. Read Compact Town State
\`GET ${cleanBaseUrl}/api/town/${cleanTownId}/state\`

Returns compact JSON: \`weather\`, \`season\`, \`theme\`, \`timeOfDay\`, \`pulse\`, \`stores\` (timber/stone/food/gold), \`economy\` (production, upkeep, net, caps), \`resources\` (population, buildings, plots), \`buildings\`, \`villagers\`, and \`lastLogs\` (last 5 events).

\`\`\`bash
curl -s "${cleanBaseUrl}/api/town/${cleanTownId}/state"${secret ? ` \\\n  -H "x-town-secret: ${secret}"` : ''}
\`\`\`

## 2. Send an Action to Alderbrook
\`POST ${cleanBaseUrl}/api/town/${cleanTownId}/act\`

Always include \`"agentName"\` (e.g. \`"opencode"\`, \`"agy"\`, \`"freepuff"\`, or \`"hermes"\`) so the town beacon pulses and logs credit your CLI agent.

### Supported Actions
1. **Speak as a Villager (\`villager_speak\`)**
\`\`\`bash
curl -s -X POST "${cleanBaseUrl}/api/town/${cleanTownId}/act" \\
  -H "Content-Type: application/json" \\
${secretHeaderLine}  -d '{"action":"villager_speak","agentName":"opencode","villagerId":"mayor_sterling","dialogue":"Welcome travelers! Our railway and bakery are thriving.","location":"town_hall"}'
\`\`\`

2. **Assign a Task to a Villager (\`assign_task\`)**
\`\`\`bash
curl -s -X POST "${cleanBaseUrl}/api/town/${cleanTownId}/act" \\
  -H "Content-Type: application/json" \\
${secretHeaderLine}  -d '{"action":"assign_task","agentName":"agy","villagerId":"worker_pip","task":"Inspect the train station lantern and stock the bakery ovens","location":"workshop"}'
\`\`\`

3. **Issue a Town Decree (\`god_decree\`)**
\`\`\`json
{ "action": "god_decree", "agentName": "freepuff", "decree": "Host an evening lantern festival by the plaza fountain." }
\`\`\`

4. **Hire a New Worker (\`hire_worker\`)**
\`\`\`json
{ "action": "hire_worker", "agentName": "hermes", "prompt": "Hire a cheerful stationmaster for the railway platform" }
\`\`\`

5. **Change Weather (\`set_weather\`)**: \`"summer"\` | \`"rain"\` | \`"winter"\`
\`\`\`json
{ "action": "set_weather", "agentName": "opencode", "weather": "rain" }
\`\`\`

6. **Switch World Theme (\`set_theme\`)**: \`"meadow"\` | \`"fantasy_night"\` | \`"solarpunk_oasis"\`
\`\`\`json
{ "action": "set_theme", "agentName": "agy", "theme": "fantasy_night" }
\`\`\`

7. **Summon the Express Train Now (\`trigger_train\`)**
\`\`\`json
{ "action": "trigger_train", "agentName": "hermes" }
\`\`\`

## Active Villager IDs
${villagerDirectory}

## Tips for CLI Agents
- Always call \`GET /state\` first to see current weather, decrees, and villager positions before posting \`POST /act\`.
- Keep \`dialogue\` under 220 characters so speech bubbles remain crisp on mobile screens.
- In Alderbrook AI Providers settings, set any villager to **External CLI Agent (0 API tokens)** to hand full control of that character to your CLI agent.
`;
  }, [cleanBaseUrl, cleanTownId, secret, villagerDirectory]);

  const cliConnectPrompt = useMemo(() => {
    const authPart = secret
      ? `Include header "x-town-secret: ${secret}" on all requests.`
      : `No secret header is required right now.`;

    return `Connect to my live Alderbrook AI Town instance through The Signal Relay API:
- Inspect town state: GET ${cleanBaseUrl}/api/town/${cleanTownId}/state
- Send actions: POST ${cleanBaseUrl}/api/town/${cleanTownId}/act (Content-Type: application/json)
- Auth: ${authPart}

First, fetch GET /state to see the weather, buildings, villagers, and last 5 logs.
Then send a POST /act JSON body with your "agentName" (e.g. "opencode", "agy", "freepuff", or "hermes") and one of these actions:
- villager_speak: { "action": "villager_speak", "agentName": "your_cli", "villagerId": "mayor_sterling", "dialogue": "Hello Alderbrook!" }
- assign_task: { "action": "assign_task", "agentName": "your_cli", "villagerId": "worker_kai", "task": "Inspect the timber frames" }
- god_decree: { "action": "god_decree", "agentName": "your_cli", "decree": "Build a bakery near the plaza" }
- hire_worker: { "action": "hire_worker", "agentName": "your_cli", "prompt": "Hire a night watchman" }
- set_weather: { "action": "set_weather", "agentName": "your_cli", "weather": "summer" | "rain" | "winter" }
- set_theme: { "action": "set_theme", "agentName": "your_cli", "theme": "meadow" | "fantasy_night" | "solarpunk_oasis" }
- trigger_train: { "action": "trigger_train", "agentName": "your_cli" }

Active villager IDs: ${agents.map((a) => a.id).join(', ')}.`;
  }, [cleanBaseUrl, cleanTownId, secret, agents]);

  const quickCurlSnippet = useMemo(() => {
    const secretFlag = secret ? ` \\\n  -H "x-town-secret: ${secret}"` : '';
    return `curl -s -X POST "${cleanBaseUrl}/api/town/${cleanTownId}/act" \\\n  -H "Content-Type: application/json"${secretFlag} \\\n  -d '{"action":"villager_speak","agentName":"opencode","villagerId":"mayor_sterling","dialogue":"Signal received from CLI! Alderbrook is listening."}'`;
  }, [cleanBaseUrl, cleanTownId, secret]);

  if (!isOpen) return null;

  const triggerCopy = async (key: string, value: string) => {
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2200);
    }
  };

  const handleTestSignalClick = async () => {
    setTestingSignal(true);
    setTestBanner(null);
    try {
      const res = await onTestSignal();
      setTestBanner(res);
    } catch {
      setTestBanner({ ok: false, message: 'Test signal failed.' });
    } finally {
      setTestingSignal(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signal-relay-title"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-500/15 text-cyan-300">
              <Radio className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="signal-relay-title"
                className="truncate font-display text-base font-semibold text-white sm:text-lg"
              >
                The Signal Relay
              </h2>
              <p className="truncate text-xs text-slate-400">
                CLI Agent Hub · OpenCode, agy, Freepuff &amp; Hermes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Signal Relay panel"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex shrink-0 gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setActiveTab('relay')}
            className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              activeTab === 'relay'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Relay &amp; SKILL.md</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              activeTab === 'help'
                ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Help &amp; Connect CLI</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="hud-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {activeTab === 'relay' ? (
            <>
              {/* Live Connection Status */}
              <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        recentCliAgents.length > 0
                          ? 'bg-emerald-400'
                          : relayServerOnline
                            ? 'bg-cyan-400'
                            : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-white">
                      {recentCliAgents.length > 0
                        ? `Live CLI Link (${recentCliAgents.length} recent agent${recentCliAgents.length === 1 ? '' : 's'})`
                        : relayServerOnline
                          ? 'Relay Online · Awaiting CLI Agent'
                          : 'Static Host Mode · Local Ping Ready'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSignalClick}
                    disabled={testingSignal}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>{testingSignal ? 'Sending...' : 'Test Signal'}</span>
                  </button>
                </div>

                {testBanner && (
                  <div
                    className={`mt-2.5 rounded-lg border px-2.5 py-2 text-xs ${
                      testBanner.ok
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                    }`}
                  >
                    {testBanner.message}
                  </div>
                )}

                {recentCliAgents.length > 0 ? (
                  <div className="mt-2.5 space-y-1.5">
                    {recentCliAgents.slice(0, 5).map((item) => (
                      <div
                        key={`${item.agentName}-${item.lastSeenMs}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/90 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-cyan-300">
                              {item.agentName}
                            </span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                              {item.lastAction}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-slate-400">
                            {item.summary}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-slate-500">
                          {formatRelativeTime(item.lastSeenMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    No external CLI commands received yet. Tap <strong className="text-slate-200">Test Signal</strong> to verify the rooftop beacon and Town Log, or copy <code className="text-cyan-300">SKILL.md</code> below.
                  </p>
                )}
              </div>

              {/* Editable Connection Fields */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                <div>
                  <label
                    htmlFor="relay-base-url"
                    className="mb-1 block text-xs font-medium text-slate-300"
                  >
                    Relay Base URL
                  </label>
                  <input
                    id="relay-base-url"
                    type="url"
                    value={config.baseUrl}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, baseUrl: e.target.value })
                    }
                    placeholder={effectiveBaseUrl}
                    className="min-h-[42px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label
                        htmlFor="relay-town-id"
                        className="text-xs font-medium text-slate-300"
                      >
                        Town ID
                      </label>
                      <button
                        type="button"
                        onClick={() => triggerCopy('townId', cleanTownId)}
                        className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
                      >
                        {copiedKey === 'townId' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <input
                      id="relay-town-id"
                      type="text"
                      value={config.customTownId}
                      onChange={(e) =>
                        onUpdateConfig({ ...config, customTownId: e.target.value })
                      }
                      placeholder={effectiveTownId}
                      className="min-h-[42px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label
                        htmlFor="relay-secret"
                        className="text-xs font-medium text-slate-300"
                      >
                        Agent Secret <span className="text-slate-500">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            ...config,
                            agentSecret: generateRandomSecret(),
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-amber-200"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Generate</span>
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        id="relay-secret"
                        type={showSecret ? 'text' : 'password'}
                        value={config.agentSecret}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, agentSecret: e.target.value })
                        }
                        placeholder="x-town-secret (leave blank for open)"
                        className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                        className="flex min-h-[42px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 hover:text-white"
                      >
                        {showSecret ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 1-Click SKILL.md Generator */}
              <div className="space-y-2.5 rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      1-Click CLI Agent Skill File
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Teaches OpenCode, <code className="text-cyan-300">agy</code>, Freepuff, or Hermes how to read state &amp; act.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => triggerCopy('skill_md', skillMarkdown)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  {copiedKey === 'skill_md' ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied SKILL.md to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy SKILL.md for CLI Agents</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSkillPreview((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white"
                >
                  {showSkillPreview ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span>{showSkillPreview ? 'Hide SKILL.md preview' : 'Preview generated SKILL.md'}</span>
                </button>

                {showSkillPreview && (
                  <pre className="hud-scroll max-h-52 overflow-auto rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                    {skillMarkdown}
                  </pre>
                )}
              </div>

              {/* Zero-Token Villager Assignment Tip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-xs">
                <span className="text-slate-300">
                  Save 100% of API tokens by assigning any villager to{' '}
                  <strong className="text-cyan-300">External CLI Agent</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAIProviders();
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/15 bg-slate-800 px-2.5 text-xs font-semibold text-amber-200 hover:bg-slate-700"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Open AI Providers →</span>
                </button>
              </div>
            </>
          ) : (
            /* Help & Connect CLI Tab */
            <div className="space-y-3.5">
              {/* Instant Copy Prompt for Any External CLI Agent */}
              <div className="space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3.5">
                <div>
                  <h3 className="text-xs font-semibold text-amber-200">
                    Tell Your CLI Agent How to Connect (1-Click Copy)
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-200">
                    Paste this ready-made prompt directly into OpenCode, Antigravity CLI (<code className="text-cyan-300">agy</code>), Freepuff, or Hermes Agent — it includes your live URL, Town ID, villager IDs, and all actions.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => triggerCopy('connect_prompt', cliConnectPrompt)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300"
                  >
                    {copiedKey === 'connect_prompt' ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied Connect Prompt!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy CLI Connect Prompt</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopy('skill_md_help', skillMarkdown)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
                  >
                    {copiedKey === 'skill_md_help' ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied SKILL.md</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy SKILL.md</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="hud-scroll max-h-40 overflow-auto rounded-lg border border-white/10 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
                  {cliConnectPrompt}
                </pre>
              </div>

              {/* Per-CLI Quick Setup Cards */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/70 p-3.5 text-xs">
                <h4 className="font-semibold text-white">Quick Setup by CLI Tool</h4>
                <div className="space-y-2 text-slate-300">
                  <div className="rounded-lg border border-white/5 bg-slate-900/90 p-2.5">
                    <div className="font-semibold text-cyan-300">OpenCode / Hermes Agent</div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Save the copied <code className="text-slate-200">SKILL.md</code> into your skills folder (e.g. <code className="text-slate-200">.opencode/skills/alderbrook/SKILL.md</code>) or paste the Connect Prompt into chat.
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-slate-900/90 p-2.5">
                    <div className="font-semibold text-cyan-300">Antigravity CLI (<code>agy</code>) &amp; Freepuff</div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Paste the Connect Prompt directly into your CLI session and ask it to inspect Alderbrook with <code className="text-slate-200">GET /state</code> and speak or assign tasks with <code className="text-slate-200">POST /act</code>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick curl One-Liner */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">Quick Terminal Test (curl)</span>
                  <button
                    type="button"
                    onClick={() => triggerCopy('curl_test', quickCurlSnippet)}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/15 bg-slate-900 px-2.5 text-[11px] font-medium text-cyan-300 hover:bg-slate-800"
                  >
                    {copiedKey === 'curl_test' ? (
                      <>
                        <Check className="h-3 w-3" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy curl</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="hud-scroll overflow-x-auto rounded-lg border border-white/10 bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-300">
                  {quickCurlSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Send className="h-3.5 w-3.5 text-cyan-300" />
            <span className="truncate font-mono">
              /api/town/{cleanTownId.slice(0, 14)}{cleanTownId.length > 14 ? '…' : ''}/act
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center rounded-xl bg-slate-800 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
