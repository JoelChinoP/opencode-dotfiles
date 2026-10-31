const sessionID = { type: "string", minLength: 1 };
const state = {
  type: "object",
  properties: { sessionID, mode: { type: "string", enum: ["lite", "full", "ultra", "off"] } },
  required: ["sessionID", "mode"],
  additionalProperties: false,
};

export const Ponytail = {
  id: "ponytail",
  methods: {
    get: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: state,
    },
    set: {
      input: {
        type: "object",
        properties: { sessionID, mode: { type: "string" } },
        required: ["sessionID", "mode"],
        additionalProperties: false,
      },
      output: state,
    },
  },
  events: { updated: { schema: state } },
};
