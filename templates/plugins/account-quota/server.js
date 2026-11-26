// Server half of Account Quota (S07, S08, S15). index.js builds the shipped plugin with the contract from
// rpc.js; the HOST lab builds the same plugin with synthetic readers through createPlugin(), and node tests
// pass a stand-in contract because only the host resolves "@opencode/plugin/rpc". There is no test switch,
// no configurable endpoint and no way for a client to name anything beyond a reference from this inventory.
import { INTEGRATION as CLAUDE, STEP_EVENTS, createState, createTurns, invalidates, loginsOf, soleRow } from "./claude.js"
import { inventorySnapshot, isAccountReference, isRef } from "./inventory.js"
import { KEY, ROUTING_KEY, parseRouting, parseStored, proposal, reconcile, routingProposal } from "./preferences.js"
import { decideRoute } from "./routing.js"
import { TURN_END, USAGE_FRESHNESS, createCache, freshness, usageFreshness, validSample } from "./rules.js"

const nativeEvents = ["credential.updated", "credential.switched", "integration.updated"]
const ROUTE_EVENTS = ["session.step.started", "session.execution.started", "session.execution.succeeded", "session.execution.failed"]
// 2.4.1 publishes it (rotation plan O1); its own subscription, in case an older host refuses the type.
const SELECTED = ["session.model.selected"]
const scope = "personal-server"
const maxRef = 200
const maxListed = 64
const maxReads = 2 // external reads in flight for the whole server (S01 §11)
const backoff = (failures) => Math.min(15 * 60_000, 15_000 * 2 ** (failures - 1))
// An unbounded Retry-After would leave the account unable to refresh for days, until OpenCode restarts.
const maxWait = 60 * 60_000
// Route decisions (rotation plan §4): a decision reads at most the origin once and two candidates, one after the other,
// and is abandoned after `decisionMs` (an initial value to rehearse, not a provider promise).
const decisionMs = 5_000
// How long a snapshot waits at most for a Claude step end still being attributed, so a read made at a turn end (the
// TUI reads just before evaluating its notice) carries that turn's usage.
const attributionMs = 500
const decisionBudget = { origin: 1, candidates: 2 }
const keepDecisions = 64
const createRouting = () => ({ sessions: new Map(), seen: [], models: new Map(), checks: new Map() })

// A server loads one instance per location, all in this process. They share the revision, the event fan-out,
// the measurement cache, reads in flight and the single preference writer: that is the personal-server scope.
// There is no global event counter: a read is kept or dropped by checking its own reference, never because some
// other account changed meanwhile.
const shared = (globalThis[Symbol.for("account-quota.server.v6")] ??= {
  revision: 0,
  emitters: new Set(),
  timer: undefined,
  lock: Promise.resolve(),
  cache: createCache(),
  inflight: new Map(),
  failuresInRow: new Map(),
  reading: 0,
  waiting: [],
  stop: new AbortController(),
  claude: createState(),
})
// A hot reload can reuse an older v6 object; upgrade it in place so existing instances keep the same scheduler.
shared.until ??= new Map()
shared.epochs ??= new Map()
shared.routing ??= createRouting()
shared.routing.checks ??= new Map()

const integrations = new Set(["openai", "deepseek", "anthropic", "claude-agent"])

// Claude's passive usage (E02) is dropped as soon as it can no longer be attributed to the single profile; a step
// end whose checks are still running when this happens records nothing.
function forgetClaude() {
  shared.claude.generation += 1
  shared.cache.forget(CLAUDE)
}

// Coalesces simultaneous native events (each location receives the same global event) into one revision.
export function invalidate() {
  if (shared.timer !== undefined) return
  shared.timer = setTimeout(() => {
    shared.timer = undefined
    shared.revision += 1
    for (const emit of shared.emitters) emit(shared.revision)
  }, 25)
}

// One writer per server: every preference write runs after the previous one and re-reads the stored revision,
// so two clients with the same revision cannot both succeed, whatever their location.
function exclusive(task) {
  const run = shared.lock.then(task)
  shared.lock = run.catch(() => {})
  return run
}

// At most `maxReads` reads in flight for the whole server; the rest wait in order. A read whose server stopped
// while it waited is never started: it settles at once and hands its turn on, so nothing is left pending.
// A read whose every requester has given up while it waited (`wanted()` false: a route decision that expired) is not
// started either: work that already expired is never sent.
function limited(signal, task, wanted = () => true) {
  return new Promise((resolve, reject) => {
    const start = () => {
      if (signal.aborted || !wanted()) {
        reject(signal.aborted ? { reason: "unknown" } : { expired: true })
        if (shared.reading < maxReads) shared.waiting.shift()?.()
        return
      }
      shared.reading += 1
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        shared.reading -= 1
        shared.waiting.shift()?.()
      })
    }
    if (shared.reading < maxReads) start()
    else shared.waiting.push(start)
  })
}

// The native row of exactly this saved connection, read again from the inventory: still listed once under its
// integration, with the same login method and no pending sign-in. Anything else (removed, replaced, signed out,
// unreadable) is undefined. Used by readers bound to one login before its credential is touched and after the answer.
async function liveRow(ctx, integrationID, connectionID, method) {
  try {
    const info = (await ctx.integration.list())?.data?.find((item) => item?.id === integrationID)
    const rows = Array.isArray(info?.connections) ? info.connections.filter((row) => row?.type === "credential" && row.id === connectionID) : []
    const row = rows.length === 1 ? rows[0] : undefined
    return row && row.method === method && row.status?.status !== "needs_auth" ? row : undefined
  } catch {
    return undefined
  }
}

function bounded(snapshot) {
  const fits =
    snapshot.integrations.length <= maxListed &&
    snapshot.integrations.every((item) => isRef(item.id) && item.connections.length <= maxListed)
  if (!fits) return { ...snapshot, inventory: "unavailable", integrations: [] }
  const clip = (label) => (label.length <= maxRef ? label : label.slice(0, maxRef - 1) + "…")
  return {
    ...snapshot,
    integrations: snapshot.integrations.map((item) => ({
      ...item,
      connections: item.connections.map((connection) => ({ ...connection, label: clip(connection.label) })),
    })),
  }
}

async function readPreferences(ctx) {
  try {
    return parseStored(await ctx.storage.get(KEY))
  } catch {
    return { state: "unavailable" }
  }
}

// Measurements of one connection as the DTO carries them: no account fields, no raw payloads.
function measured(integrationID, connectionID) {
  const { samples, failures } = shared.cache.list()
  const own = (item) => item.integrationID === integrationID && item.connectionID === connectionID
  const strip = ({ integrationID: _i, connectionID: _c, ...rest }) => rest
  let mine = samples.filter(own)
  // Claude's two sources (passive turns, manual /usage) share one cache: the most recent sample of each window wins.
  if (integrationID === CLAUDE) {
    const newest = new Map()
    for (const s of mine) {
      const key = JSON.stringify([s.window, s.scope])
      if (!newest.has(key) || newest.get(key).observedAt < s.observedAt) newest.set(key, s)
    }
    mine = [...newest.values()]
  }
  const list = mine.slice(0, 16).map(strip)
  const failure = failures.filter(own).sort((a, b) => b.at - a.at)[0]
  return { ...(list.length > 0 ? { samples: list } : {}), ...(failure ? { failure: strip(failure) } : {}) }
}

// Personal-server authorization (user decision, S01 §1): every saved credential natively listed by this
// server is visible to its clients. Nothing from the request widens or narrows that set. `passive` names the
// integrations measured from the user's own turns (Claude, E02, with its option on): flagged in the DTO, and their
// data is shown only there and only while the inventory still has one signed-in profile to attribute it to.
// `usage` is the usage freshness of the location instance answering (seconds), which the DTO carries for its TUI.
// `stored` is the readPreferences() result a caller already holds; without it the preferences are read here.
export async function readServer(ctx, readers = new Map(), passive = new Set(), usage = USAGE_FRESHNESS, stored) {
  const revision = shared.revision
  stored ??= await readPreferences(ctx)
  const preferences = stored.state === "available"
    ? { state: "available", revision: stored.value.revision, mode: stored.value.mode, threshold: stored.value.threshold, minimums: stored.value.minimums }
    : { state: stored.state }
  let listed
  try {
    listed = (await ctx.integration.list())?.data
  } catch {
    listed = undefined
  }
  const base = { revision, scope, usageFreshnessSeconds: usageFreshness(usage), preferences }
  if (!Array.isArray(listed)) return { snapshot: { ...inventorySnapshot(), schema: 2, ...base }, native: new Map() }
  const kept = []
  for (const info of listed) {
    if (!integrations.has(info?.id) || !Array.isArray(info.connections)) continue
    const saved = info.connections.filter((row) => row?.type === "credential" && isRef(row.id))
    if (saved.length === 0 && !info.connections.some(row => row?.type === "env")) continue
    kept.push({ info, saved })
  }
  // The active connection of every listed integration, asked at once; one that cannot be read does not hold the others.
  const actives = await Promise.all(kept.map(async ({ info }) => {
    try {
      return (await ctx.integration.connection.active(info.id)) ?? null
    } catch {
      return { type: "unreadable" }
    }
  }))
  const reads = []
  const native = new Map()
  for (const [i, { info, saved }] of kept.entries()) {
    reads.push({ integrationID: info.id, connections: info.connections, active: actives[i] })
    native.set(info.id, saved)
  }
  const inventory = inventorySnapshot(reads)
  // None, several or a login waiting for a sign-in: nothing left to attribute Claude's data to.
  if (passive.has(CLAUDE) && !soleRow(loginsOf(listed))) forgetClaude()
  const order = stored.state === "available" ? stored.value.order : {}
  inventory.integrations = inventory.integrations.map((item) => {
    const ids = reconcile(order[item.id], item.connections.map((c) => c.id))
    const connections = ids.map((id) => item.connections.find((c) => c.id === id))
    const manual = readers.get(item.id)?.manual === true ? { manual: true } : {}
    const flag = passive.has(item.id) ? { passive: true } : {}
    const shown = item.id !== CLAUDE || passive.has(CLAUDE)
    return { ...item, refreshable: readers.has(item.id), ...manual, ...flag,
      connections: connections.map((c) => ({ ...c, ...(shown ? measured(item.id, c.id) : {}) })) }
  })
  return { snapshot: bounded({ ...inventory, schema: 2, ...base }), native }
}

async function refresh(ctx, readers, input, call, now) {
  const unknown = () => call.error("not_found", "Unknown account reference.", {})
  // An explicit Refresh says so with `manual: true`; the reads started by opening the view never do.
  const { manual, ...reference } = input !== null && typeof input === "object" ? input : {}
  if (!isAccountReference(reference) || (manual !== undefined && manual !== true)) return unknown()
  const { integrationID, connectionID } = reference
  const { snapshot, native } = await readServer(ctx, readers)
  const shown = snapshot.integrations
    .find((item) => item.id === integrationID)
    ?.connections.find((item) => item.id === connectionID)
  const row = shown ? native.get(integrationID)?.find((item) => item.id === connectionID) : undefined
  if (!row) return unknown()
  const reader = readers.get(integrationID)
  // A manual reader answers only an explicit Refresh. A reader bound to one login does not read a connection that
  // waits for a sign-in: the native state already says Reconnect required. Active or not makes no difference.
  if (!reader || (reader.manual && manual !== true) || (reader.bound && shown.reconnectRequired)) {
    return { revision: snapshot.revision, status: "unsupported" }
  }
  const status = await schedule(ctx, reader, integrationID, row, now)
  return { revision: status === "deferred" ? snapshot.revision : shared.revision, status }
}

// One read of one connection through the shared scheduler: shared while in flight (same connection and source),
// deferred while a failure's wait runs, at most `maxReads` at once for the server, never retried by itself.
// Resolves to "read", "failed" or "deferred" and never rejects, so callers that ask for several accounts at once
// get one answer per account and one failure cannot cancel the others.
// `until` is the instant after which a route decision no longer wants this read; a user, the view or anyone else that
// leaves it out wants it whatever the time. A read that waited past every requester's deadline resolves "expired"
// without starting, recording a failure or a retry wait.
function schedule(ctx, reader, integrationID, row, now, until = Infinity) {
  const connectionID = row.id
  const ref = { integrationID, connectionID, source: reader.source }
  const key = JSON.stringify([integrationID, connectionID, reader.source])
  let run = shared.inflight.get(key)
  if (run) shared.until.set(key, Math.max(shared.until.get(key) ?? -Infinity, until))
  if (!run) {
    const last = shared.cache.list().failures.find((f) => JSON.stringify([f.integrationID, f.connectionID, f.source]) === key)
    if (last?.retryAt > now()) return Promise.resolve("deferred")
    const { signal } = shared.stop
    // The reader gets this connection and a resolver bound to it, never the active one by default. A reader bound
    // to one login (`bound`) gets the row as listed when its turn comes: one removed, replaced or signed out while
    // it waited in the queue is not resolved and nothing is sent for it.
    run = limited(signal, async () => {
      const live = reader.bound ? await liveRow(ctx, integrationID, connectionID, row.method) : row
      if (!live) throw { reason: "changed" }
      const result = await reader.read({ ctx, connection: live, resolve: () => ctx.integration.connection.resolve(live), signal })
      // The answer belongs to the reference it was asked for, never to whichever account is active when it
      // arrives. The reader already checked that the same login (method and account) is still behind the
      // reference; here the reference itself must still be listed the same way. Another account becoming active
      // meanwhile changes neither, so its reading stays with it.
      if (reader.bound && !signal.aborted && !(await liveRow(ctx, integrationID, connectionID, row.method))) throw { reason: "changed" }
      return result
    }, () => now() < (shared.until.get(key) ?? Infinity))
      .then(async (result) => {
        if (signal.aborted) return "failed"
        // One sample or several (one per window), recorded together or not at all.
        const samples = [result].flat().map((sample) => ({ ...sample, ...ref }))
        // A reader that may answer "no data" (Claude /usage without plan rows): what was held for it is withdrawn.
        if (samples.length === 0 && reader.empty === true && Array.isArray(result)) {
          if (integrationID === CLAUDE) forgetClaude()
          shared.failuresInRow.delete(key)
          return "read"
        }
        if (samples.length === 0 ||!samples.every(validSample) || !samples.map((s) => shared.cache.record(s)).every(Boolean)) {
          throw { reason: "invalid" }
        }
        shared.failuresInRow.delete(key)
        return "read"
      })
      .catch((error) => {
        if (signal.aborted) return "failed"
        if (error?.expired === true) return "expired"
        const failures = (shared.failuresInRow.get(key) ?? 0) + 1
        shared.failuresInRow.set(key, failures)
        const at = now()
        const wait = Math.min(maxWait, Math.max(Number.isFinite(error?.retryAfter) ? error.retryAfter : 0, backoff(failures)))
        shared.cache.fail(ref, at, typeof error?.reason === "string" ? error.reason : "unknown", at + wait)
        return "failed"
      })
      .finally(() => {
        if (shared.inflight.get(key) === run) {
          shared.inflight.delete(key)
          shared.until.delete(key)
        }
        invalidate()
      })
    shared.inflight.set(key, run)
    shared.until.set(key, until)
  }
  // Someone who still wants the data (a user's Refresh that arrived just as an expired decision's queued read gave up)
  // asks again: it gets a read of its own, never the decision's "expired".
  return run.then((status) => (status === "expired" && now() < until ? schedule(ctx, reader, integrationID, row, now, until) : status))
}

async function savePreferences(ctx, input, call) {
  return exclusive(async () => {
    const unavailable = () => call.error("unavailable", "Preferences are unavailable.", {})
    const stored = await readPreferences(ctx)
    if (stored.state !== "available") return unavailable()
    const { snapshot } = await readServer(ctx, undefined, undefined, undefined, stored)
    if (snapshot.inventory !== "available") return unavailable()
    const next = proposal(input, stored.value, snapshot.integrations)
    if (next.error === "conflict") return call.error("conflict", "Preferences changed. Reload before saving.", {})
    if (next.error) return call.error("invalid", "Invalid preferences.", {})
    await ctx.storage.set(KEY, next.value)
    invalidate()
    return { revision: next.value.revision }
  })
}

async function readRouting(ctx) {
  try {
    return parseRouting(await ctx.storage.get(ROUTING_KEY))
  } catch {
    return { state: "unavailable" }
  }
}

// Same single writer as the priorities, under its own key and revision: saving one never rewrites the other.
async function saveRouting(ctx, input, call) {
  return exclusive(async () => {
    const unavailable = () => call.error("unavailable", "Route order is unavailable.", {})
    const stored = await readRouting(ctx)
    if (stored.state !== "available") return unavailable()
    const { snapshot } = await readServer(ctx)
    if (snapshot.inventory !== "available") return unavailable()
    const next = routingProposal(input, stored.value, snapshot.integrations)
    if (next.error === "conflict") return call.error("conflict", "Route order changed. Reload before saving.", {})
    if (next.error) return call.error("invalid", "Invalid route order.", {})
    await ctx.storage.set(ROUTING_KEY, next.value)
    invalidate()
    return { revision: next.value.revision }
  })
}

// What a client may see of a decision: statuses, reasons and row indexes. No account data, no samples.
const short = (text) => text.slice(0, 120)
const decisionView = (d) => ({
  at: d.at, kind: d.kind, reads: d.reads,
  ...(d.target !== undefined ? { target: d.target } : {}), ...(d.reason ? { reason: short(d.reason) } : {}),
  ...(d.trigger ? { trigger: short(d.trigger) } : {}), ...(d.manual ? { manual: true } : {}),
  rows: d.rows.slice(0, 64).map((r) => ({ status: r.status, ...(r.reason ? { reason: short(r.reason) } : {}) })),
})

async function routingView(ctx, input) {
  const stored = await readRouting(ctx)
  const base = stored.state === "available"
    ? { state: "available", revision: stored.value.revision, targets: stored.value.targets }
    : { state: stored.state }
  const sessionID = input?.sessionID
  const state = isRef(sessionID) ? shared.routing.sessions.get(sessionID) : undefined
  if (!state) return { ...base, ...(isRef(sessionID) ? { session: { mode: "off", paid: false } } : {}) }
  return { ...base, session: { mode: state.mode, paid: state.paid, ...(state.decision ? { decision: decisionView(state.decision) } : {}) } }
}

// Only a root session this server can read. `preview` watches the session's own turn ends; there is no automatic mode
// in this build. Turning a session off cancels its pending decision; a read it started may still feed the cache.
// The session keeps the usage freshness (`usage`, seconds), readers and passive integrations of the location instance
// that set its mode: the TUI asks the session's own location, so its decisions use that location's options whichever
// instance receives the turn end.
async function setSessionRouting(ctx, input, call, usage, readers, passive) {
  const invalid = () => call.error("invalid", "Invalid routing mode.", {})
  if (!input || typeof input !== "object" || Object.keys(input).length !== 3 || !isRef(input.sessionID) ||
    !["off", "preview"].includes(input.mode) || typeof input.paid !== "boolean") return invalid()
  let info
  try {
    info = await ctx.session.get({ sessionID: input.sessionID })
  } catch {
    info = undefined
  }
  if (!info || info.parentID !== undefined) return call.error("not_found", "Unknown session.", {})
  const sessions = shared.routing.sessions
  const prior = sessions.get(input.sessionID)
  if (prior) prior.generation += 1
  if (input.mode === "off") sessions.delete(input.sessionID)
  else {
    if (info.model) rememberModel(input.sessionID, info.model)
    sessions.set(input.sessionID, { mode: input.mode, paid: input.paid, location: info.location, freshness: usageFreshness(usage),
      readers, passive, generation: prior?.generation ?? 0, decision: prior?.decision })
    while (sessions.size > keepDecisions) sessions.delete(sessions.keys().next().value)
  }
  invalidate()
  return { mode: input.mode, paid: input.mode === "off" ? false : input.paid }
}

// Credential events per integration (an integration update names none, so it counts for all of them).
const credentialEpoch = (integrationID) => (shared.epochs.get(integrationID) ?? 0) + (shared.epochs.get("*") ?? 0)
function noteCredential(event) {
  const id = event?.type === "integration.updated" ? "*" : event?.data?.integrationID
  if (isRef(id)) shared.epochs.set(id, (shared.epochs.get(id) ?? 0) + 1)
}

// The host's model reference, never a prompt or a message. A failed turn may not start a step.
function rememberModel(sessionID, model) {
  if (!isRef(sessionID)) return
  const models = shared.routing.models
  models.delete(sessionID)
  if (!isRef(model?.providerID) || !isRef(model?.id)) return
  models.set(sessionID, { providerID: model.providerID, modelID: model.id, ...(isRef(model.variant) ? { variant: model.variant } : {}) })
  while (models.size > keepDecisions) models.delete(models.keys().next().value)
}

// One decision per (session, turn end), whichever location instance received it first. A new turn, a model selected
// meanwhile, turning the session off, the deadline or the plugin unloading abandon it: its result is then dropped.
// Each loop evaluates the current data again; it stops at the first destination or when no allowed read is left.
async function decideTurn(ctx, readers, passive, event, now) {
  const sessionID = event?.data?.sessionID
  const state = isRef(sessionID) ? shared.routing.sessions.get(sessionID) : undefined
  if (!state || !isRef(event.id)) return
  const key = JSON.stringify([sessionID, event.id])
  if (shared.routing.seen.includes(key)) return
  shared.routing.seen.push(key)
  if (shared.routing.seen.length > keepDecisions) shared.routing.seen.shift()
  const generation = ++state.generation
  const deadline = now() + decisionMs
  const { signal } = shared.stop
  const current = () => !signal.aborted && shared.routing.sessions.get(sessionID) === state && state.generation === generation && now() < deadline
  // A Claude step end being attributed for this session finishes first, within the deadline; nothing else is awaited.
  const check = shared.routing.checks.get(sessionID)
  if (check) {
    let timer
    await Promise.race([check.catch(() => {}), new Promise((resolve) => (timer = setTimeout(resolve, Math.max(0, deadline - now()))))])
    clearTimeout(timer)
  }
  // The session's own location decides how long data stays fresh and which readers and passive data count, not the
  // first instance to receive the event.
  const ttl = freshness(state.freshness)
  readers = state.readers ?? readers
  passive = state.passive ?? passive
  const visited = new Set()
  const discarded = new Set()
  const budget = { ...decisionBudget }
  const readable = new Set([...readers].filter(([, reader]) => !reader.manual).map(([id]) => id))
  let reads = 0
  let decision
  let catalog
  for (;;) {
    if (!current()) return
    const { snapshot, native } = await readServer(ctx, readers, passive)
    const routing = await readRouting(ctx)
    if (!current()) return
    if (snapshot.inventory !== "available" || snapshot.preferences.state !== "available" || routing.state !== "available") {
      decision = { kind: "keep", reason: "Preferences unavailable", rows: [] }
      break
    }
    const selection = shared.routing.models.get(sessionID)
    const targets = routing.value.targets
    if (catalog === undefined && state.location && targets.some((t) => !t.modelID && t.variant && t.providerID === selection?.providerID && t.variant !== selection.variant)) {
      // All locations receive turn events; check a floating model's effort in the watched session's own catalog.
      try { catalog = (await ctx.model.list({ location: state.location })).data ?? [] } catch { catalog = [] }
      if (!current()) return
    }
    decision = decideRoute({
      selection, targets, catalog, integrations: snapshot.integrations,
      threshold: snapshot.preferences.threshold, minimums: snapshot.preferences.minimums, now: now(), readable, visited, discarded,
      budget, paid: state.paid, ttl,
    })
    if (decision.kind !== "needRead") break
    const { integrationID, connectionID, purpose } = decision.read
    const row = native.get(integrationID)?.find((item) => item.id === connectionID)
    const reader = readers.get(integrationID)
    visited.add(JSON.stringify([integrationID, connectionID]))
    budget[purpose] -= 1
    if (!row || !reader || reader.manual) continue
    reads += 1
    const epoch = credentialEpoch(integrationID)
    const status = await schedule(ctx, reader, integrationID, row, now, deadline)
    // A reader not bound to one login (DeepSeek) is checked here: a key replaced (same ID, credential event meanwhile)
    // or removed during the read does not lend its balance to the reference.
    if (status === "read" && !reader.bound &&
      (credentialEpoch(integrationID) !== epoch || !(await liveRow(ctx, integrationID, connectionID, row.method)))) {
      discarded.add(JSON.stringify([integrationID, connectionID]))
      shared.cache.forget(integrationID, connectionID)
    }
  }
  if (!current()) return
  state.decision = { ...decision, at: now(), reads }
  invalidate()
}

// `experimental` readers exist only when the user sets the plugin option `experimentalCodexUsage: true` (E06); they
// are off by default and nothing else turns them on. Claude's passive usage (E02) exists only with the plugin option
// `experimentalClaudeUsage: true`: then, and only then, the server also listens to the step events of the user's own
// turns, and the manual `claude` reader (Claude Code `/usage`, explicit `r` or `a`) is offered. `usageFreshnessSeconds`
// (rules.js: 1–3600, else 150) sets how long ChatGPT and Claude Code usage stays fresh for this location. `system`
// ({ env, home }) stands in for the process environment and home folder in node tests.
export function createPlugin({ contract, readers = {}, experimental = {}, claude: claudeReader, now = Date.now, system }) {
  return {
    id: "account-quota",
    async setup(ctx) {
      const enabled = ctx.options?.experimentalCodexUsage === true
      const claude = ctx.options?.experimentalClaudeUsage === true
      // Per location instance, never in `shared`: it travels in this instance's snapshot (view, notices, Route order
      // preview) and with the sessions this instance sets to watch (coordinator).
      const usage = usageFreshness(ctx.options?.usageFreshnessSeconds)
      const passive = new Set(claude ? [CLAUDE] : [])
      const byIntegration = new Map(Object.entries({ ...readers, ...(enabled ? experimental : {}),
        ...(claude && claudeReader ? { [CLAUDE]: claudeReader } : {}) }))
      const registration = await ctx.rpc.register(contract, {
        snapshot: async () => {
          if (claude && shared.routing.checks.size > 0) {
            let timer
            await Promise.race([Promise.allSettled([...shared.routing.checks.values()]),
              new Promise((resolve) => (timer = setTimeout(resolve, attributionMs)))])
            clearTimeout(timer)
          }
          return (await readServer(ctx, byIntegration, passive, usage)).snapshot
        },
        refresh: async (input, call) => refresh(ctx, byIntegration, input, call, now),
        savePreferences: async (input, call) => savePreferences(ctx, input, call),
        routingView: async (input) => routingView(ctx, input),
        saveRouting: async (input, call) => saveRouting(ctx, input, call),
        setSessionRouting: async (input, call) => setSessionRouting(ctx, input, call, usage, byIntegration, passive),
      })
      // Another project may keep these sessions alive when this location reloads its plugin options.
      for (const state of shared.routing.sessions.values()) {
        if (!ctx.location?.directory || state.location?.directory !== ctx.location.directory) continue
        state.readers = byIntegration
        state.passive = passive
        if (state.freshness !== usage) {
          state.freshness = usage
          state.generation++
        }
      }
      const emit = (revision) => {
        registration.events.emit("changed", { revision }).catch(() => {})
      }
      shared.emitters.add(emit)
      const stop = new AbortController()
      void (async () => {
        for await (const event of ctx.event.subscribe({ types: nativeEvents, signal: stop.signal })) {
          noteCredential(event)
          if (claude && invalidates(event)) forgetClaude()
          invalidate()
        }
      })().catch(() => {})
      if (claude) {
        // A separate subscription: if the host refused these event types, the native ones above still work.
        const observe = createTurns({ state: shared.claude, cache: shared.cache, now, system })
        void (async () => {
          for await (const event of ctx.event.subscribe({ types: STEP_EVENTS, signal: stop.signal })) {
            // Another location instance already attributes this event: its check must not be replaced by an empty one.
            if (shared.claude.seen.has(event?.id)) continue
            const check = observe(ctx, event).then((recorded) => recorded && invalidate(), () => {})
            // A route decision of this session waits for this attribution (and only this one) within its deadline.
            const sessionID = event?.data?.sessionID
            if (event?.type === "session.step.ended" && isRef(sessionID)) {
              shared.routing.checks.set(sessionID, check)
              void check.finally(() => shared.routing.checks.get(sessionID) === check && shared.routing.checks.delete(sessionID))
            }
          }
        })().catch(() => {})
      }
      // Route decisions (R4): only sessions set to `preview` are evaluated, at their own final turn results. A turn
      // that starts or a model selected meanwhile abandons the pending decision. Its own subscription, so a host that
      // refuses these types leaves everything above working.
      void (async () => {
        for await (const event of ctx.event.subscribe({ types: ROUTE_EVENTS, signal: stop.signal })) {
          if (event.type === "session.step.started") rememberModel(event.data?.sessionID, event.data?.model)
          const state = shared.routing.sessions.get(event?.data?.sessionID)
          if (!state) continue
          if (event.type === "session.execution.started") state.generation += 1
          else if (TURN_END.has(event.type)) void decideTurn(ctx, byIntegration, passive, event, now).catch(() => {})
        }
      })().catch(() => {})
      void (async () => {
        for await (const event of ctx.event.subscribe({ types: SELECTED, signal: stop.signal })) {
          const state = shared.routing.sessions.get(event?.data?.sessionID)
          if (state) state.generation += 1
          rememberModel(event?.data?.sessionID, event?.data?.model)
        }
      })().catch(() => {})
      return async () => {
        stop.abort()
        shared.emitters.delete(emit)
        if (shared.emitters.size === 0) {
          // Last instance gone: cancel reads and forget measurements; only preferences outlive a reload.
          clearTimeout(shared.timer)
          shared.timer = undefined
          shared.stop.abort()
          shared.stop = new AbortController()
          // Reads still waiting for a slot settle now without starting; those in flight end with their signal.
          for (const start of shared.waiting.splice(0)) start()
          shared.inflight.clear()
          shared.until.clear()
          shared.failuresInRow.clear()
          shared.cache.clear()
          // Session modes, decisions and the models seen go too: a reload keeps only the stored preferences.
          shared.routing = createRouting()
          // Step ends still being checked record nothing.
          shared.claude.generation += 1
          shared.claude.steps.clear()
          shared.claude.seen.clear()
        }
        await registration.dispose()
      }
    },
  }
}
