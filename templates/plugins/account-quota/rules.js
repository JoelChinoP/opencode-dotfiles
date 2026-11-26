// Decision rules (B03, B06; S01 §§2–5, 8, 11–12). Pure: state and clock come from the caller. Nothing here
// reads the network, writes storage, switches accounts or sends prompts; a result is only advice to display.
import { isRef } from "./inventory.js"

// Freshness: how long a sample stays Fresh (drawn as current and decisive). A known reset ends it sooner; past either it
// is Stale, never 0%. ChatGPT (Codex) and Claude Code usage follow the plugin option `usageFreshnessSeconds` of the
// location's server instance: a positive safe integer up to MAX_USAGE_FRESHNESS (one hour); missing or anything else is
// USAGE_FRESHNESS. DeepSeek balances keep 2 min and the Anthropic API 5 min. This is not the age limit of a Claude step
// event (claude.js), a retry wait or a window's real expiry. Callers pass the table on; nothing here holds an option.
export const USAGE_FRESHNESS = 150
export const MAX_USAGE_FRESHNESS = 3600
export const usageFreshness = (value) =>
  (Number.isSafeInteger(value) && value > 0 && value <= MAX_USAGE_FRESHNESS ? value : USAGE_FRESHNESS)
// Milliseconds per integration for a usage freshness in seconds (invalid → the default).
export function freshness(seconds) {
  const usage = usageFreshness(seconds) * 1000
  return Object.freeze({ openai: usage, "claude-agent": usage, deepseek: 120_000, anthropic: 300_000 })
}
export const TTL = freshness(USAGE_FRESHNESS)
const BALANCE = new Set(["deepseek"])
export const TURN_END = new Set(["session.execution.succeeded", "session.execution.failed"])

export const isNumber = (value) => typeof value === "number" && Number.isFinite(value)
export const isTime = (ms) => isNumber(ms) && !Number.isNaN(new Date(ms).getTime())
const DECIMAL = /^-?(0|[1-9]\d{0,17})(\.\d{1,18})?$/

export const validThreshold = (value) => Number.isInteger(value) && value >= 90 && value <= 100
export const isDecimal = (value) => typeof value === "string" && DECIMAL.test(value)
export const isCurrency = (value) => typeof value === "string" && /^[A-Z]{3}$/.test(value)
export const selectionKey = (selection) =>
  `${selection.providerID}/${selection.modelID}${selection.variant ? "#" + selection.variant : ""}`

// Exact decimal comparison of source strings: no binary floating point, "1.10" equals "1.1000".
export function compareDecimal(a, b) {
  const [ai, af = ""] = a.split(".")
  const [bi, bf = ""] = b.split(".")
  const width = Math.max(af.length, bf.length)
  const scaled = (int, frac) => {
    const value = BigInt(int.replace("-", "") + frac.padEnd(width, "0"))
    return int.startsWith("-") ? -value : value
  }
  const x = scaled(ai, af)
  const y = scaled(bi, bf)
  return x < y ? -1 : x > y ? 1 : 0
}

// A sample is attributed to one account, source, window and scope ("general" or an exact selectionKey).
export function validSample(s) {
  if (!s || typeof s !== "object" || ![s.integrationID, s.connectionID, s.source, s.window, s.scope].every(isRef)) return false
  if (!isTime(s.observedAt) || (s.resetsAt !== undefined && !isTime(s.resetsAt))) return false
  if (s.balances !== undefined) {
    return typeof s.available === "boolean" && Array.isArray(s.balances) && s.balances.length > 0 &&
      s.balances.length <= 8 && s.balances.every((b) => isCurrency(b?.currency) && isDecimal(b.total)) &&
      new Set(s.balances.map((b) => b.currency)).size === s.balances.length
  }
  return typeof s.used === "number" && Number.isFinite(s.used) && s.used >= 0 && s.used <= 100
}

const pick = (s) => ({
  integrationID: s.integrationID, connectionID: s.connectionID, source: s.source, window: s.window, scope: s.scope,
  observedAt: s.observedAt,
  ...(s.resetsAt !== undefined ? { resetsAt: s.resetsAt } : {}),
  ...(s.balances !== undefined ? { available: s.available, balances: s.balances.map(({ currency, total }) => ({ currency, total })) }
    : { used: s.used }),
})
const sampleKey = (s) => JSON.stringify([s.integrationID, s.connectionID, s.source, s.window, s.scope])
const sourceKey = (s) => JSON.stringify([s.integrationID, s.connectionID, s.source])

// In-memory measurements, indexed by account, source, window and scope. Late samples are dropped, a newer
// failure keeps the older value visible but no longer decisive, and a newer sample clears its source's failure.
export function createCache() {
  const samples = new Map()
  const failures = new Map()
  return {
    record(sample) {
      if (!validSample(sample)) return false
      const prior = samples.get(sampleKey(sample))
      const failure = failures.get(sourceKey(sample))
      if ((prior && prior.observedAt >= sample.observedAt) || (failure && failure.at >= sample.observedAt)) return false
      samples.set(sampleKey(sample), pick(sample))
      failures.delete(sourceKey(sample))
      return true
    },
    fail({ integrationID, connectionID, source }, at, reason, retryAt) {
      const key = sourceKey({ integrationID, connectionID, source })
      if (!isTime(at) || (failures.get(key)?.at ?? -Infinity) >= at) return false
      failures.set(key, { integrationID, connectionID, source, at, reason, ...(isTime(retryAt) ? { retryAt } : {}) })
      return true
    },
    list: () => ({ samples: [...samples.values()], failures: [...failures.values()] }),
    // Everything held for one integration (or one of its connections), e.g. when its data can no longer be attributed.
    forget(integrationID, connectionID) {
      for (const map of [samples, failures]) {
        for (const [key, item] of map) {
          if (item.integrationID === integrationID && (connectionID === undefined || item.connectionID === connectionID)) map.delete(key)
        }
      }
    },
    clear() {
      samples.clear()
      failures.clear()
    },
  }
}

// `ttl`: a freshness table (freshness()); the default one when left out.
export const expiresAt = (s, ttl = TTL) =>
  Math.min(s.observedAt + (Object.hasOwn(ttl, s.integrationID) ? ttl[s.integrationID] : 120_000), s.resetsAt ?? Infinity)

// Fresh | Stale | No data | Refresh failed. Reaching resetsAt makes a value stale; it never
// becomes 0% by itself.
export function sampleState(sample, failure, now, ttl = TTL) {
  if (failure && (!sample || failure.at >= sample.observedAt)) return "Refresh failed"
  if (!sample) return "No data"
  if (now >= expiresAt(sample, ttl)) return "Stale"
  return "Fresh"
}

// Truncated to two decimals, never rounded up to a threshold; rounded first to 6 decimals so binary noise does not
// show 8.2 as 8.19%.
export const percent = (value) => `${Math.floor(Math.round(value * 1e6) / 1e4) / 100}%`
export const windowLabel = (window, scope) =>
  (window === "5h" ? "5 h" : window === "weekly" ? "Weekly" : window) + (scope === "general" ? "" : ` (${scope.split("/").pop()})`)

function accountData(integrationID, connectionID, scope, samples, failures) {
  const own = samples.filter((s) => s.integrationID === integrationID && s.connectionID === connectionID &&
    (s.scope === "general" || s.scope === scope))
  const failureOf = (source) => failures.find((f) =>
    f.integrationID === integrationID && f.connectionID === connectionID && f.source === source)
  return { own, failureOf }
}

// What a trigger is about and what a fresh sample measured: one window and scope, or one balance currency.
const dimension = (window, scope) => JSON.stringify([window, scope])

function quotaTrigger(data, threshold, now, ttl) {
  let hit
  for (const s of data.own) {
    if (s.used === undefined || sampleState(s, data.failureOf(s.source), now, ttl) !== "Fresh") continue
    if (s.used >= threshold && (!hit || s.used > hit.used)) hit = s
  }
  return hit && { window: hit.window, scope: hit.scope, used: hit.used, keys: [dimension(hit.window, hit.scope)],
    text: `${windowLabel(hit.window, hit.scope)}: ${percent(hit.used)} used` }
}

// Kept apart from routing.js's: the data shapes differ ({ own, failureOf } here, { samples, failure } there).
const freshBalance = (data, now, ttl) =>
  data.own.find((s) => s.balances && sampleState(s, data.failureOf(s.source), now, ttl) === "Fresh")

function balanceTrigger(data, minimums, now, ttl) {
  const sample = freshBalance(data, now, ttl)
  const low = (sample?.balances ?? []).filter((b) => isDecimal(minimums[b.currency]) && compareDecimal(b.total, minimums[b.currency]) <= 0)
  return low.length > 0 && {
    window: "balance", currencies: low.map((b) => b.currency), keys: low.map((b) => dimension("balance", b.currency)),
    text: "Low balance: " + low.map((b) => `${b.currency} ${b.total}`).join(", "),
  }
}

// Dimensions of the active account backed by a fresh sample: what an "idle" result really measured, so the
// caller can tell a confirmed recovery from data that is only stale, failed or missing.
const measured = (data, balance, now, ttl) => balance
  ? (freshBalance(data, now, ttl)?.balances ?? []).map((b) => dimension("balance", b.currency))
  : data.own.filter((s) => s.used !== undefined && sampleState(s, data.failureOf(s.source), now, ttl) === "Fresh").map((s) => dimension(s.window, s.scope))

// Identity gate. The snapshot never proves an independent quota holder, the same billing scope or access to the exact
// model, so no other account is ever a confirmed destination (decision 1 in the evidence file): this names why.
function excluded(candidate) {
  if (candidate.reconnectRequired) return "Reconnect required"
  if (candidate.method === "external") return "Profile not verified"
  return "Independent quota not proven"
}

// One integration, connections already in priority order. Returns
//   { kind: "idle", measured? }          nothing reached the threshold (or nothing to evaluate);
//                                        `measured` lists the dimensions a fresh sample backs
//   { kind: "none", reason, trigger }    No confirmed alternative, with the reason of the next account in the order
// `ttl`: the freshness table of the snapshot's location (freshness()); the default one when left out.
export function recommend({ integration, selection, threshold, minimums = {}, samples = [], failures = [], now, ttl = TTL }) {
  if (!validThreshold(threshold) || !integration || !selection || selection.providerID !== integration.id) return { kind: "idle" }
  const scope = selectionKey(selection)
  const order = integration.connections
  const activeID = integration.activeID ?? order.find((c) => c.active)?.id
  if (!isRef(activeID)) return { kind: "idle" }
  const source = accountData(integration.id, activeID, scope, samples, failures)
  const balance = BALANCE.has(integration.id)
  const trigger = balance ? balanceTrigger(source, minimums, now, ttl) : quotaTrigger(source, threshold, now, ttl)
  if (!trigger) return { kind: "idle", measured: measured(source, balance, now, ttl) }
  const start = order.findIndex((c) => c.id === activeID)
  if (start < 0) return { kind: "none", reason: "Active account is not in the priority order", trigger }
  const next = order[(start + 1) % order.length]
  return { kind: "none", reason: order.length > 1 ? excluded(next) : "No other account in this integration", trigger }
}

const contextKey = (selection, account) => JSON.stringify([selectionKey(selection), account ?? null])
// A plain copy: the host's selection may be a reactive object that changes in place.
const pin = ({ providerID, modelID, variant }) => ({ providerID, modelID, ...(variant ? { variant } : {}) })
const motiveOf = (result) => (result && result.kind !== "idle" && result.trigger
  ? JSON.stringify([result.kind, result.to ?? result.reason, result.trigger.keys]) : undefined)
// Recovery needs a fresh sample of what triggered: stale, failed or missing data is not a recovery.
const recovered = (result, keys) => result?.kind === "idle" && keys.length > 0 && keys.every((key) => result.measured?.includes(key))

// Turn-end advisor (B03.5). A notice is born only from a final turn result of the session on screen, once per
// event; steps, tools, compaction and host retries do not count. Afterwards it is only revalidated against the
// held snapshot and the clock: it stays while they give the same advice for the same selection and active
// account, and is withdrawn otherwise (recovery, newer failure, stale or reset sample, missing account,
// selection or session). Revalidating never raises a notice. An episode lasts from the first notice until a
// fresh sample of its trigger shows recovery; within it a dismissed motive is not raised again. A changed
// selection or account starts another episode; the invalidation counter of the snapshot plays no part.
//   view:    { account(selection), evaluate(selection) } over the snapshot held at one instant
//   context: view + { sessionID, selection } of the session on screen
export function createAdvisor() {
  let notice
  let episode
  const seen = []
  const revalidate = (view) => {
    if (notice && (view.account(notice.selection) !== notice.account || motiveOf(view.evaluate(notice.selection)) !== notice.motive)) notice = undefined
    if (episode && view.account(episode.selection) === episode.account && recovered(view.evaluate(episode.selection), episode.keys)) episode = undefined
  }
  return {
    // Returns true only when a notice that was not on screen is raised.
    turnEnded(event, context) {
      if (!TURN_END.has(event?.type) || event.data?.sessionID !== context.sessionID || !isRef(event.id) || !context.selection) return false
      if (seen.includes(event.id)) return false
      seen.push(event.id)
      if (seen.length > 64) seen.shift()
      const account = context.account(context.selection)
      const key = contextKey(context.selection, account)
      const result = context.evaluate(context.selection)
      const motive = motiveOf(result)
      if (notice && (notice.key !== key || notice.sessionID !== context.sessionID || notice.motive !== motive)) notice = undefined
      if (episode && (episode.key !== key || recovered(result, episode.keys))) episode = undefined
      if (!motive) return false
      const selection = pin(context.selection)
      episode ??= { key, selection, account, keys: [], dismissed: new Set() }
      episode.keys = result.trigger.keys
      if (episode.dismissed.has(motive)) return false
      const shown = notice !== undefined
      notice = { key, sessionID: context.sessionID, selection, account, motive, result, afterFailure: event.type === "session.execution.failed" }
      return !shown
    },
    // A new snapshot, or the clock reached a sample's expiry: withdraw what is no longer true.
    observe: revalidate,
    // What the session on screen may show now, with the current values. Leaving its session, selection or
    // account ends the notice; while the context is unknown (no session, no snapshot) the caller shows nothing.
    current(context) {
      if (notice && (context.sessionID !== notice.sessionID || !context.selection ||
        contextKey(context.selection, context.account(context.selection)) !== notice.key)) notice = undefined
      revalidate(context)
      return notice && { ...notice, result: context.evaluate(notice.selection) }
    },
    dismiss() {
      if (notice) episode?.dismissed.add(notice.motive)
      notice = undefined
    },
    pending: () => notice !== undefined,
    // Something a reload can change: a notice on screen, or a dismissed episode waiting for a fresh sample of recovery.
    watching: () => notice !== undefined || episode !== undefined,
  }
}
