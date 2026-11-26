// Preferences (B04; S01 §§4–5, 9–10): the only data this plugin persists. Schema-versioned order of opaque
// references per integration, threshold, optional minimum balance per currency and the fixed Recommend mode.
// Never measurements, tokens, profile paths, messages, proposals or redemption IDs.
import { isRef } from "./inventory.js"
import { isDecimal, validThreshold } from "./rules.js"

export const KEY = "preferences"
// New preferences only (nothing stored yet): a USD 0.20 low-balance notice and no CNY minimum, by user
// decision. A stored record is used as it is, including `minimums: {}` (notice off); loading never writes.
const DEFAULTS = Object.freeze({ schema: 1, revision: 0, mode: "recommend", threshold: 95, order: Object.freeze({}), minimums: Object.freeze({ USD: "0.20" }) })
const MAX = 64

// Stricter than inventory.js's isRecord (a plain Object prototype): for what is stored and for proposals.
const isMap = (value) => !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const exactKeys = (value, keys) => isMap(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const validOrder = (order) => isMap(order) && Object.keys(order).length <= MAX && Object.entries(order).every(([id, list]) =>
  isRef(id) && Array.isArray(list) && list.length <= MAX && list.every(isRef) && new Set(list).size === list.length)
// DeepSeek reports CNY and USD (S09); a minimum compares only within its own currency. An absent currency is
// "off", which is not the same as "0".
const validMinimums = (minimums) => isMap(minimums) &&
  Object.entries(minimums).every(([currency, amount]) => (currency === "USD" || currency === "CNY") && isDecimal(amount) && !amount.startsWith("-"))

const valid = (value) => exactKeys(value, Object.keys(DEFAULTS)) && value.schema === 1 && Number.isSafeInteger(value.revision) &&
  value.revision >= 0 && value.mode === "recommend" && validThreshold(value.threshold) && validOrder(value.order) && validMinimums(value.minimums)

// Nothing stored yet means defaults. An unknown schema or a damaged value is reported and never overwritten.
export function parseStored(value) {
  if (value === undefined || value === null) return { state: "available", value: DEFAULTS }
  return valid(value) ? { state: "available", value } : { state: "unsupported" }
}

// Derived view, never written back: renamed or reconnect-required connections keep their place, entries absent
// from a successful native list are retired, and connections that are really new go last.
export function reconcile(saved = [], ids) {
  return [...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))]
}

// Validates a complete proposal against the current inventory of this server. Returns the value to store, or
// an error type: "invalid" for anything malformed or outside the inventory.
export function proposal(input, current, inventory) {
  if (!exactKeys(input, ["revision", "threshold", "minimums", "order"])) return { error: "invalid" }
  const { revision, threshold, minimums, order } = input
  if (!Number.isSafeInteger(revision) || !validThreshold(threshold) || !validMinimums(minimums) || !validOrder(order)) return { error: "invalid" }
  for (const [integrationID, ids] of Object.entries(order)) {
    const listed = inventory.find((item) => item.id === integrationID)?.connections.map((c) => c.id)
    if (!listed || !ids.every((id) => listed.includes(id))) return { error: "invalid" }
  }
  if (revision !== current.revision) return { error: "conflict" }
  return { value: { schema: 1, revision: current.revision + 1, mode: "recommend", threshold, order, minimums } }
}

// Route order (rotation plan R1): a separate key, so a TUI that only knows `preferences` keeps saving priorities
// without touching it. Only opaque references and their order: never measurements, decisions or session state. Empty
// by default; loading never writes. A row is one destination, not an alias: `binding: "current"` means "with the
// account active natively for that provider", `binding: "exact"` names one saved connection.
export const ROUTING_KEY = "routingPreferences"
const ROUTING_DEFAULTS = Object.freeze({ schema: 1, revision: 0, targets: Object.freeze([]) })
const TARGET = ["integrationID", "providerID", "binding"]

export function validTarget(t) {
  if (!isMap(t)) return false
  const extra = Object.keys(t).filter((key) => !TARGET.includes(key))
  if (!TARGET.every((key) => Object.hasOwn(t, key)) || !extra.every((key) => ["modelID", "variant", "connectionID"].includes(key) && isRef(t[key]))) return false
  if (!isRef(t.integrationID)) return false
  // OpenCode names a provider and its integration with the same ID for every integration this plugin knows.
  if (t.providerID !== t.integrationID) return false
  if (t.binding === "current") return t.connectionID === undefined
  return t.binding === "exact" && isRef(t.connectionID)
}

export const targetKey = (t) => JSON.stringify([t.integrationID, t.providerID, t.modelID, t.variant ?? null, t.binding, t.connectionID ?? null])
const validTargets = (targets) => Array.isArray(targets) && targets.length <= MAX && targets.every(validTarget) &&
  new Set(targets.map(targetKey)).size === targets.length
const validRouting = (value) => exactKeys(value, ["schema", "revision", "targets"]) && value.schema === 1 &&
  Number.isSafeInteger(value.revision) && value.revision >= 0 && validTargets(value.targets)

// A future schema or a damaged value is read-only: reported, never overwritten.
export function parseRouting(value) {
  if (value === undefined || value === null) return { state: "available", value: ROUTING_DEFAULTS }
  return validRouting(value) ? { state: "available", value } : { state: "unsupported" }
}

// A complete proposal `{ revision, targets }` checked against this server's inventory: the integration must be listed
// and an exact connection must be one of its saved connections. Saving enables nothing and reads nothing.
export function routingProposal(input, current, inventory) {
  if (!exactKeys(input, ["revision", "targets"]) || !Number.isSafeInteger(input.revision) || !validTargets(input.targets)) return { error: "invalid" }
  for (const t of input.targets) {
    const integration = inventory.find((item) => item.id === t.integrationID)
    if (!integration) return { error: "invalid" }
    if (t.binding === "exact" && !integration.connections.some((c) => c.id === t.connectionID)) return { error: "invalid" }
  }
  if (input.revision !== current.revision) return { error: "conflict" }
  const targets = input.targets.map(({ integrationID, providerID, modelID, variant, binding, connectionID }) => ({
    integrationID, providerID, ...(modelID ? { modelID } : {}), ...(variant ? { variant } : {}), binding, ...(connectionID ? { connectionID } : {}),
  }))
  return { value: { schema: 1, revision: current.revision + 1, targets } }
}
