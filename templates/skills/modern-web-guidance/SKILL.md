---
name: modern-web-guidance
description: Find browser-compatible HTML, CSS and client-side JavaScript patterns for native controls, responsive layouts, accessibility and web performance. Use when implementing or modernizing web platform behavior.
license: Apache-2.0; upstream guides are CC-BY-4.0. See UPSTREAM.md.
---

# Modern Web Guidance

Local adaptation of GoogleChrome's skill. Use the installed `modern-web-guidance`
command from the project directory. The guides and search index ship with the
CLI. Use this same command for cross-references in guides that suggest `npx`.

1. **Search for the capability.** Use 2–5 English words describing one UI
   pattern or browser feature, without project, file or framework names:
   `modern-web-guidance search "light dismiss dialog"`. Match the descriptions.
   If none fit, rephrase once or run `modern-web-guidance list`.
2. **Retrieve the matching guide:** `modern-web-guidance retrieve "dialog"`.
   Use IDs returned by the search; separate multiple IDs with commas. If the
   CLI prints a temporary Markdown path for a long guide, read that file.
3. **Apply and check.** Adapt the pattern to the project's framework. Follow
   its browser targets and the guide's Baseline and fallback advice. Respect
   `.mwgrc`: don't enable experimental features or bypass a blocked guide.
   Check the resulting behavior and cite the guide ID when it informed a decision.

For an explicitly requested broad modernization, run
`modern-web-guidance legacy-scan <project-subdirectory> --json`. Check findings
against the guide's keep/drop criteria; a deliberate fallback may still match.
For a specific feature, start with `search` instead.
