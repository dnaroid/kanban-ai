# indexer MCP Quick Guide

**HARD POLICY: use indexer MCP FIRST!** If a task needs codebase discovery, run an indexer MCP function before
any other search.

**IMPORTANT**: Indexer is a **direct MCP server** (not through skills). Call tools directly by name.

## How to call indexer MCP functions

Indexer MCP tools are available directly in your environment. Call them by name:

**context_pack** - Main tool for task-specific context (bugfix/refactor/feature/onboarding)
**search_code** - Semantic/lexical code search using embeddings
**code_nav** - Unified code navigation (usages/implementations/dependencies)

Examples:
- `context_pack(taskDescription="fix authentication bug", preset="bugfix")`
- `search_code(query="session manager", mode="semantic", limit=8, includeDocs=false)`
- `code_nav(mode="usages", symbol="AuthService")`
- `code_nav(mode="deps", path="src/auth.ts", depth=2)`

## When this applies

- "where/find/how" questions inside this repo
- bugfix/refactor/feature work touching existing code
- discovering patterns, call sites, dependencies, entrypoints

## Mandatory gate

Before `grep`/`glob`/`find`/LSP/`explore`, run at least one:

- `context_pack` (preferred for task-specific context)
- `search_code` (for finding specific code patterns)
- `code_nav` (for navigation/dependencies)

## Token-Safe Defaults

Use these defaults unless the task explicitly needs broader context:

- `search_code`: `limit=8`, `includeDocs=false`, omit `includeContext`, add `pathPrefix` when known
- `context_pack`: set `preset`, keep `includeSummaries="none"`, keep `includeArchitecture/includeHotspots` disabled
- `code_nav`: keep `depth=1` and only raise `limit` for proven misses

## Key Parameters

**context_pack**:
- `taskDescription` (required): clear task description
- `preset`: "bugfix", "refactor", "feature", "onboarding"
- `maxFiles`: limit files in pack (default varies by preset)
- `maxTokens`: adaptive by default (`low=14000`, `medium=26000`, `high=42000`)
- `pathPrefix`: focus on specific directory
- `includeTests`: include test files (default false)
- `includeArchitecture`: include architecture snapshot (default false)
- `includeHotspots`: include code hotspots analysis (default false)
- `includeSummaries`: "none"|"selected"|"aggressive" (default "none")

**search_code**:
- `query` (required): 2-8 keywords/identifiers (NOT full sentences)
- `limit`: max results (default `8`, max `30`)
- `mode`: "semantic" (default), "lexical", or "hybrid"
- `pathPrefix`: filter by path (e.g. "src/auth")
- `languageIds`: filter by language (e.g. ["typescript", "tsx"])
- `entityTypes`: filter by symbol type (e.g. ["function", "class"])
- `includeDocs`: include documentation files in search results (default `false`)
- `includeContext`: "none"|"minimal"|"full" - expand context around results (±5 lines for minimal, ±20 for full, default none)
- `contextMaxCharacters`: cap per-result context size (default `1200` for minimal, `4000` for full)

**code_nav**:
- `mode` (required): "usages" | "implementations" | "deps" | "reverse_deps"
- `symbol`: symbol name (required for usages/implementations modes)
- `path`: file/directory path (required for deps/reverse_deps modes)
- `depth`: max traversal depth for dependencies (default 1)
- `limit`: max results (default 500 for deps)

## Exceptions (narrow)

1. User provides exact file path, task strictly within that file
2. Task not about this repo (external docs/explanation)

If exception applies, state which one and proceed with minimal fallback.

## Fallback (only after Indexer attempt)

1. Refine `search_code` (shorter query, add `pathPrefix`, keep `limit` low)
2. Use `code_nav` with different modes (usages/implementations/deps)
3. Try `context_pack` with different preset or pathPrefix
4. Use `grep`/`glob` only if MCP unavailable or clearly stale
