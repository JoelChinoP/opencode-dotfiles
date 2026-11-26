// Global route order engine (rotation plan R2). Pure: snapshot, clock and budgets come from the caller.
// Nothing here reads the network or storage, calls the host, switches models or accounts, or sends prompts.
//
// Rule: keep the user's selection while every applicable window of the account in use stays below the threshold.
// Once one reaches it, walk the list from the first row and stop at the first destination proven eligible. Neither
// the order nor the clock alone causes a change, and a reset never makes an account eligible: only a fresh reading does.
//
// Input: { selection, targets, integrations (snapshot DTO: connections carry samples and failure), threshold, minimums,
//          now, readable: Set of integrations a policy read may refresh, visited: Set of refKeys already read for this
//          decision, discarded: Set of refKeys whose reading no longer belongs to them, budget: { origin, candidates },
//          paid: boolean, ttl: freshness table of the deciding location
//          (rules.freshness; the default one when left out) }
// Output: { kind: "keep" | "needRead" | "suggest" | "noTarget", origin, trigger?, read?, target?, reason?,
//           manual?, rows: [{ status, reason }] }
//   keep         below the threshold, or the origin could not be verified (`reason` says what to refresh)
//   needRead     one policy read of `read` would let the decision go on; the caller reads it and evaluates again
//   suggest      the first eligible destination, which this host cannot apply (`manual`, `reason`)
//   noTarget     no destination proven eligible; `reason` is the first useful one
import { refKey } from "./inventory.js"
import { compareDecimal, expiresAt, isDecimal, percent, sampleState, selectionKey, validThreshold, windowLabel } from "./rules.js"

// Windows a subscription destination must prove: a source that sent only one of them does not prove the other is absent.
export const REQUIRED = { openai: ["5h", "weekly"], "claude-agent": ["5h", "weekly"] }
const BALANCE = new Set(["deepseek"])

const sameModel = (t, selection) => !!selection && t.providerID === selection.providerID && t.modelID === selection.modelID &&
  (t.variant ?? undefined) === (selection.variant ?? undefined)
export const routeModelID = (t, selection) => t.modelID ?? (selection?.providerID === t.providerID ? selection.modelID : undefined)
export const catalogModel = (catalog, providerID, id) => catalog?.find((m) => m.enabled && m.providerID === providerID && m.id === id)

// An omitted effort follows the same model; a different model starts at its own default.
function modelOf(t, selection, catalog) {
  const modelID = routeModelID(t, selection)
  if (!modelID) return undefined
  const same = t.providerID === selection.providerID && modelID === selection.modelID
  const variant = t.variant ?? (same ? selection.variant : undefined)
  // A fixed effort on a floating model must still exist if the conversation has since changed models.
  if (!t.modelID && t.variant && t.variant !== selection.variant &&
    !catalogModel(catalog, t.providerID, modelID)?.variants.some((v) => v.id === t.variant)) return undefined
  return { providerID: t.providerID, modelID, ...(variant ? { variant } : {}) }
}

// Samples and the latest failure of one connection, with their owner IDs (the DTO leaves them out).
export function dataOf(integration, connection) {
  const samples = (connection.samples ?? []).map((s) => ({ ...s, integrationID: integration.id, connectionID: connection.id }))
  const failure = connection.failure && { ...connection.failure, integrationID: integration.id, connectionID: connection.id }
  return { samples, failure }
}

// The failure that makes a source's samples undecidable: one newer than them for the same source.
const failed = (data, s) => (data.failure && data.failure.source === s.source ? data.failure : undefined)

// Quota of one account for one model selection: general windows plus windows scoped to that exact selection.
// Returns { high } when a window is at or over the threshold (fresh, or a confirmed mark whose reset is still ahead),
// { below } when every required window is fresh and below it, otherwise { unknown }.
function quota(integrationID, data, scope, threshold, now, ttl) {
  const own = data.samples.filter((s) => s.used !== undefined)
    .filter((s) => s.scope === "general" || s.scope === scope)
  let high
  let waiting
  for (const s of own) {
    const state = sampleState(s, failed(data, s), now, ttl)
    if (state === "Fresh" && s.used !== undefined && s.used >= threshold && (!high || s.used > high.used)) high = s
    // A negative mark: a confirmed high value stays a reason to skip until its known reset, though no longer a figure.
    if (state === "Stale" && s.used !== undefined && s.used >= threshold && s.resetsAt > now) waiting = s
  }
  if (high) return { high: `${windowLabel(high.window, high.scope)}: ${percent(high.used)} used`, window: high }
  if (waiting) return { waiting: `Waiting for reset (${windowLabel(waiting.window, waiting.scope)})` }
  const required = REQUIRED[integrationID]
  if (!required) return { unknown: "Usage unknown", reader: false }
  for (const window of required) {
    const s = own.find((x) => x.window === window && x.scope === "general")
    const state = s ? sampleState(s, failed(data, s), now, ttl) : "No data"
    if (state !== "Fresh") return { unknown: "Usage unknown", state }
  }
  return { below: true }
}

// Kept apart from rules.js's: the data shapes differ ({ samples, failure } here, { own, failureOf } there).
const freshBalance = (data, now, ttl) => data.samples.find((s) => s.balances && sampleState(s, failed(data, s), now, ttl) === "Fresh")

// A paid key with a balance reader: available, in a currency with a configured minimum, strictly above it. USD and CNY
// are never added up; a currency without a minimum proves nothing.
function balanceFit(data, minimums, now, ttl) {
  const configured = Object.keys(minimums ?? {}).filter((c) => isDecimal(minimums[c]))
  if (configured.length === 0) return { reason: "No balance criterion" }
  const sample = freshBalance(data, now, ttl)
  if (!sample) return { unknown: "Usage unknown" }
  if (sample.available !== true) return { reason: "Balance not available" }
  const present = sample.balances.filter((b) => configured.includes(b.currency))
  if (present.length === 0) return { reason: `No ${configured.join(" or ")} balance` }
  const low = present.find((b) => compareDecimal(b.total, minimums[b.currency]) <= 0)
  return low ? { reason: `Balance: ${low.currency} ${low.total}` } : { fit: true }
}

// The origin's trigger: a fresh applicable window at or over the threshold, or a fresh balance at or below its minimum.
function originState(integration, connection, selection, threshold, minimums, now, ttl) {
  const data = dataOf(integration, connection)
  if (BALANCE.has(integration.id)) {
    const sample = freshBalance(data, now, ttl)
    if (!sample) return { state: "unknown" }
    const low = sample.balances.filter((b) => isDecimal(minimums?.[b.currency]) && compareDecimal(b.total, minimums[b.currency]) <= 0)
    return low.length > 0 ? { state: "trigger", text: "Low balance: " + low.map((b) => `${b.currency} ${b.total}`).join(", ") } : { state: "below" }
  }
  const q = quota(integration.id, data, selectionKey(selection), threshold, now, ttl)
  if (q.high) return { state: "trigger", text: q.high }
  // Below needs a fresh measure of the origin; a waiting mark or missing data leave the origin unverified.
  const fresh = data.samples.some((s) => s.used !== undefined && (s.scope === "general" || s.scope === selectionKey(selection)) &&
    sampleState(s, failed(data, s), now, ttl) === "Fresh")
  return fresh ? { state: "below" } : { state: "unknown" }
}

// Where a read of one account stands: allowed now, already used in this decision, or not possible.
function readability(input, integration, connection, data, purpose) {
  const key = refKey(integration.id, connection.id)
  if (input.discarded?.has(key)) return { reason: "Account changed during the read" }
  if (data.failure?.reason === "auth") return { reason: "Reconnect required" }
  if (data.failure?.retryAt > input.now) return { reason: "Waiting to retry" }
  if (!input.readable?.has(integration.id)) {
    return { reason: integration.refreshable ? "Refresh required" : "Usage unknown" }
  }
  if (input.visited?.has(key)) return { reason: "Not verified" }
  if ((input.budget?.[purpose] ?? 0) <= 0) return { reason: "Not verified (read budget used)" }
  return { read: { integrationID: integration.id, connectionID: connection.id, purpose } }
}

// The account a row would use: its exact connection, or the one active natively for its provider.
function accountOf(integration, t) {
  if (t.binding === "exact") return integration.connections.find((c) => c.id === t.connectionID) ?? { missing: "Account removed" }
  if (integration.active === "connection") return integration.connections.find((c) => c.active) ?? { missing: "Usage unknown" }
  return { missing: integration.active === "none" ? "No active account" : "Usage unknown" }
}

// One row: { status: "origin" | "eligible" | "skipped" | "pending", reason, read? }.
function evaluateRow(input, t, origin) {
  const integration = input.integrations.find((i) => i.id === t.integrationID)
  if (!integration) return { status: "skipped", reason: "Not in inventory" }
  if (t.providerID !== integration.id) return { status: "skipped", reason: "Model unavailable here" }
  const account = accountOf(integration, t)
  if (account.missing) return { status: "skipped", reason: account.missing }
  const model = modelOf(t, input.selection, input.catalog)
  if (!model) return { status: "skipped", reason: routeModelID(t, input.selection) ? "Choose an effort for this model" : "Choose a model for this provider" }
  if (origin && sameModel(model, input.selection) && origin.integrationID === integration.id && origin.connectionID === account.id) {
    return { status: "origin", reason: "In use now" }
  }
  if (account.reconnectRequired) return { status: "skipped", reason: "Reconnect required" }
  // Claude Code data belongs to its single profile only while the server can attribute it (passive flag).
  if (integration.id === "claude-agent" && !integration.passive) return { status: "skipped", reason: "Usage unknown" }
  const data = dataOf(integration, account)
  if (account.method === "key") {
    if (!input.paid) return { status: "skipped", reason: "Metered API not enabled" }
    if (!BALANCE.has(integration.id)) return { status: "skipped", reason: "No budget reader" }
    const fit = balanceFit(data, input.minimums, input.now, input.ttl)
    if (fit.fit) return { status: "eligible", model }
    if (fit.reason) return { status: "skipped", reason: fit.reason }
  } else {
    const q = quota(integration.id, data, selectionKey(model), input.threshold, input.now, input.ttl)
    if (q.high) return { status: "skipped", reason: q.high }
    if (q.waiting) return { status: "skipped", reason: q.waiting }
    if (q.below) return { status: "eligible", model }
    if (q.reader === false) return { status: "skipped", reason: q.unknown }
  }
  const readable = readability(input, integration, account, data, "candidates")
  return readable.read ? { status: "pending", reason: "Usage unknown", read: readable.read } : { status: "skipped", reason: readable.reason }
}

// The first eligible row as a decision, only suggested: an exact account needs a global switch (`/connect`), and this
// build offers no model switch.
function outcome(input, t, target, model) {
  if (t.binding === "exact" || sameModel(model, input.selection)) return { kind: "suggest", target, model, manual: true, reason: "Account switch is global" }
  return { kind: "suggest", target, model, manual: true, reason: "Model switch not enabled" }
}

export function decideRoute(input) {
  const targets = Array.isArray(input?.targets) ? input.targets : []
  const blank = targets.map(() => ({ status: "not-checked", reason: "" }))
  const selection = input?.selection
  if (!selection?.providerID || !selection.modelID || !validThreshold(input.threshold)) return { kind: "keep", reason: "Selection unknown", origin: { state: "unknown" }, rows: blank }
  const integration = input.integrations?.find((i) => i.id === selection.providerID)
  const account = integration?.active === "connection" ? integration.connections.find((c) => c.active) : undefined
  if (!integration || !account) return { kind: "keep", reason: "Usage unknown", origin: { state: "unknown" }, rows: blank }
  const origin = { integrationID: integration.id, connectionID: account.id,
    ...originState(integration, account, selection, input.threshold, input.minimums, input.now, input.ttl) }
  const evaluated = targets.map((t) => evaluateRow(input, t, origin))
  const rows = evaluated.map(({ status, reason }) => ({ status, reason: reason ?? "" }))
  if (origin.state === "below") return { kind: "keep", origin, rows }
  if (origin.state === "unknown") {
    // Never read reserves for a trigger that was not confirmed: at most the origin itself.
    const r = readability(input, integration, account, dataOf(integration, account), "origin")
    if (r.read) return { kind: "needRead", read: r.read, origin, rows }
    return { kind: "keep", reason: r.reason === "Not verified" ? "Usage unknown" : r.reason, origin, rows }
  }
  for (const [index, row] of evaluated.entries()) {
    if (row.status === "eligible") {
      rows.slice(index + 1).forEach((r) => { r.status = "not-checked"; r.reason = "" })
      return { ...outcome(input, targets[index], index, row.model), trigger: origin.text, origin, rows }
    }
    if (row.status === "pending") {
      rows.slice(index + 1).forEach((r) => { r.status = "not-checked"; r.reason = "" })
      return { kind: "needRead", read: row.read, trigger: origin.text, origin, rows }
    }
  }
  const first = rows.find((r) => r.status === "skipped")
  return { kind: "noTarget", reason: first?.reason ?? "No destination in the route order", trigger: origin.text, origin, rows }
}

// The next instant at which a decision of the preview can change by the clock alone (a sample's freshness, with the
// snapshot's `ttl` table, or, with `resets`, a reset of a held sample).
export const nextChange = (integrations, now, ttl, resets = true) => {
  let next
  for (const integration of integrations ?? []) {
    for (const connection of integration.connections ?? []) {
      for (const s of dataOf(integration, connection).samples) {
        for (const at of resets ? [expiresAt(s, ttl), s.resetsAt] : [expiresAt(s, ttl)]) if (at > now && (next === undefined || at < next)) next = at
      }
    }
  }
  return next
}
