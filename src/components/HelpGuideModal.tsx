import { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Compass,
  Copy,
  HelpCircle,
  Radio,
  Terminal,
  X,
} from 'lucide-react';
import firebaseAppletConfig from '../../firebase-applet-config.json';

interface HelpGuideModalProps {
  isOpen: boolean;
  uid: string | null;
  appOrigin: string;
  onClose: () => void;
  onOpenRemoteBridge: () => void;
  onOpenSettings: () => void;
}

type HelpTab = 'player' | 'connect' | 'skill';

function CopyBlock({
  label,
  code,
  copiedId,
  id,
  onCopy,
}: {
  label: string;
  code: string;
  copiedId: string | null;
  id: string;
  onCopy: (id: string, text: string) => void;
}) {
  const isCopied = copiedId === id;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <button
          type="button"
          onClick={() => onCopy(id, code)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2.5 text-xs font-medium text-amber-200 transition-colors hover:border-amber-400/40 hover:bg-slate-800"
        >
          {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="hud-scroll max-h-60 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
        {code}
      </pre>
    </div>
  );
}

export function HelpGuideModal({
  isOpen,
  uid,
  appOrigin,
  onClose,
  onOpenRemoteBridge,
  onOpenSettings,
}: HelpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<HelpTab>('player');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const townId = uid || '<YOUR_FIREBASE_AUTH_UID>';
  const projectId = firebaseAppletConfig.projectId;
  const databaseId = firebaseAppletConfig.firestoreDatabaseId;
  const cleanOrigin = appOrigin.replace(/\/+$/, '');

  const pythonSnippet = useMemo(
    () => `import firebase_admin
from firebase_admin import credentials, firestore

# Initialize once with your Firebase service account JSON
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {"projectId": "${projectId}"})

# Connect specifically to Alderbrook's named Firestore database
db = firestore.client(database_id="${databaseId}")

def send_town_command(cmd_type: str, value: str, source: str = "telegram"):
    """
    cmd_type: "set_weather" | "hire_worker" | "god_decree" | "build_plot" | "build_structure"
    """
    ref = db.collection("towns").document("${townId}").collection("remoteCommands").document()
    ref.set({
        "ownerId": "${townId}",
        "type": cmd_type,
        "value": value,
        "source": source,
        "status": "pending",
        "createdAt": firestore.SERVER_TIMESTAMP,
    })
    return ref.id

# Examples:
# send_town_command("set_weather", "rain")
# send_town_command("hire_worker", "Hire a night watchman for the tower")
# send_town_command("god_decree", "Construct a bakery before winter")
# send_town_command("build_plot", "greenhouse on plot_nw")`,
    [projectId, databaseId, townId],
  );

  const nodeSnippet = useMemo(
    () => `import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  projectId: '${projectId}',
});

const db = getFirestore(app, '${databaseId}');

export async function sendRemoteCommand(type, value, source = 'hermes-cli') {
  const ref = db
    .collection('towns')
    .doc('${townId}')
    .collection('remoteCommands')
    .doc();

  await ref.set({
    ownerId: '${townId}',
    type, // 'set_weather' | 'hire_worker' | 'god_decree' | 'build_plot' | 'build_structure'
    value,
    source,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// Example CLI usage (agy / Hermes):
// await sendRemoteCommand('set_weather', 'winter');`,
    [projectId, databaseId, townId],
  );

  const curlSnippet = useMemo(
    () => `# 1. Check live server & default Gemini key status
curl -s ${cleanOrigin}/api/health

# 2. Generate a new AI specialist worker profile via Alderbrook backend
curl -s -X POST ${cleanOrigin}/api/town/hire \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Hire a skilled baker for the Artisan Bakery",
    "agents": [{"id":"mayor_sterling","name":"Mayor Sterling","rank":1,"role":"Town Mayor"}],
    "structures": [{"plotId":"plot_nw","structureType":"bakery","status":"complete","progress":100,"tier":1}],
    "weather": "summer"
  }'

# 3. Trigger an outgoing Webhook / Telegram alert via Remote Bridge
curl -s -X POST ${cleanOrigin}/api/bridge/notify \\
  -H "Content-Type: application/json" \\
  -d '{
    "webhookUrl": "https://your-webhook.example.com/hook",
    "eventType": "remote_cli",
    "title": "CLI Ping",
    "message": "Hermes CLI connected to Alderbrook!"
  }'`,
    [cleanOrigin],
  );

  const skillPromptMarkdown = useMemo(
    () => `---
name: alderbrook-ai-town-operator
description: Remote control & automation skill for Alderbrook, a 3D AI Town simulation powered by React, Three.js, Express, Gemini, and Cloud Firestore.
---

# Alderbrook AI Town — External Agent Skill Context

You are operating **Alderbrook**, a living low-poly 3D AI town simulation (${cleanOrigin}).

## 1. Architecture & Limits
- **Frontend**: React + Three.js 3D viewport (\`100dvh\`) running client-side animation, pathfinding, and real-time Firestore \`onSnapshot\` command listening.
- **Population Cap**: 5 core hierarchy agents + up to 10 dynamically hired specialists (**max 15 active 3D villagers**).
- **Hierarchy**:
  - **Rank 1**: \`mayor_sterling\` (Mayor Sterling) — sets town strategy, issues tasks to Managers, and autonomously proposes/hires Rank 3 workers when Town Pulse avg >= 74.
  - **Rank 2**: \`commander_vance\` (Commander Vance — Security & Supply), \`architect_lyra\` (Architect Lyra — Builder & Economy).
  - **Rank 3**: \`worker_kai\`, \`worker_pip\`, and dynamically hired specialists (\`hire_*\`).
- **Town Pulse Metrics (0-100)**: \`prosperity\`, \`orderLevel\`, \`morale\`.

## 2. Weather, Seasons & 8 Buildable Plots
- **Seasons (\`weather\`)**: \`"summer"\` | \`"rain"\` | \`"winter"\`
  - \`summer\`: Boosts Grain Windmill prosperity (+25%) and speeds up socializing around Garden Pavilion & Park fountain.
  - \`rain\`: Boosts Glass Greenhouse & Timber Granary (+25% growth), triggers Bakery chimney steam, and prompts shelter-seeking.
  - \`winter\`: Slows outdoor building by 20% unless a \`watchtower\` or Tier 2+ structure exists; increases Bakery warmth demand.
- **8 Perimeter Plot IDs**: \`plot_nw\`, \`plot_ne\`, \`plot_sw\`, \`plot_se\`, \`plot_n_west\`, \`plot_n_east\`, \`plot_s_west\`, \`plot_s_east\`
- **8 Structure Types**: \`bakery\`, \`watchtower\`, \`greenhouse\`, \`windmill\`, \`library\`, \`granary\`, \`pavilion\`, \`clock_tower\` (Tiers \`1..3\`).

## 3. Cloud Firestore Remote Command Queue (Primary Bot Interface)
When the user is signed into Alderbrook (Cloud Save), the live web app listens via \`onSnapshot\` on:
- **GCP / Firebase Project ID**: \`${projectId}\`
- **Firestore Database ID**: \`${databaseId}\`
- **Collection Path**: \`/towns/${townId}/remoteCommands/{commandId}\`

To control Alderbrook remotely (from Telegram, Hermes, or \`agy\` CLI), write a document with \`status: "pending"\`:
\`\`\`json
{
  "ownerId": "${townId}",
  "type": "set_weather | hire_worker | god_decree | build_structure | build_plot",
  "value": "string argument",
  "source": "telegram | hermes | agy",
  "status": "pending"
}
\`\`\`

### Supported Remote Command Actions
1. **\`set_weather\`** — \`value\`: \`"summer"\`, \`"rain"\`, or \`"winter"\` (also accepts \`"storm"\` -> \`"rain"\`, \`"snow"\` -> \`"winter"\`).
2. **\`hire_worker\`** — \`value\`: natural language request (e.g., \`"Hire a skilled botanist for the greenhouse"\`). Generates a Rank 3 worker via Gemini and spawns them live in Alderbrook Square.
3. **\`god_decree\`** — \`value\`: civic decree up to 260 chars (e.g., \`"Prioritize building a watchtower before winter"\`). Directs Mayor Sterling immediately.
4. **\`build_structure\`** or **\`build_plot\`** — \`value\`: structure name, plot ID, or both (e.g., \`"bakery"\`, \`"watchtower on plot_ne"\`, or JSON \`payload: {"plotId": "plot_nw", "structureType": "greenhouse"}\`). Stakes a new site (25%), advances active construction (+50%), or upgrades a completed building up to Tier 3.

After executing, Alderbrook logs \`[Remote Command] · Telegram / Agent\` in \`/towns/${townId}/logs/{logId}\` and marks the command \`status: "executed"\` (or \`"failed"\`) with \`executedAt\` and \`resultMessage\`.

## 4. Express Backend API Endpoints (${cleanOrigin})
- \`GET /api/health\` — Health check & server fallback key availability.
- \`POST /api/ai/test\` — Tests OpenAI-compatible AI provider headers (\`x-ai-base-url\`, \`x-ai-model-name\`, \`x-ai-api-key\`).
- \`POST /api/town/turn\` — Computes the next autonomous council turn JSON (\`thought\`, \`target_location\`, \`target_agent\`, \`dialogue\`, \`build_order\`, optional \`hire_worker\`).
- \`POST /api/town/hire\` — Recruits 1-3 Rank 3 specialist workers from \`{ prompt, agents, structures, weather }\`.
- \`POST /api/bridge/notify\` — Sends outgoing HTTPS Webhook or Telegram Bot API (\`sendMessage\`) alerts for major events (building complete, Tier 3 upgrade, weather shifts).`,
    [cleanOrigin, projectId, databaseId, townId],
  );

  if (!isOpen) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-title"
    >
      <div className="flex h-[100dvh] w-full flex-col bg-slate-900 text-slate-100 md:h-auto md:max-h-[90dvh] md:max-w-3xl md:rounded-2xl md:border md:border-white/10 md:shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="help-guide-title" className="font-display text-lg font-semibold text-white">
                Help &amp; AI Integration Guide
              </h2>
              <p className="text-xs text-slate-400">
                Player manual, Telegram/Hermes/CLI remote bridge, and 1-click AI skill prompt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Help Guide"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 3 Clean Tabs */}
        <div
          role="tablist"
          aria-label="Help guide sections"
          className="grid shrink-0 grid-cols-3 gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-2.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'player'}
            onClick={() => setActiveTab('player')}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === 'player'
                ? 'bg-amber-500 text-slate-950'
                : 'border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Compass className="h-4 w-4 shrink-0" />
            <span className="truncate">Player Guide</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connect'}
            onClick={() => setActiveTab('connect')}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === 'connect'
                ? 'bg-emerald-500 text-slate-950'
                : 'border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Terminal className="h-4 w-4 shrink-0" />
            <span className="truncate">Bots &amp; CLI (agy)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'skill'}
            onClick={() => setActiveTab('skill')}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === 'skill'
                ? 'bg-sky-400 text-slate-950'
                : 'border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Bot className="h-4 w-4 shrink-0" />
            <span className="truncate">AI Skill File</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="hud-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {activeTab === 'player' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
                <h3 className="font-display text-sm font-semibold text-amber-200">
                  Welcome to Alderbrook — Living 3D AI Town
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  Press <strong>Play</strong> or <strong>Next Turn</strong> in the top bar to watch autonomous AI citizens coordinate, debate, walk across Alderbrook Square, and construct new buildings across 8 perimeter plots. Orbit with one finger/mouse, pinch to zoom, or tap <strong>Follow</strong> &amp; <strong>Radar</strong> to track citizens.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h4 className="font-display text-xs font-semibold tracking-wide text-white uppercase">
                    Mayor Sterling &amp; Hierarchy
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      <strong className="text-amber-300">Rank 1 · Mayor Sterling:</strong> Sets civic strategy, reviews Manager reports, and autonomously hires specialists when Town Pulse is high.
                    </li>
                    <li>
                      <strong className="text-sky-300">Rank 2 · Vance &amp; Lyra:</strong> Propose buildings, manage security/economy, and direct Rank 3 workers.
                    </li>
                    <li>
                      <strong className="text-emerald-300">Rank 3 · Kai, Pip &amp; Hires:</strong> Build sites, haul materials, tend workplaces, and report upward.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h4 className="font-display text-xs font-semibold tracking-wide text-white uppercase">
                    Weather &amp; Season Mechanics
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      <strong className="text-amber-300">Summer:</strong> Boosts Grain Windmill output (+25%) and speeds up plaza socializing around the Pavilion.
                    </li>
                    <li>
                      <strong className="text-sky-300">Rain:</strong> Boosts Glass Greenhouse &amp; Granary (+25% growth); villagers take brief shelter indoors while the Bakery chimney steams.
                    </li>
                    <li>
                      <strong className="text-indigo-300">Winter:</strong> Slows outdoor construction 20% until a Guard Watchtower or Tier 2+ structure shields the town.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h4 className="font-display text-xs font-semibold tracking-wide text-white uppercase">
                    AI Worker Hiring (Up to 15 Villagers)
                  </h4>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Open the <strong>Hierarchy</strong> panel and enter any plain-English hiring prompt (e.g., <em>&ldquo;Hire a skilled farmer for the greenhouse&rdquo;</em> or <em>&ldquo;Recruit 2 stone masons&rdquo;</em>). Gemini generates their role, personality, workplace plot, hat style, and 3D outfit palette and spawns them immediately at Alderbrook Square.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h4 className="font-display text-xs font-semibold tracking-wide text-white uppercase">
                    Town Pulse &amp; Graphics Quality
                  </h4>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    <strong>Town Pulse</strong> tracks <em>Prosperity</em>, <em>Order</em>, and <em>Morale</em> (0–100) from building completions, upgrades (Tiers 1–3), and seasonal bonuses. Use the bottom <strong>Low / Med / High</strong> quality toggle (auto-set to <strong>Med</strong> on 4 GB RAM phones) to balance shadows vs. mobile FPS.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-3.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  <span>Configure AI Providers</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRemoteBridge();
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                >
                  <Radio className="h-4 w-4" />
                  <span>Open Remote Bridge</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'connect' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs leading-relaxed text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-display text-sm text-emerald-200">
                    Step-by-Step Remote Control Setup
                  </strong>
                  <span className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                    {uid ? `townId: ${uid}` : 'Sign in (Cloud Save) for live townId'}
                  </span>
                </div>
                <ol className="mt-2.5 list-decimal space-y-1.5 pl-4">
                  <li>
                    Click <strong>Cloud Save</strong> in the top bar to authenticate so Alderbrook starts its real-time Firestore <code className="text-emerald-200">onSnapshot</code> listener.
                  </li>
                  <li>
                    Open <strong>Bridge</strong> to copy your path (<code className="text-emerald-200">/towns/{townId}/remoteCommands/&#123;commandId&#125;</code>) and optionally set an outgoing <strong>Webhook URL</strong> or <strong>Telegram Bot Token &amp; Chat ID</strong> for alerts when buildings finish, reach Tier 3, or storms arrive.
                  </li>
                  <li>
                    From Telegram, Hermes, or your CLI script (<code className="text-emerald-200">agy</code>), add a document with <code className="text-emerald-200">status: &quot;pending&quot;</code>. Alderbrook executes it live, logs <code className="text-emerald-200">[Remote Command] · Telegram / Agent</code>, and sets <code className="text-emerald-200">status: &quot;executed&quot;</code>.
                  </li>
                </ol>
              </div>

              {/* Actions Cheat Sheet */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <h4 className="font-display text-xs font-semibold tracking-wide text-white uppercase">
                  Supported Remote Command Actions
                </h4>
                <div className="mt-2.5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5">
                    <code className="font-semibold text-amber-300">set_weather</code>
                    <p className="mt-0.5 text-slate-400">
                      Value: <code>&quot;summer&quot;</code>, <code>&quot;rain&quot;</code>, or <code>&quot;winter&quot;</code>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5">
                    <code className="font-semibold text-emerald-300">hire_worker</code>
                    <p className="mt-0.5 text-slate-400">
                      Value: e.g. <code>&quot;Hire a farmer for the greenhouse&quot;</code>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5">
                    <code className="font-semibold text-sky-300">god_decree</code>
                    <p className="mt-0.5 text-slate-400">
                      Value: civic directive for Mayor Sterling (max 260 chars)
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5">
                    <code className="font-semibold text-purple-300">build_plot / build_structure</code>
                    <p className="mt-0.5 text-slate-400">
                      Value: e.g. <code>&quot;bakery&quot;</code> or <code>&quot;watchtower on plot_ne&quot;</code>
                    </p>
                  </div>
                </div>
              </div>

              <CopyBlock
                id="python-snippet"
                label="Python Starter (firebase-admin for Telegram / Hermes Bots)"
                code={pythonSnippet}
                copiedId={copiedId}
                onCopy={(id, text) => void handleCopy(id, text)}
              />

              <CopyBlock
                id="node-snippet"
                label="Node.js / CLI (agy) Starter (firebase-admin)"
                code={nodeSnippet}
                copiedId={copiedId}
                onCopy={(id, text) => void handleCopy(id, text)}
              />

              <CopyBlock
                id="curl-snippet"
                label="curl HTTP Endpoints (Health, Worker Hiring & Bridge Alerts)"
                code={curlSnippet}
                copiedId={copiedId}
                onCopy={(id, text) => void handleCopy(id, text)}
              />
            </div>
          )}

          {activeTab === 'skill' && (
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-display text-sm font-semibold text-sky-100">
                    Machine-Readable AI Skill Prompt (SKILL.md)
                  </h3>
                  <p className="mt-0.5 text-xs text-sky-200/80">
                    Paste this complete context into Claude, ChatGPT, Gemini, Hermes, or Antigravity (<code>agy</code>) so it understands every Alderbrook path, schema, and action.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('skill-prompt', skillPromptMarkdown)}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300"
                >
                  {copiedId === 'skill-prompt' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>
                    {copiedId === 'skill-prompt' ? 'Copied Skill Prompt!' : 'Copy AI Skill Prompt'}
                  </span>
                </button>
              </div>

              <pre className="hud-scroll max-h-[46dvh] overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
                {skillPromptMarkdown}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <span className="text-xs text-slate-400">
            Firestore DB: <code className="text-slate-300">{databaseId}</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
