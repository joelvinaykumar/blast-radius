# Blast Radius API Test Flow

This is the exact order to test APIs so each step has the data needed by the next one.

## Preconditions

1. Neo4j/Cognodb is reachable.
2. `.env` is configured (`COGNODB_URI`, `COGNODB_USER`, `COGNODB_PASSWORD`, optional `COGNODB_DATABASE`).
3. Dev server is running (`npm run dev`).

## Ordered test sequence

### 1) Health pre-check (recommended)

```bash
npm run check:neo4j
```

Expect success before API tests.

### 2) Check existing dumped repos (fast path)

```bash
curl http://localhost:3000/api/repos?limit=20
```

- If target repo/branch already exists, reuse `repoId` from this list and jump to step 5.
- If not found, continue to step 3.

### 3) Create ingestion job

```bash
curl -X POST http://localhost:3000/api/repos \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"file:///absolute/path/to/repo"}'
```

- Expect: `202` with `jobId` and initial `status=queued`.
- Save `jobId`.

### 4) Poll job until terminal state

```bash
curl http://localhost:3000/api/jobs/{jobId}
```

- Poll every 0.5–1s.
- Expected progression: `queued → cloning → parsing → writing_graph → ready` (or `failed`).
- When `ready`, save `result.repoId`.

### 5) Search symbols

```bash
curl "http://localhost:3000/api/symbol-search?repoId={repoId}&query=page"
```

- Expect: `200` with up to 5 matching symbols.
- Use a `symbol` value from results in subsequent queries.

### 6) Blast radius query

```bash
curl -X POST http://localhost:3000/api/blast-radius \
  -H 'content-type: application/json' \
  -d '{"repoId":"{repoId}","symbol":"{repoId}:app/page.tsx#module","maxDepth":3}'
```

- Expect: `200` with `nodes`, `edges`, and impact counts.

### 7) Shared dependencies query

```bash
curl -X POST http://localhost:3000/api/shared-deps \
  -H 'content-type: application/json' \
  -d '{"repoId":"{repoId}","symbols":["{repoId}:app/page.tsx#module","{repoId}:app/layout.tsx#module"]}'
```

- Expect: `200` with `sharedDependencies[]`.

### 8) Affected pages query

```bash
curl -X POST http://localhost:3000/api/affected-pages \
  -H 'content-type: application/json' \
  -d '{"repoId":"{repoId}","changedFiles":["app/layout.tsx"]}'
```

- Expect: `200` with `pages[]`.

### 9) Delete repository (optional cleanup)

```bash
curl -X DELETE "http://localhost:3000/api/repos?repoId={repoId}"
```

- Expect: `200` with `{"success": true}`.
- Non-existent repoId returns `404`.

## Suggested happy-path assertions

1. `/api/repos` POST returns `202` and valid UUID `jobId`.
2. `/api/jobs/{id}` eventually returns `status=ready` and `result.repoId`.
3. `/api/symbol-search` returns ≤5 results matching the query.
4. `/api/blast-radius` returns arrays (non-empty for known symbols).
5. `/api/shared-deps` returns `sharedDependencies` with `consumerCount > 1`.
6. `/api/affected-pages` returns normalized `route`, `filePath`, and `reasons`.

## Common failure checks

- `400 Validation failed`: body schema mismatch.
- `404 Job not found`: stale or incorrect `jobId`.
- `500`: ingestion/parsing/Neo4j execution error; inspect response `error`.
