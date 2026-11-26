// Only the server supplies the inventory and visible references. No credential values enter the DTO.
const METHODS = new Set(["key", "oauth", "external"])

export const isRef = (value) => typeof value === "string" && value !== "" && value.length <= 200
export const refKey = (integrationID, connectionID) => JSON.stringify([integrationID, connectionID])
// A plain JSON-like object: not null and not an array.
export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
// Every saved credential the server lists natively is visible (personal-server authorization, S01 §1).
const listable = (row) => row?.type === "credential" && isRef(row.id) && typeof row.label === "string" && METHODS.has(row.method)

export const isAccountReference = (input) =>
  !!input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 2 &&
  Object.hasOwn(input, "integrationID") && Object.hasOwn(input, "connectionID") &&
  isRef(input.integrationID) && isRef(input.connectionID)

export function inventorySnapshot(connections) {
  if (!Array.isArray(connections)) {
    return { schema: 1, revision: 0, inventory: "unavailable", integrations: [] }
  }
  const reads = connections.filter((read) => isRef(read?.integrationID))
  const integrations = []
  for (const { integrationID, connections: listed, active: ref } of reads) {
    if (reads.filter((read) => read.integrationID === integrationID).length > 1) continue
    const rows = Array.isArray(listed) ? listed : []
    const visible = rows.filter(
      (row) =>
        listable(row) &&
        rows.filter((other) => other?.id === row.id).length === 1,
    )
    // An integration with no visible account is listed only when its environment key is the active one.
    if (visible.length === 0 && ref?.type !== "env") continue
    const activeID = ref?.type === "credential" && visible.some((row) => row.id === ref.id) ? ref.id : undefined
    integrations.push({
      id: integrationID,
      active: activeID !== undefined ? "connection" : ref == null ? "none" : ref.type === "env" ? "environment" : "unknown",
      connections: visible.map((row) => ({
        id: row.id, label: row.label, method: row.method, active: row.id === activeID,
        ...(row.status?.status === "needs_auth" ? { reconnectRequired: true } : {}),
      })),
    })
  }
  return { schema: 1, revision: 0, inventory: "available", integrations }
}
