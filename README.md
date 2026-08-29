# Blast Radius

Ingest a TypeScript/React repository into a Neo4j graph, then query **blast radius**, **shared dependencies**, **affected pages**, and export an **AI-ready prompt** — all from a single-page UI.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Next.js App Router (React 19 + TypeScript)      │
│                                                  │
│  ┌──────────┐  ┌──────────────────────────────┐  │
│  │ Frontend │  │ API Route Handlers (Node)    │  │
│  │ React    │  │                              │  │
│  │ Query +  │──│  POST /api/repos             │  │
│  │ React    │  │  GET  /api/repos             │  │
│  │ Flow     │  │  DELETE /api/repos            │  │
│  │          │  │  GET  /api/jobs/{id}          │  │
│  │          │  │  POST /api/blast-radius       │  │
│  │          │  │  POST /api/shared-deps        │  │
│  │          │  │  POST /api/affected-pages     │  │
│  │          │  │  GET  /api/symbol-search      │  │
│  └──────────┘  └──────────┬───────────────────┘  │
│                           │                      │
│               ┌───────────▼───────────┐          │
│               │ In-memory Job Manager │          │
│               │ (clone → parse → write)│         │
│               └───────────┬───────────┘          │
│                           │                      │
└───────────────────────────┼──────────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Neo4j / CognoDB │
                   │  (graph store)   │
                   └─────────────────┘
```

### Key layers

| Layer | Files | Purpose |
|-------|-------|---------|
| **Data** | `lib/cognodb.ts`, `lib/queries.ts`, `lib/api-types.ts` | Driver singleton, Cypher queries, Zod schemas |
| **Ingest** | `lib/ingest-pipeline.ts` | Clone repo → parse with ts-morph → write graph |
| **Jobs** | `worker/job-manager.ts` | In-memory background job lifecycle with retention pruning |
| **API** | `app/api/*/route.ts` | REST endpoints (route handlers) |
| **UI** | `app/blast-radius-client.tsx`, `app/components/blast-radius/*` | React Query + React Flow + tabbed results |
| **Docs** | `docs/api/openapi.yaml`, `docs/api/test-flow.md` | OpenAPI 3.1 spec + ordered test guide |

## Prerequisites

- **Node.js** ≥ 20
- **Neo4j** or **CognoDB** instance (bolt or bolt+s)

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Neo4j/CognoDB credentials

# 3. Verify database connectivity
npm run check:neo4j

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the UI.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COGNODB_URI` | ✅ | Bolt connection URI (`bolt://`, `bolt+s://`, `neo4j://`, `neo4j+s://`) |
| `COGNODB_PASSWORD` | ✅ | Database password |
| `COGNODB_USER` | — | Database user (defaults to `neo4j`) |
| `COGNODB_DATABASE` | — | Database name (defaults to `neo4j`) |
| `INGEST_CLONE_DIR` | — | Temp directory for cloned repos (defaults to OS temp) |
| `MAX_REPO_SIZE_MB` | — | Maximum repo size guard in MB (defaults to `200`) |

> Legacy `NEO4J_URI` / `NEO4J_PASSWORD` / `NEO4J_USER` env vars are also accepted as fallbacks.

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run check:neo4j` | Test Neo4j/CognoDB connectivity |
| `npm run ingest:repo` | CLI-based repository ingest (for scripting) |
| `npm run test:job` | Run job lifecycle smoke test |

## API endpoints

All endpoints are documented in the [OpenAPI spec](docs/api/openapi.yaml) and served interactively at `/api-docs`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/repos` | Create ingestion job |
| `GET` | `/api/repos` | List ingested repositories |
| `DELETE` | `/api/repos?repoId=…` | Delete repository graph data |
| `GET` | `/api/jobs/{id}` | Poll job status |
| `POST` | `/api/blast-radius` | Query blast radius for a symbol |
| `POST` | `/api/shared-deps` | Find shared dependencies between symbols |
| `POST` | `/api/affected-pages` | Find affected pages from changed files |
| `GET` | `/api/symbol-search?repoId=…&query=…` | Search symbols (max 5 results) |

See [docs/api/test-flow.md](docs/api/test-flow.md) for the exact end-to-end test order.

## Project structure

```
app/
  blast-radius-client.tsx     # Main client component (orchestrator)
  components/blast-radius/    # Extracted UI components
    shared.tsx                # Icons, utils, graph mappers
    repos-section.tsx         # Repository grid with actions
    repo-intake-dialog.tsx    # Native <dialog> for repo intake
    query-controls-panel.tsx  # Query inputs with symbol search
    results-panel.tsx         # Tabbed results (graph/shared/affected/prompt)
  api/
    repos/route.ts            # POST/GET/DELETE
    jobs/[id]/route.ts        # GET
    blast-radius/route.ts     # POST
    shared-deps/route.ts      # POST
    affected-pages/route.ts   # POST
    symbol-search/route.ts    # GET
    openapi/route.ts          # Raw YAML spec
  api-docs/route.ts           # Swagger UI page
lib/
  api-types.ts                # Zod schemas and TypeScript types
  cognodb.ts                  # Neo4j driver singleton + session helper
  queries.ts                  # Parameterized Cypher queries
  ingest-pipeline.ts          # Clone → parse → write pipeline
worker/
  job-manager.ts              # In-memory job lifecycle manager
scripts/
  check-neo4j.ts              # Connectivity smoke test
  ingest-repo.ts              # CLI ingest wrapper
  test-job-lifecycle.ts       # Job lifecycle test
docs/
  api/openapi.yaml            # OpenAPI 3.1 spec
  api/test-flow.md            # Ordered API test guide
  api/README.md               # API docs index
  graph-model.md              # Graph schema + proposed improvements
```

## Deployment

### Self-hosted (Node.js)

```bash
npm run build
npm run start
```

Requires a reachable Neo4j/CognoDB instance. Set environment variables accordingly.

### Docker (example)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json .
COPY --from=builder /app/public public
EXPOSE 3000
CMD ["npm", "start"]
```

### Vercel

Works with Vercel's Node.js runtime. Add environment variables in the Vercel dashboard. Note: the in-memory job manager state is ephemeral and will not persist across serverless invocations — consider a persistent queue (e.g. Redis, SQS) for production use.

## License

Private project.
