// Claude Code plan usage (E02; S25, S26). EXPERIMENTAL and off by default. The passive part: the server watches it only with
// the plugin option `experimentalClaudeUsage: true`. In OpenCode 2.4.1 the claude-agent adapter keeps the last
// `rate_limit_event` the Agent SDK sent during a step in that step's provider metadata, and the core copies the
// metadata under the provider's own key to `session.step.ended` as `native` ({ rateLimit }): opaque replay data of
// the provider, not an API. Nothing in the passive part reads the network, a token, a keychain, SQLite or a file of the Claude Code
// profile, nor sends a prompt or /usage: it only reads what the user's own turns already produced. The figures belong
// to the one Claude Code profile OpenCode uses (~/.claude), never to the alias of its connection: OpenCode does not
// verify which account that profile is signed in to, and the CLI can switch accounts without OpenCode knowing.
// The one exception is the manual reader at the end (createUsageReader): on an explicit `r` or `a`, it runs the official
// `claude` binary once with the prompt `/usage` and reads its structured `usage_report` (Agent SDK SDKUsageReport).
import { spawn } from "node:child_process"
import { accessSync, constants, mkdtempSync, rmSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { isRecord, isRef } from "./inventory.js"
import { isNumber, isTime, validSample } from "./rules.js"

export const INTEGRATION = "claude-agent"
export const SOURCE = "claude-turns"
// The step end does not name its provider; the step start does (`model.providerID`), with the same message ID.
export const STEP_EVENTS = ["session.step.started", "session.step.ended"]

const HOUR = 3_600_000
// Plan windows by the SDK's `rateLimitType` (Agent SDK RateLimitInfo: five_hour, seven_day, seven_day_opus,
// seven_day_sonnet, overage). A model-family window has no exact model selection to bind to (the DTO scope is
// "general" or provider/model#variant, and access is never inferred from a model name) and overage is not a plan
// window: both are ignored, like any type not listed here.
const WINDOWS = new Map([["five_hour", { window: "5h", span: 5 * HOUR }], ["seven_day", { window: "weekly", span: 168 * HOUR }]])
const SKEW = 5_000
// The oldest step end used: an attribution bound, not a freshness. The checks below look at the inventory and the profile
// folder when the event is handled, so they vouch only for a step that just ended. It stays 5 min whatever
// `usageFreshnessSeconds` says (rules.js): a long freshness must not attribute hour-old steps to today's profile, and a
// short one must not drop a step delivered a little late (recorded, it shows its age, Stale if past the freshness).
const LATE = 5 * 60_000
const KEEP = 256

// `rate_limit_info` → one sample per window, or undefined. Documented (Agent SDK RateLimitInfo): `rateLimitType`,
// `utilization` (fraction 0–1 used) and `resetsAt` (Unix seconds). Observed in OpenCode 2.4.1's own recordings
// (Claude Code 2.1.301–2.1.326, SDK 0.3.301): `unifiedWindows[type]` = { utilization, resetsAt } and no top-level
// utilization. A window without a utilization has no figure (never 0). A utilization outside 0–1, a reset that is not
// a time after the observation and within the window's own span (plus an hour of clock skew), or two different values
// for one window drop that window.
export function parseRateLimit(info, observedAt) {
  if (!isRecord(info) || !isTime(observedAt)) return undefined
  const found = new Map()
  const dropped = new Set()
  const consider = (type, utilization, resetsAt) => {
    const spec = WINDOWS.get(type)
    if (!spec || utilization === undefined || utilization === null) return
    const at = resetsAt === undefined || resetsAt === null ? undefined : isNumber(resetsAt) ? resetsAt * 1000 : NaN
    const valid = isNumber(utilization) && utilization >= 0 && utilization <= 1 &&
      (at === undefined || (isTime(at) && at > observedAt && at <= observedAt + spec.span + HOUR))
    if (!valid) {
      dropped.add(spec.window)
      return
    }
    const sample = { window: spec.window, scope: "general", observedAt, used: Number((utilization * 100).toFixed(6)),
      ...(at !== undefined ? { resetsAt: at } : {}) }
    const prior = found.get(spec.window)
    if (prior && (prior.used !== sample.used || prior.resetsAt !== sample.resetsAt)) dropped.add(spec.window)
    found.set(spec.window, sample)
  }
  if (typeof info.rateLimitType === "string") consider(info.rateLimitType, info.utilization, info.resetsAt)
  if (isRecord(info.unifiedWindows)) {
    for (const [type, entry] of Object.entries(info.unifiedWindows)) if (isRecord(entry)) consider(type, entry.utilization, entry.resetsAt)
  }
  const samples = [...found.values()].filter((s) => !dropped.has(s.window))
  return samples.length > 0 ? samples : undefined
}

// The folders Claude Code runs with for claude-agent, derived as OpenCode 2.4.1 does (claude/query-options.ts,
// `configDirs` and `withoutDefaultFolder`): the provider setting `configDir` (a path or a list; `~/` expanded, then
// resolved); without it, the folder Claude Code defaults to (CLAUDE_CONFIG_DIR, else ~/.claude).
export function profileDirs(configDir, { env = process.env, home = homedir() } = {}) {
  const dirs = (Array.isArray(configDir) ? configDir : [configDir]).filter((item) => typeof item === "string")
    .map((item) => resolve(item.startsWith("~/") ? join(home, item.slice(2)) : item))
  if (dirs.length > 0) return dirs
  const own = env?.CLAUDE_CONFIG_DIR
  return [resolve(typeof own === "string" && own !== "" ? own : join(home, ".claude"))]
}

// The one profile this source vouches for: a single folder, ~/.claude. Another folder, or several (OpenCode rotates
// between them when one hits a limit, so a step may have run on any of them), is not it.
export function isDefaultProfile(configDir, system = {}) {
  const dirs = profileDirs(configDir, system)
  return dirs.length === 1 && dirs[0] === join(system.home ?? homedir(), ".claude")
}

// The saved claude-agent logins of a native inventory listing, every one of them (a login the DTO would not list
// still makes the profile ambiguous).
export function loginsOf(listed) {
  const info = Array.isArray(listed) ? listed.find((item) => item?.id === INTEGRATION) : undefined
  return Array.isArray(info?.connections) ? info.connections.filter((row) => row?.type === "credential") : []
}

// The saved Claude Code login when it is the only one and needs no sign-in; otherwise undefined.
export function soleRow(rows) {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined
  return row?.type === "credential" && isRef(row.id) && row.method === "external" && row.status?.status !== "needs_auth" ? row : undefined
}

// Where a step ran: the event's own location when it carries one; OpenCode 2.4.1 delivers session events without it
// (observed in the HOST lab), so then the session's, a local read of its metadata. Unknown: undefined.
async function stepLocation(ctx, event, sessionID) {
  const own = event.location?.directory
  if (typeof own === "string" && own !== "") return { directory: own }
  const directory = (await ctx.session.get({ sessionID }))?.location?.directory
  return typeof directory === "string" && directory !== "" ? { directory } : undefined
}

// The connection a sample is attributed to, read when a step ends: the only saved claude-agent login, signed in, of a
// provider that runs the ~/.claude profile alone in the location that ran the step. No reference when there are none
// or several, when the inventory, the location or the provider settings cannot be read, or for another profile.
async function soleConnection(ctx, event, sessionID, system) {
  try {
    const row = soleRow(loginsOf((await ctx.integration.list())?.data))
    const location = row && (await stepLocation(ctx, event, sessionID))
    if (!location) return undefined
    const provider = (await ctx.provider.get({ providerID: INTEGRATION, location }))?.data
    return isDefaultProfile(provider?.settings?.configDir, system) ? row.id : undefined
  } catch {
    return undefined
  }
}

// What makes the Claude data unattributable until the next turn: a credential event of claude-agent, or an
// integration update (it names no integration, so it may be this one).
export const invalidates = (event) => event?.type === "integration.updated" ||
  ((event?.type === "credential.updated" || event?.type === "credential.switched") && event.data?.integrationID === INTEGRATION)

// Shared by every location instance of the server: steps known to run on claude-agent, events already handled (each
// instance receives the same event) and a generation that rises whenever the Claude data is invalidated.
export const createState = () => ({ steps: new Map(), seen: new Set(), generation: 0 })

const keep = (collection, key, value) => {
  if (collection instanceof Map) collection.set(key, value)
  else collection.add(key)
  if (collection.size > KEEP) collection.delete(collection.keys().next().value)
}

// The user's own turns, read as they end. Returns true when samples were recorded. A step end is used only if its
// start named claude-agent, it is recent (ended less than LATE ago) and it carries a known window; its samples go to
// the single profile's connection, all checked before anything is stored. An invalidation while the checks run
// discards it.
export function createTurns({ state, cache, now = Date.now, system }) {
  return async function observe(ctx, event) {
    if (!isRecord(event) || !isRef(event.id) || !STEP_EVENTS.includes(event.type) || state.seen.has(event.id)) return false
    keep(state.seen, event.id)
    const data = isRecord(event.data) ? event.data : {}
    if (!isRef(data.sessionID) || !isRef(data.assistantMessageID)) return false
    const key = JSON.stringify([data.sessionID, data.assistantMessageID])
    if (event.type === "session.step.started") {
      if (data.model?.providerID === INTEGRATION) keep(state.steps, key, true)
      else state.steps.delete(key)
      return false
    }
    if (!state.steps.delete(key)) return false
    const at = now()
    if (!isTime(event.created) || event.created > at + SKEW || at - event.created >= LATE) return false
    const samples = parseRateLimit(isRecord(data.native) ? data.native.rateLimit : undefined, Math.min(event.created, at))
    if (!samples) return false
    const generation = state.generation
    const connectionID = await soleConnection(ctx, event, data.sessionID, system)
    if (!connectionID || generation !== state.generation) return false
    const ref = { integrationID: INTEGRATION, connectionID, source: SOURCE }
    const all = samples.map((sample) => ({ ...sample, ...ref }))
    if (!all.every(validSample)) return false
    return all.map((sample) => cache.record(sample)).some(Boolean)
  }
}

// ---- Manual `/usage` reader -----------------------------------------------------------------------------------------
// Claude Code answers `/usage` locally (a slash command, no model turn) and, for a claude.ai plan login, attaches
// `usage_report` (SDKUsageReport, experimental) to the assistant message that carries the text. The process runs
// without settings, hooks, MCP servers or tools, in a new empty folder removed afterwards; it inherits the environment
// like OpenCode's claude-agent does and gets no new secret. Nothing here reads a credential, token or keychain.
export const USAGE_SOURCE = "claude-usage"
export const USAGE_ARGS = Object.freeze(["-p", "/usage", "--output-format", "stream-json", "--verbose", "--setting-sources", "",
  "--strict-mcp-config", "--tools", "", "--no-session-persistence"])
const USAGE_WINDOWS = new Map([["session", WINDOWS.get("five_hour")], ["weekly_all", WINDOWS.get("seven_day")]])
const MAX_OUTPUT = 1_048_576
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const usageFailure = (reason) => ({ reason })

// The binary OpenCode 2.4.1 runs for claude-agent (claude/io.ts): OPENCODE_CLAUDE_PATH, else `claude` on the PATH.
export function claudeBinary(env = process.env) {
  if (typeof env?.OPENCODE_CLAUDE_PATH === "string" && env.OPENCODE_CLAUDE_PATH !== "") return env.OPENCODE_CLAUDE_PATH
  for (const dir of String(env?.PATH ?? "").split(delimiter)) {
    if (dir === "") continue
    const file = join(dir, "claude")
    try {
      accessSync(file, constants.X_OK)
      if (statSync(file).isFile()) return file
    } catch {}
  }
  return undefined
}

// The environment claude-agent gives Claude Code for the ~/.claude profile (query-options.ts): the process's own, with
// CLAUDE_CONFIG_DIR set to the configured folder only when the environment already sets it (withoutDefaultFolder), and
// without CLAUDE_CODE_SIMPLE (OpenCode clears it). No credential or setting of the provider is added.
export function usageEnv(configDir, { env = process.env, home = homedir() } = {}) {
  const out = { ...env }
  delete out.CLAUDE_CODE_SIMPLE
  if (configDir !== undefined && env.CLAUDE_CONFIG_DIR !== undefined) out.CLAUDE_CONFIG_DIR = profileDirs(configDir, { env, home })[0]
  return out
}

const tokensIn = (usage) => isRecord(usage) && Object.entries(usage).some(([key, value]) => /tokens$/.test(key) && isNumber(value) && value > 0)
const spent = (value) => isNumber(value) && value > 0

// Stream-json lines → { samples } ([] when Claude Code has no plan rows) or { reason }. Exactly one `usage_report` is
// required, and nothing may show a model turn: tokens or a cost above 0, a partial-stream event or an error result.
export function parseUsageReport(text, observedAt) {
  const messages = []
  for (const line of String(text).split("\n")) {
    if (line.trim() === "") continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      return { reason: "invalid" }
    }
  }
  if (!messages.every(isRecord)) return { reason: "invalid" }
  const results = messages.filter((m) => m.type === "result")
  const result = results.length === 1 ? results[0] : undefined
  const model = messages.some((m) => m.type === "stream_event" || (m.type === "assistant" && tokensIn(m.message?.usage))) ||
    spent(result?.total_cost_usd) || tokensIn(result?.usage) ||
    (isRecord(result?.modelUsage) && Object.values(result.modelUsage).some((u) => tokensIn(u) || spent(u?.costUSD)))
  const reports = messages.filter((m) => m.type === "assistant" && m.usage_report !== undefined).map((m) => m.usage_report)
  if (model || reports.some((r) => isRecord(r) && spent(r.session?.total_cost_usd))) return { reason: "model" }
  if (!result || result.is_error === true || reports.length !== 1 || !isRecord(reports[0])) return { reason: "invalid" }
  const limits = reports[0].rate_limits === null ? null : isRecord(reports[0].rate_limits) ? reports[0].rate_limits.limits : undefined
  if (limits === null) return { samples: [] }
  if (!Array.isArray(limits)) return { reason: "invalid" }
  const found = new Map()
  const dropped = new Set()
  for (const row of limits) {
    const spec = isRecord(row) ? USAGE_WINDOWS.get(row.kind) : undefined
    if (!spec) continue
    const at = row.resets_at === null || row.resets_at === undefined ? undefined
      : typeof row.resets_at === "string" && ISO.test(row.resets_at) ? Date.parse(row.resets_at) : NaN
    const valid = isNumber(row.percent) && row.percent >= 0 && row.percent <= 100 &&
      (at === undefined || (isTime(at) && at > observedAt - SKEW && at <= observedAt + spec.span + HOUR))
    if (!valid) {
      dropped.add(spec.window)
      continue
    }
    const sample = { window: spec.window, scope: "general", observedAt, used: row.percent, ...(at !== undefined ? { resetsAt: at } : {}) }
    const prior = found.get(spec.window)
    if (prior && (prior.used !== sample.used || prior.resetsAt !== sample.resetsAt)) dropped.add(spec.window)
    found.set(spec.window, sample)
  }
  return { samples: [...found.values()].filter((s) => !dropped.has(s.window)) }
}

// One run of `claude -p /usage`: bounded stdout, stderr discarded, killed (with its process group) on timeout or when
// the plugin unloads; its new folder is removed once the process has exited.
function runUsage({ launch, bin, env, timeout, signal, temp }) {
  const cwd = mkdtempSync(join(temp, "account-quota-usage-"))
  return new Promise((done, fail) => {
    let child
    let size = 0
    let reason
    let timer
    const chunks = []
    const stop = (why) => {
      reason ??= why
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        try { child.kill("SIGKILL") } catch {}
      }
    }
    // Only the server's unload aborts this, and schedule() then records nothing: "cancelled" is not in the RPC contract.
    const onAbort = () => stop("cancelled")
    let settled = false
    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      rmSync(cwd, { recursive: true, force: true })
      if (reason) fail(usageFailure(reason))
      else if (code !== 0) fail(usageFailure("exit"))
      else done(Buffer.concat(chunks).toString("utf8"))
    }
    try {
      child = launch(bin, [...USAGE_ARGS], { cwd, env, stdio: ["ignore", "pipe", "ignore"], detached: true, windowsHide: true })
    } catch {
      rmSync(cwd, { recursive: true, force: true })
      fail(usageFailure("missing"))
      return
    }
    timer = setTimeout(() => stop("timeout"), timeout)
    if (signal.aborted) onAbort()
    else signal.addEventListener("abort", onAbort, { once: true })
    child.stdout?.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_OUTPUT) stop("too-large")
      else chunks.push(chunk)
    })
    child.on("error", () => {
      reason ??= "missing"
      finish()
    })
    child.on("close", finish)
  })
}

let usageRunning = false

// The manual reader of claude-agent. It runs only with the attribution of the passive source (one saved login, signed
// in, the single ~/.claude profile, no credentials in the provider settings); otherwise it fails without a process.
// `launch` (the process launcher), `system` ({ env, home, tmp }) and `timeout` stand in for the real ones in tests.
export function createUsageReader({ launch = spawn, system = {}, now = Date.now, timeout = 20_000 } = {}) {
  return {
    source: USAGE_SOURCE,
    // Only an explicit Refresh: never when the panel opens, on load, at a turn end or on a timer.
    manual: true,
    bound: true,
    // No plan rows (`rate_limits: null`) is a read without data, not a failure.
    empty: true,
    async read({ ctx, connection, signal }) {
      const env = system.env ?? process.env
      const home = system.home ?? homedir()
      let settings
      try {
        if (soleRow(loginsOf((await ctx.integration.list())?.data))?.id !== connection?.id) throw usageFailure("profile")
        settings = (await ctx.provider.get({ providerID: INTEGRATION }))?.data?.settings ?? {}
      } catch (error) {
        throw typeof error?.reason === "string" ? error : usageFailure("profile")
      }
      const own = ["apiKey", "authToken", "baseURL"].some((key) => settings?.[key] !== undefined)
      if (own || !isDefaultProfile(settings?.configDir, { env, home })) throw usageFailure("profile")
      const bin = claudeBinary(env)
      if (!bin) throw usageFailure("missing")
      if (usageRunning) throw usageFailure("busy")
      usageRunning = true
      let text
      try {
        text = await runUsage({ launch, bin, env: usageEnv(settings?.configDir, { env, home }), timeout, signal, temp: system.tmp ?? tmpdir() })
      } finally {
        usageRunning = false
      }
      const parsed = parseUsageReport(text, now())
      if (parsed.reason) throw usageFailure(parsed.reason)
      return parsed.samples
    },
  }
}
