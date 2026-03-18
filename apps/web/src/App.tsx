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
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"

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

// Display-friendly version for the UI panel
const personSchemaDisplay = `class Person(BaseModel):
    full_name: str
    age: int
    occupation: str
    location: str`

const scenarios = [
  {
    id: 1,
    title: "Scenario 1 — Inconsistent Keys",
    description:
      "Ask the model for JSON output in plain text — often produces invalid or malformed JSON.",
    badgeLabel: "Inconsistent",
    badgeColor: "bg-red-100 text-red-700 border-red-200",
  },
  {
    id: 2,
    title: "Scenario 2 — Faulty JSON",
    description:
      "Prompt asks for specific keys but the model may rename, reorder, or nest them unpredictably.",
    badgeLabel: "Unreliable",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
  },
  {
    id: 3,
    title: "Scenario 3 — Schema Enforced",
    description:
      "Uses response_format with a JSON schema — guarantees valid, consistent structure every time.",
    badgeLabel: "Reliable",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
] as const

function StatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { label: string; className: string }> = {
    idle: {
      label: "Idle",
      className: "bg-neutral-100 text-neutral-500 border-neutral-200",
    },
    loading: {
      label: "Loading…",
      className: "bg-sky-100 text-sky-700 border-sky-200",
    },
    success: {
      label: "Success",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    error: {
      label: "Error",
      className: "bg-red-100 text-red-700 border-red-200",
    },
  }
  const { label, className } = config[status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
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

  // ── Scenario 1 — Faulty JSON (no constraints) ──────────────────
  const runScenario1 = async () => {
    const prompt = `You are a data extractor. Extract person details from the input and return ONLY raw JSON.
No explanation. No markdown. No code block. Just raw JSON.

Input: ${userInput}`

    updateCard(0, {
      status: "loading",
      prompt,
      output: "",
      parsedJson: null,
      parseError: false,
      parsedKeys: [],
    })

    try {
      const response = await client.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 1,
      })
      const raw = response.choices[0]?.message?.content ?? ""

      let parsedJson: Record<string, unknown> | null = null
      let parseError = false

      try {
        parsedJson = JSON.parse(raw)
      } catch {
        parseError = true
      }

      updateCard(0, {
        status: parseError ? "error" : "success",
        output: raw,
        parsedJson,
        parseError,
      })
    } catch (err) {
      updateCard(0, {
        status: "error",
        output: err instanceof Error ? err.message : "Unknown error occurred",
        parseError: true,
      })
    }
  }

  // ── Scenario 2 — Inconsistent Keys ─────────────────────────────
  const runScenario2 = async () => {
    const prompt = `Extract structured information from the input below and return a JSON object.
Return only JSON. No extra text.

Input: ${userInput}`

    updateCard(1, {
      status: "loading",
      prompt,
      output: "",
      parsedJson: null,
      parseError: false,
      parsedKeys: [],
    })

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
      } catch {
        parseError = true
      }

      updateCard(1, {
        status: parseError ? "error" : "success",
        output: raw,
        parsedJson,
        parseError,
        parsedKeys,
      })
    } catch (err) {
      updateCard(1, {
        status: "error",
        output: err instanceof Error ? err.message : "Unknown error occurred",
        parseError: true,
      })
    }
  }

  // ── Scenario 3 — Schema Enforced ───────────────────────────────
  const runScenario3 = async () => {
    const prompt = `Extract person details from the following input.

Input: ${userInput}`

    updateCard(2, {
      status: "loading",
      prompt,
      output: "",
      parsedJson: null,
      parseError: false,
      parsedKeys: [],
    })

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

      try {
        parsedJson = JSON.parse(raw)
      } catch {
        parseError = true
      }

      updateCard(2, {
        status: parseError ? "error" : "success",
        output: raw,
        parsedJson,
        parseError,
      })
    } catch (err) {
      updateCard(2, {
        status: "error",
        output: err instanceof Error ? err.message : "Unknown error occurred",
        parseError: true,
      })
    }
  }

  const runHandlers = [runScenario1, runScenario2, runScenario3]

  // ── Render helpers ─────────────────────────────────────────────
  const renderScenario1Extra = () => {
    const card = cards[0]
    if (card.status === "idle" || card.status === "loading") return null

    if (card.parseError) {
      return (
        <Alert variant="destructive" className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Invalid JSON</AlertTitle>
          <AlertDescription className="text-xs">
            ⚠ Invalid JSON — parse failed. This is the risk of unstructured output.
          </AlertDescription>
        </Alert>
      )
    }

    return (
      <Alert className="border-amber-300 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-sm font-semibold text-amber-800">Caution</AlertTitle>
        <AlertDescription className="text-xs text-amber-700">
          ⚠ Got valid JSON this time — but format is unpredictable across runs.
        </AlertDescription>
      </Alert>
    )
  }

  const renderScenario2Extra = () => {
    const card = cards[1]
    if (card.status === "idle" || card.status === "loading") return null

    if (card.parseError) return null

    return (
      <div className="space-y-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Keys returned this run:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {card.parsedKeys.map((key) => (
              <Badge
                key={key}
                variant="outline"
                className="rounded-full border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-xs font-mono text-neutral-700"
              >
                {key}
              </Badge>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-400 italic">
          Click Run again — the keys will likely be different
        </p>
      </div>
    )
  }

  const renderScenario3Extra = () => {
    const card = cards[2]

    return (
      <div className="space-y-4">
        {/* Schema Definition panel — always shown */}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            PYDANTIC MODEL
          </p>
          <pre className="overflow-x-auto rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 font-mono text-xs leading-relaxed text-emerald-800">
            {personSchemaDisplay}
          </pre>
        </div>

        {/* Parsed table and success alert — after response */}
        {card.status !== "idle" &&
          card.status !== "loading" &&
          card.parsedJson && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Parsed &amp; Validated Output
                </p>
                <div className="rounded-lg border border-neutral-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-neutral-50">
                        <TableHead className="text-xs font-semibold text-neutral-600 w-1/3">
                          Field
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-neutral-600">
                          Value
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(card.parsedJson).map(([key, val]) => (
                        <TableRow key={key}>
                          <TableCell className="font-mono text-xs text-neutral-700 font-medium">
                            {key}
                          </TableCell>
                          <TableCell className="text-xs text-neutral-600">
                            {String(val)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Alert className="border-emerald-300 bg-emerald-50 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-sm font-semibold text-emerald-800">
                  Consistent Output
                </AlertTitle>
                <AlertDescription className="text-xs text-emerald-700">
                  ✓ Keys are always full_name, age, occupation, location — every single run.
                </AlertDescription>
              </Alert>
            </>
          )}
      </div>
    )
  }

  const extraRenderers = [renderScenario1Extra, renderScenario2Extra, renderScenario3Extra]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Structured Output
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            See how schema enforcement makes LLM outputs reliable
          </p>
          <div className="mt-3 flex gap-2">
            <Badge className="rounded-full border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100">
              Powered by Groq
            </Badge>
            <Badge className="rounded-full border border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100">
              OpenAI SDK Compatible
            </Badge>
          </div>
        </div>
      </header>

      {/* Shared Input */}
      <section className="mx-auto max-w-6xl px-6 py-6">
        <label
          htmlFor="user-input"
          className="mb-2 block text-sm font-medium text-neutral-700"
        >
          User Input
        </label>
        <Textarea
          id="user-input"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border-neutral-300 bg-neutral-50 font-mono text-sm text-black focus:border-neutral-400 focus:ring-neutral-400"
          placeholder="Enter text to extract structured data from…"
        />
        <p className="mt-1.5 text-xs text-neutral-400">
          This input feeds the scenario below
        </p>
      </section>

      {/* Navigation */}
      <section className="mx-auto max-w-6xl px-6 pb-6">
        <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-4">
          {scenarios.map((scenario, index) => (
            <Button
              key={scenario.id}
              variant={activeTab === index ? "default" : "outline"}
              onClick={() => setActiveTab(index)}
              className={activeTab === index ? "" : "text-neutral-600 bg-white"}
            >
              {scenario.title}
            </Button>
          ))}
        </div>
      </section>

      {/* Scenario Card */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="mx-auto max-w-3xl">
          {(() => {
            const index = activeTab
            const scenario = scenarios[index]
            return (
            <Card
              key={scenario.id}
              className="flex flex-col border border-neutral-200 bg-white shadow-sm"
            >
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-neutral-900">
                    {scenario.title}
                  </CardTitle>
                  <StatusBadge status={cards[index].status} />
                </div>
                <CardDescription className="text-xs text-neutral-500">
                  {scenario.description}
                </CardDescription>
                <div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${scenario.badgeColor}`}
                  >
                    {scenario.badgeLabel}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-4">
                {/* Extra content at the top for Scenario 3 (schema panel) */}
                {index === 2 && renderScenario3Extra()}

                <Button
                  onClick={() => runHandlers[index]()}
                  disabled={cards[index].status === "loading"}
                  variant="outline"
                  className="w-full border-neutral-300 text-neutral-700 hover:bg-neutral-50"
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
                    <p className="mb-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      Prompt Sent
                    </p>
                    <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-700 whitespace-pre-wrap">
                      {cards[index].prompt}
                    </pre>
                  </div>
                )}

                {/* Model Output */}
                {cards[index].output && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      Model Output
                    </p>
                    <pre
                      className={`overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap ${
                        cards[index].status === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700"
                      }`}
                    >
                      {cards[index].output}
                    </pre>
                  </div>
                )}

                {/* Scenario-specific extra content (alerts, badges, table) */}
                {index !== 2 && extraRenderers[index]()}
              </CardContent>
            </Card>
            )
          })()}
        </div>
      </section>
    </div>
  )
}
