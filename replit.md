# GrowEasy AI CSV Importer

An AI-powered CSV importer that intelligently extracts CRM lead information from any CSV format and maps it to GrowEasy CRM fields using OpenAI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/groweasy-importer run dev` — run the frontend (port auto-assigned)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Required Secrets

- `OPENAI_API_KEY` — OpenAI API key for AI field extraction (set via Replit Secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, framer-motion, shadcn/ui, dark mode via next-themes
- API: Express 5
- AI: OpenAI gpt-4o-mini (batch processing with retry logic)
- CSV Parsing: PapaParse (backend)
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `artifacts/groweasy-importer/src/` — React frontend
- `artifacts/api-server/src/routes/csv.ts` — CSV parse + AI import routes
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas

## Product

A 4-step CSV importer:
1. **Upload** — Drag & drop or file picker, reads file as text in-browser
2. **Preview** — Parses via backend `/api/csv/parse`, shows responsive table with sticky headers
3. **Confirm** — Sends rows to `/api/csv/import`, AI extracts CRM fields in batches of 15
4. **Results** — Shows imported records and skipped records with summary stats

### CRM Fields Extracted
`created_at`, `name`, `email`, `country_code`, `mobile_without_country_code`, `company`, `city`, `state`, `country`, `lead_owner`, `crm_status`, `crm_note`, `data_source`, `possession_time`, `description`

### AI Rules
- `crm_status` must be: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, `SALE_DONE`
- `data_source` must be: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, `sarjapur_plots`
- Records without email AND mobile are skipped
- Multiple emails/phones → first in field, rest appended to `crm_note`
- Batch size: 15 rows per OpenAI call, 3 retries with exponential backoff

## Architecture decisions

- CSV is read as text in-browser (`file.text()`), sent as JSON to backend — avoids multipart/form-data TypeScript issues with Orval codegen
- OpenAI called with `response_format: { type: "json_object" }` for reliable JSON parsing
- Backend handles both array and wrapped-object AI responses gracefully
- Body limit raised to 50mb to handle large CSV files
- No database needed — stateless design per assignment spec

## User preferences

_Populate as needed._

## Gotchas

- The `multipart/form-data` + `format: binary` in OpenAPI spec causes Orval TS2308 collisions — use JSON body for file contents instead
- OpenAI `gpt-4o-mini` with `response_format: json_object` may wrap arrays in an object — the route handles this
- Run `pnpm --filter @workspace/api-spec run codegen` after any `openapi.yaml` change

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
