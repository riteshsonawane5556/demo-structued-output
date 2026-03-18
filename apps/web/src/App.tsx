import { useState } from "react"
import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Alert, AlertTitle, AlertDescription } from "@workspace/ui/components/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Loader2, AlertTriangle, CheckCircle2, Sparkles, Zap, Shield } from "lucide-react"

const client = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
  dangerouslyAllowBrowser: true,
})

type Status = "idle" | "loading" | "success" | "error"

interface CardState {
  status: Status
  prompt: string
  output: string
  parsedJson: Record<string, unknown> | null
  parseError: boolean
  parsedKeys: string[]
}

const DEFAULT_INPUT =
  "Sarah Chen, 31 years old, data scientist working at a fintech startup in Bangalore"

const PersonSchema = z.object({
  full_name: z.string(),
  age: z.number(),
  occupation: z.string(),
  location: z.string(),
})

const personSchemaDisplay = `class Person(BaseModel):
    full_name: str
    age: int
    occupation: str
    location: str`

const scenarios = [
  {
    id: 1,
    title: "Scenario 1",
    subtitle: "Inconsistent Keys",
    description:
      "Ask for JSON in plain text — often produces invalid or malformed JSON with no guarantee on structure.",
    badgeLabel: "Inconsistent",
    badgeClass: "bg-red-50 text-red-600 border border-red-200",
    icon: AlertTriangle,
    iconClass: "text-red-400",
    accentColor: "from-red-50 to-orange-50",
    borderColor: "border-red-100",
    tabActive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    tabInactive: "text-slate-600 hover:bg-slate-100",
  },
  {
    id: 2,
    title: "Scenario 2",
    subtitle: "Faulty JSON",
    description:
      "Prompt asks for specific keys but the model may rename, reorder, or nest them unpredictably across runs.",
    badgeLabel: "Unreliable",
    badgeClass: "bg-amber-50 text-amber-600 border border-amber-200",
    icon: Zap,
    iconClass: "text-amber-400",
    accentColor: "from-amber-50 to-yellow-50",
    borderColor: "border-amber-100",
    tabActive: "bg-amber-500 text-white shadow-sm hover:bg-amber-600",
    tabInactive: "text-slate-600 hover:bg-slate-100",
  },
  {
    id: 3,
    title: "Scenario 3",
    subtitle: "Schema Enforced",
    description:
      "Uses response_format with a JSON schema — guarantees valid, consistent structure every single time.",
    badgeLabel: "Reliable",
    badgeClass: "bg-emerald-50 text-emerald-600 border border-emerald-200",
    icon: Shield,
    iconClass: "text-emerald-500",
    accentColor: "from-emerald-50 to-teal-50",
    borderColor: "border-emerald-100",
    tabActive: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
    tabInactive: "text-slate-600 hover:bg-slate-100",
  },
] as const

function StatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { label: string; className: string; dot: string }> = {
    idle: {
      label: "Idle",
      className: "bg-slate-100 text-slate-500 border-slate-200",
      dot: "bg-slate-400",
    },
    loading: {
      label: "Running…",
      className: "bg-blue-50 text-blue-600 border-blue-200",
      dot: "bg-blue-500 animate-pulse",
    },
    success: {
      label: "Success",
      className: "bg-emerald-50 text-emerald-600 border-emerald-200",
      dot: "bg-emerald-500",
    },
    error: {
      label: "Error",
      className: "bg-red-50 text-red-600 border-red-200",
      dot: "bg-red-500",
    },
  }
  const { label, className, dot } = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-300 ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const defaultCardState: CardState = {
  status: "idle",
  prompt: "",
  output: "",
  parsedJson: null,
  parseError: false,
  parsedKeys: [],
}

export function App() {
  const [userInput, setUserInput] = useState(DEFAULT_INPUT)
  const [activeTab, setActiveTab] = useState(0)
  const [cards, setCards] = useState<[CardState, CardState, CardState]>([
    { ...defaultCardState },
    { ...defaultCardState },
    { ...defaultCardState },
  ])

  const updateCard = (index: number, update: Partial<CardState>) => {
    setCards((prev) => {
      const next = [...prev] as [CardState, CardState, CardState]
      next[index] = { ...next[index], ...update }
      return next
    })
  }

  // ── Scenario 1 ────────────────────────────────────────────────
  const runScenario1 = async () => {
    const prompt = `You are a data extractor. Extract person details from the input and return ONLY raw JSON.
No explanation. No markdown. No code block. Just raw JSON.

Input: ${userInput}`

    updateCard(0, { status: "loading", prompt, output: "", parsedJson: null, parseError: false, parsedKeys: [] })

    try {
      const response = await client.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 1,
      })
      const raw = response.choices[0]?.message?.content ?? ""
      let parsedJson: Record<string, unknown> | null = null
      let parseError = false
      try { parsedJson = JSON.parse(raw) } catch { parseError = true }
      updateCard(0, { status: parseError ? "error" : "success", output: raw, parsedJson, parseError })
    } catch (err) {
      updateCard(0, { status: "error", output: err instanceof Error ? err.message : "Unknown error", parseError: true })
    }
  }

  // ── Scenario 2 ────────────────────────────────────────────────
  const runScenario2 = async () => {
    const prompt = `Extract structured information from the input below and return a JSON object.
Return only JSON. No extra text.

Input: ${userInput}`

    updateCard(1, { status: "loading", prompt, output: "", parsedJson: null, parseError: false, parsedKeys: [] })

    try {
      const response = await client.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 1,
      })
      const raw = response.choices[0]?.message?.content ?? ""
      let parsedJson: Record<string, unknown> | null = null
      let parseError = false
      let parsedKeys: string[] = []
      try {
        parsedJson = JSON.parse(raw)
        parsedKeys = Object.keys(parsedJson as object)
      } catch { parseError = true }
      updateCard(1, { status: parseError ? "error" : "success", output: raw, parsedJson, parseError, parsedKeys })
    } catch (err) {
      updateCard(1, { status: "error", output: err instanceof Error ? err.message : "Unknown error", parseError: true })
    }
  }

  // ── Scenario 3 ────────────────────────────────────────────────
  const runScenario3 = async () => {
    const prompt = `Extract person details from the following input.

Input: ${userInput}`

    updateCard(2, { status: "loading", prompt, output: "", parsedJson: null, parseError: false, parsedKeys: [] })

    try {
      const response = await client.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        response_format: zodResponseFormat(PersonSchema, "person_info"),
        temperature: 0,
      })
      const raw = response.choices[0]?.message?.content ?? ""
      let parsedJson: Record<string, unknown> | null = null
      let parseError = false
      try { parsedJson = JSON.parse(raw) } catch { parseError = true }
      updateCard(2, { status: parseError ? "error" : "success", output: raw, parsedJson, parseError })
    } catch (err) {
      updateCard(2, { status: "error", output: err instanceof Error ? err.message : "Unknown error", parseError: true })
    }
  }

  const runHandlers = [runScenario1, runScenario2, runScenario3]

  // ── Extra panels ───────────────────────────────────────────────
  const renderScenario1Extra = () => {
    const card = cards[0]
    if (card.status === "idle" || card.status === "loading") return null
    if (card.parseError) {
      return (
        <Alert className="border border-red-200 bg-red-50 text-red-700 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-sm font-semibold">Invalid JSON</AlertTitle>
          <AlertDescription className="text-xs opacity-80">
            ⚠ Parse failed — the model returned non-JSON output. This is the core risk of unstructured generation.
          </AlertDescription>
        </Alert>
      )
    }
    return (
      <Alert className="border border-amber-200 bg-amber-50 text-amber-700 rounded-xl">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-sm font-semibold">Caution</AlertTitle>
        <AlertDescription className="text-xs opacity-80">
          ⚠ Got valid JSON this time — but the format is unpredictable across runs.
        </AlertDescription>
      </Alert>
    )
  }

  const renderScenario2Extra = () => {
    const card = cards[1]
    if (card.status === "idle" || card.status === "loading" || card.parseError) return null
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Keys returned this run
        </p>
        <div className="flex flex-wrap gap-1.5">
          {card.parsedKeys.map((key) => (
            <span
              key={key}
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-xs text-amber-700"
            >
              {key}
            </span>
          ))}
        </div>
        <p className="text-xs italic text-slate-400">
          Click Run again — the keys will likely differ
        </p>
      </div>
    )
  }

  const renderScenario3Extra = () => {
    const card = cards[2]
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Pydantic Model Schema
          </p>
          <pre className="overflow-x-auto rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-mono text-xs leading-relaxed text-emerald-800">
            {personSchemaDisplay}
          </pre>
        </div>

        {card.status !== "idle" && card.status !== "loading" && card.parsedJson && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Parsed &amp; Validated Output
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-1/3 text-xs font-semibold text-slate-500">Field</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(card.parsedJson).map(([key, val]) => (
                      <TableRow key={key} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-mono text-xs font-semibold text-slate-600">{key}</TableCell>
                        <TableCell className="text-xs text-slate-700">{String(val)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <Alert className="border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <AlertTitle className="text-sm font-semibold">Consistent Every Time</AlertTitle>
              <AlertDescription className="text-xs opacity-80">
                ✓ Keys are always <code className="font-mono">full_name, age, occupation, location</code> — guaranteed by the schema.
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>
    )
  }

  const extraRenderers = [renderScenario1Extra, renderScenario2Extra, renderScenario3Extra]

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f8faff 0%, #f1f5f9 50%, #fafaf8 100%)" }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                Structured Output
              </h1>
            </div>
            <p className="text-xs text-slate-400 pl-9">
              See how schema enforcement makes LLM outputs reliable
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
              Groq
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-600">
              OpenAI SDK
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">

        {/* ── Shared Input ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="user-input"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            User Input
          </label>
          <Textarea
            id="user-input"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border-slate-200 bg-slate-50 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
            placeholder="Enter text to extract structured data from…"
          />
          <p className="mt-2 text-xs text-slate-400">
            This input is sent to all three scenarios when you click Run
          </p>
        </section>

        {/* ── Scenario Tabs ────────────────────────────────────── */}
        <div className="flex gap-2">
          {scenarios.map((scenario, index) => (
            <button
              key={scenario.id}
              onClick={() => setActiveTab(index)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === index ? scenario.tabActive : `bg-white border border-slate-200 ${scenario.tabInactive}`
              }`}
            >
              <span className="hidden sm:inline">{scenario.title} — </span>
              {scenario.subtitle}
            </button>
          ))}
        </div>

        {/* ── Scenario Card ────────────────────────────────────── */}
        {(() => {
          const index = activeTab
          const scenario = scenarios[index]
          const ScenarioIcon = scenario.icon
          return (
            <Card
              key={scenario.id}
              className={`border ${scenario.borderColor} bg-white shadow-sm rounded-2xl overflow-hidden transition-all duration-300`}
            >
              {/* Coloured top stripe */}
              <div className={`h-1 w-full bg-gradient-to-r ${scenario.accentColor}`} />

              <CardHeader className="px-6 pt-5 pb-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${scenario.accentColor} border ${scenario.borderColor}`}>
                      <ScenarioIcon className={`h-4 w-4 ${scenario.iconClass}`} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-900 leading-tight">
                        {scenario.title} — {scenario.subtitle}
                      </CardTitle>
                      <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${scenario.badgeClass}`}>
                        {scenario.badgeLabel}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={cards[index].status} />
                </div>
                <CardDescription className="text-xs text-slate-500 leading-relaxed pl-12">
                  {scenario.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-5 px-6 pb-6">
                {/* Schema panel (Scenario 3 only) */}
                {index === 2 && renderScenario3Extra()}

                {/* Run Button */}
                <Button
                  id={`run-scenario-${index + 1}`}
                  onClick={() => runHandlers[index]()}
                  disabled={cards[index].status === "loading"}
                  className={`w-full rounded-xl font-medium transition-all duration-200 border ${
                    cards[index].status === "loading"
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : `border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm`
                  }`}
                  variant="outline"
                >
                  {cards[index].status === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running…
                    </>
                  ) : cards[index].status !== "idle" ? (
                    "Run Again"
                  ) : (
                    "Run"
                  )}
                </Button>

                {/* Prompt Sent */}
                {cards[index].prompt && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Prompt Sent
                    </p>
                    <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                      {cards[index].prompt}
                    </pre>
                  </div>
                )}

                {/* Model Output */}
                {cards[index].output && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Model Output
                    </p>
                    <pre
                      className={`overflow-x-auto rounded-xl border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap transition-colors duration-300 ${
                        cards[index].status === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {cards[index].output}
                    </pre>
                  </div>
                )}

                {/* Scenario-specific extras */}
                {index !== 2 && extraRenderers[index]()}
              </CardContent>
            </Card>
          )
        })()}
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/80 bg-white/60 backdrop-blur-sm mt-8">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Structured Output Demo · Powered by <span className="font-medium text-slate-500">Groq</span> + <span className="font-medium text-slate-500">Llama 4 Scout</span>
          </p>
          <p className="text-xs text-slate-400 hidden sm:block">
            Press <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs">D</kbd> to toggle dark mode
          </p>
        </div>
      </footer>
    </div>
  )
}
