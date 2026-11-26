import { Rpc } from "@opencode/plugin/rpc"
import { isAccountReference, isRecord } from "./inventory.js"
import { validTarget } from "./preferences.js"
import { MAX_USAGE_FRESHNESS } from "./rules.js"

// Shared by the server and the TUI. The host validates shapes only; server.js repeats every check that
// grants access, because a schema is not a permission (S08).
const count = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
const ref = { type: "string", minLength: 1, maxLength: 200 }
const time = { type: "number" }
const amount = { type: "string", minLength: 1, maxLength: 40 }
const none = { type: "object", properties: {}, additionalProperties: false }
// 2.3.2 normalizes extra JSON Schema properties away. Validate the original RPC input instead.
const exactInput = (valid) => ({
  "~standard": { version: 1, vendor: "account-quota", validate: value =>
    valid(value) ? { value } : { issues: [{ message: "Invalid account request." }] } },
})
// An account reference, plus `manual: true` when the user asked for this read (a manual reader needs it).
const isRefresh = (value) => {
  const { manual, ...reference } = isRecord(value) ? value : {}
  return isAccountReference(reference) && (manual === undefined || manual === true)
}
const isProposal = (value) => isRecord(value) && Object.keys(value).length === 4 &&
  ["revision", "threshold", "minimums", "order"].every((key) => Object.hasOwn(value, key)) &&
  Number.isSafeInteger(value.revision) && Number.isInteger(value.threshold) && isRecord(value.minimums) && isRecord(value.order)

// Route order (rotation plan R1, R4): a complete list with the revision it was based on; a session mode with nothing
// else (never a URL, credential, command or model to switch to).
const isRouting = (value) => isRecord(value) && Object.keys(value).length === 2 && Number.isSafeInteger(value.revision) &&
  Array.isArray(value.targets) && value.targets.length <= 64 && value.targets.every(validTarget)
const isSessionMode = (value) => isRecord(value) && Object.keys(value).length === 3 && typeof value.sessionID === "string" &&
  value.sessionID !== "" && value.sessionID.length <= 200 && ["off", "preview"].includes(value.mode) && typeof value.paid === "boolean"
const isRoutingQuery = (value) => isRecord(value) && (Object.keys(value).length === 0 ||
  (Object.keys(value).length === 1 && typeof value.sessionID === "string" && value.sessionID !== "" && value.sessionID.length <= 200))

const target = {
  type: "object",
  additionalProperties: false,
  required: ["integrationID", "providerID", "binding"],
  properties: { integrationID: ref, providerID: ref, modelID: ref, variant: ref, binding: { enum: ["current", "exact"] }, connectionID: ref },
}
const reason = { type: "string", maxLength: 120 }
const decision = {
  type: "object",
  additionalProperties: false,
  required: ["at", "kind", "reads", "rows"],
  properties: {
    at: time,
    kind: { enum: ["keep", "suggest", "noTarget", "needRead"] },
    reads: count,
    target: count,
    reason,
    trigger: reason,
    manual: { enum: [true] },
    rows: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object", additionalProperties: false, required: ["status"],
        properties: { status: { enum: ["origin", "eligible", "skipped", "pending", "not-checked"] }, reason },
      },
    },
  },
}

const sample = {
  type: "object",
  additionalProperties: false,
  required: ["source", "window", "scope", "observedAt"],
  properties: {
    source: ref,
    window: ref,
    scope: ref,
    observedAt: time,
    resetsAt: time,
    used: { type: "number", minimum: 0, maximum: 100 },
    available: { type: "boolean" },
    balances: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["currency", "total"],
        properties: { currency: { type: "string", minLength: 3, maxLength: 3 }, total: amount },
      },
    },
  },
}

const failure = {
  type: "object",
  additionalProperties: false,
  required: ["source", "at", "reason"],
  properties: {
    source: ref,
    at: time,
    reason: { enum: ["auth", "balance", "rate-limit", "timeout", "network", "redirect", "too-large", "invalid", "http", "login", "changed",
      "profile", "missing", "exit", "busy", "model", "unknown"] },
    retryAt: time,
  },
}

const connection = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "method", "active"],
  properties: {
    id: ref,
    label: { type: "string", maxLength: 200 },
    method: { enum: ["key", "oauth", "external"] },
    active: { type: "boolean" },
    reconnectRequired: { enum: [true] },
    samples: { type: "array", maxItems: 16, items: sample },
    failure,
  },
}

const integration = {
  type: "object",
  additionalProperties: false,
  required: ["id", "active", "refreshable", "connections"],
  properties: {
    id: ref,
    active: { enum: ["connection", "environment", "none", "unknown"] },
    refreshable: { type: "boolean" },
    // Read only on an explicit Refresh (r or a), never when the view opens.
    manual: { enum: [true] },
    // Can also receive usage from the user's own Claude Code turns (experimental E02).
    passive: { enum: [true] },
    // Priority order: the stored order reconciled with the native inventory (B04).
    connections: { type: "array", maxItems: 64, items: connection },
  },
}

const preferences = {
  type: "object",
  additionalProperties: false,
  required: ["state"],
  properties: {
    state: { enum: ["available", "unsupported", "unavailable"] },
    revision: count,
    mode: { enum: ["recommend"] },
    threshold: { type: "integer", minimum: 90, maximum: 100 },
    // Explicit keys: 2.3.2 normalizes objects to their declared properties. S09 lists only CNY and USD.
    minimums: { type: "object", additionalProperties: false, properties: { USD: amount, CNY: amount } },
  },
}

export const contract = Rpc.define({
  id: "account-quota",
  methods: {
    snapshot: {
      input: exactInput(value => isRecord(value) && Object.keys(value).length === 0),
      output: {
        type: "object",
        additionalProperties: false,
        required: ["schema", "revision", "scope", "inventory", "preferences", "integrations"],
        properties: {
          schema: { enum: [2] },
          revision: count,
          // Recorded user decision: one trusted user, one personal server, shared inventory.
          scope: { enum: ["personal-server"] },
          // Seconds ChatGPT and Claude Code usage stays fresh for the location answering (plugin option
          // `usageFreshnessSeconds`). Declared so the host keeps it; a TUI without it uses the default.
          usageFreshnessSeconds: { type: "integer", minimum: 1, maximum: MAX_USAGE_FRESHNESS },
          inventory: { enum: ["available", "unavailable"] },
          preferences,
          integrations: { type: "array", maxItems: 64, items: integration },
        },
      },
    },
    refresh: {
      // Only a reference to pick from the server inventory; never a scope, URL or credential.
      input: exactInput(isRefresh),
      output: {
        type: "object",
        additionalProperties: false,
        required: ["revision", "status"],
        properties: { revision: count, status: { enum: ["read", "failed", "unsupported", "deferred"] } },
      },
      errors: { not_found: none },
    },
    savePreferences: {
      // A complete proposal with the revision it was based on. The server checks every reference.
      input: exactInput(isProposal),
      output: { type: "object", additionalProperties: false, required: ["revision"], properties: { revision: count } },
      errors: { conflict: none, invalid: none, unavailable: none },
    },
    // Read only: the stored route order and, for one session, its mode and last decision. Opening it reads nothing.
    routingView: {
      input: exactInput(isRoutingQuery),
      output: {
        type: "object",
        additionalProperties: false,
        required: ["state"],
        properties: {
          state: { enum: ["available", "unsupported", "unavailable"] },
          revision: count,
          targets: { type: "array", maxItems: 64, items: target },
          session: {
            type: "object",
            additionalProperties: false,
            required: ["mode", "paid"],
            properties: { mode: { enum: ["off", "preview"] }, paid: { type: "boolean" }, decision },
          },
        },
      },
    },
    // A complete route order with the revision it was based on (`routing.revision`, not the preferences' one).
    saveRouting: {
      input: exactInput(isRouting),
      output: { type: "object", additionalProperties: false, required: ["revision"], properties: { revision: count } },
      errors: { conflict: none, invalid: none, unavailable: none },
    },
    // In memory, per root session: `preview` evaluates its turn ends; there is no automatic mode in this build.
    setSessionRouting: {
      input: exactInput(isSessionMode),
      output: { type: "object", additionalProperties: false, required: ["mode", "paid"], properties: { mode: { enum: ["off", "preview"] }, paid: { type: "boolean" } } },
      errors: { invalid: none, not_found: none },
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["revision"],
        properties: { revision: count },
      },
    },
  },
})
