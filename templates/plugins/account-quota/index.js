import { createUsageReader } from "./claude.js"
import { createCodexReader } from "./codex.js"
import { createDeepseekReader } from "./deepseek.js"
import { contract } from "./rpc.js"
import { createPlugin } from "./server.js"

// Shipped server entry. Readers are fixed in code by their tasks; none is configurable at runtime. The Codex legacy
// reader is experimental and exists only with the plugin option `experimentalCodexUsage: true` (off by default).
// Claude's passive usage (server.js, claude.js) and its manual `/usage` reader exist only with
// `experimentalClaudeUsage: true` (off by default).
export default createPlugin({ contract, readers: { deepseek: createDeepseekReader() }, experimental: { openai: createCodexReader() },
  claude: createUsageReader() })
