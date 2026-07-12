# OpenAPI specification for all API endpoints

**Labels:** `documentation` `backend` `good first issue` `help wanted`

## Context

The backend has 25+ REST endpoints across 4 route files but no formal API specification:

| Route file | Prefix | Endpoints |
|---|---|---|
| `src/routes/vault.routes.ts` | `/api/v1/vault` | 12 (GET/POST for stats, deposits, withdrawals, harvests, previews) |
| `src/routes/route.routes.ts` | `/api/v1/routes` | 5 (quote, execute, list) |
| `src/routes/pool.routes.ts` | `/api/v1/pools` | 4 (list, get, register, deregister) |
| `src/routes/oracle.routes.ts` | `/api/v1/oracle` | 4 (prices, history, submit) |

Without a spec, frontend developers must read controller source code to understand request/response shapes. Zod validators in the route files (e.g. `DepositSchema`, `QuoteSchema`) already define the contracts but are not exposed as a discoverable API doc.

An OpenAPI 3.1 YAML file would enable auto-generated interactive docs (Swagger UI), client SDK generation (openapi-typescript, orval), and contract-first frontend development where types are derived from the spec.

## What done looks like

- [ ] An `openapi.yaml` file at the repo root covering all 25+ endpoints across all 4 route groups
- [ ] Each endpoint documents method, path, parameters, request body schema, and response schema
- [ ] Schemas match the existing Zod validators in the route files and controller response shapes
- [ ] File is valid OpenAPI 3.1 — passes `swagger-cli validate openapi.yaml`
- [ ] Swagger UI is served at `GET /api-docs` via `swagger-ui-express` (add dependency)
- [ ] CI or a npm script runs the validation step so the spec stays in sync

## Suggested approach

Start with vault routes (Zod schemas map directly to `requestBody` objects), then work through each route file. Add `swagger-ui-express` mounted at `/api-docs` and a `"validate:api"` npm script.
