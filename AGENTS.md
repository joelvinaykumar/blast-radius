<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Blast Radius — Agent Instructions

## What this project is

Blast Radius is a single-page tool that ingests TypeScript/React repositories into a Neo4j graph and lets users query **blast radius**, **shared dependencies**, **affected pages**, and export an **AI-ready prompt**. It runs on Next.js App Router (React 19, TypeScript strict).

## Tech stack

- **Framework:** Next.js App Router (v16+), React 19, TypeScript (strict)
- **Styling:** Tailwind CSS v4 (utility-first, no component library)
- **State/data fetching:** @tanstack/react-query (mutations + polling)
- **Graph visualization:** reactflow
- **Validation:** zod (shared schemas for API request/response)
- **Database:** Neo4j / CognoDB (bolt protocol via `neo4j-driver`)
- **Parsing:** ts-morph (AST analysis), simple-git (cloning)
- **Scripts:** tsx (TypeScript script runner)

## Key conventions

- All API routes live under `app/api/*/route.ts` and export `runtime = "nodejs"`.
- Zod schemas and derived TypeScript types live in `lib/api-types.ts` — always define schemas there first, then use inferred types everywhere.
- The Neo4j driver is a singleton in `lib/cognodb.ts`; use `withNeo4jSession()` for all DB access.
- Cypher queries are parameterized and defined in `lib/queries.ts`.
- The frontend is a single `"use client"` tree rooted at `app/blast-radius-client.tsx`.
- UI components are extracted under `app/components/blast-radius/` with typed props and callback-based communication (no prop drilling of mutations).
- Shared utilities (icons, helpers, graph mappers) live in `app/components/blast-radius/shared.tsx`.
- Environment variables use `COGNODB_*` naming with `NEO4J_*` fallbacks (see `.env.example`).

## Design constraints

Read `docs/design.md` for UI/UX design constraints, layout rules, and visual consistency requirements. Always follow those rules when making frontend changes.

## File layout

```
app/                          # Next.js App Router
  blast-radius-client.tsx     # Root client component (state orchestrator)
  components/blast-radius/    # Extracted UI subcomponents
  api/                        # Route handlers
lib/                          # Shared server utilities
worker/                       # Background job manager
scripts/                      # CLI tools
docs/                         # Documentation (API spec, design, graph model)
```

## Rules for agents

1. **Lint must pass** — run `npm run lint` (ESLint) after every change.
2. **No synchronous setState in effects** — the ESLint config enforces `react-hooks/set-state-in-effect`. Use derived state or guard with early returns.
3. **Use native HTML semantics** — prefer `<dialog>` for modals, `<details>` for disclosure, semantic elements over generic divs.
4. **Keep components small** — if a component exceeds ~200 lines, extract subcomponents.
5. **Type everything** — no `any`. Use `React.JSX.Element` for return types, not bare `JSX.Element`.
6. **Respect the OpenAPI spec** — when adding/changing API endpoints, update `docs/api/openapi.yaml` and `docs/api/test-flow.md`.
7. **Graph model docs** — `docs/graph-model.md` documents the current and proposed graph schemas. Consult before changing Cypher queries.
