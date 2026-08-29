# API Documentation Index

- `openapi.yaml` — Swagger/OpenAPI 3.1 spec for all endpoints.
- `test-flow.md` — exact end-to-end API validation order.

## Served documentation routes

- `/api/openapi` — serves the raw OpenAPI YAML spec.
- `/api-docs` — serves Swagger UI for interactive API exploration.

## Endpoint groups

### Ingestion Jobs
- `POST /api/repos` — create ingestion job
- `GET  /api/repos` — list ingested repositories
- `DELETE /api/repos?repoId=…` — delete repository graph data
- `GET  /api/jobs/{id}` — poll job status

### Graph Queries
- `POST /api/blast-radius` — query blast radius for a symbol
- `POST /api/shared-deps` — find shared dependencies between symbols
- `POST /api/affected-pages` — find affected pages from changed files
- `GET  /api/symbol-search?repoId=…&query=…` — search symbols (max 5 results)
