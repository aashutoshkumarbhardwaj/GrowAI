# GrowEasy AI CSV Importer

An AI-powered CSV importer web app that accepts any CSV format, previews the parsed data, and uses OpenAI to intelligently extract and map arbitrary columns into GrowEasy CRM lead records.

---

## Features

- **Universal CSV support** — works with any column naming convention; no template required
- **Live preview** — scrollable, sticky-header table shows raw rows before importing
- **AI-powered extraction** — GPT-4o-mini reads every row and maps values to CRM fields
- **Smart field mapping** — handles fuzzy column names ("Full Name", "Contact", "Client" → `name`), date normalization, multiple emails/phones
- **Batch processing with retry** — rows processed 15 at a time, 3 retries per batch with exponential backoff
- **Detailed results** — imported vs. skipped tabs, colored status badges, summary counts
- **Dark mode** — toggle between light and dark themes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TailwindCSS, shadcn/ui, framer-motion |
| Backend | Express 5, Node.js 24, TypeScript |
| AI | OpenAI `gpt-4o-mini` (JSON mode) |
| CSV Parsing | PapaParse |
| API Contract | OpenAPI 3.1 (Orval codegen → React Query hooks + Zod schemas) |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
.
├── artifacts/
│   ├── groweasy-importer/   # React + Vite frontend
│   └── api-server/          # Express API backend
└── lib/
    ├── api-spec/            # OpenAPI spec (source of truth)
    │   └── openapi.yaml
    ├── api-client-react/    # Generated React Query hooks (from spec)
    └── api-zod/             # Generated Zod schemas (from spec)
```

---

## Setup

### Prerequisites

- Node.js 20+
- pnpm 10+
- An OpenAI API key

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

Create a `.env` file in `artifacts/api-server/`:

```env
OPENAI_API_KEY=sk-...
SESSION_SECRET=any-random-string
```

Or, if running on Replit, add `OPENAI_API_KEY` via the Secrets panel.

### 3. Start the API server

```bash
pnpm --filter @workspace/api-server run dev
```

The API server starts on port `8080` by default (or the `PORT` env var).

### 4. Start the frontend

```bash
pnpm --filter @workspace/groweasy-importer run dev
```

Open the URL shown in the terminal (or the Replit preview pane).

---

## API Reference

### `POST /api/csv/parse`

Parses a CSV string and returns columns and rows.

**Request body:**
```json
{
  "csvText": "Name,Email,Phone\nJohn Doe,john@example.com,+1-555-0100"
}
```

**Response:**
```json
{
  "columns": ["Name", "Email", "Phone"],
  "rows": [{ "Name": "John Doe", "Email": "john@example.com", "Phone": "+1-555-0100" }],
  "totalRows": 1
}
```

---

### `POST /api/csv/import`

Sends parsed rows through OpenAI to extract CRM fields.

**Request body:**
```json
{
  "rows": [{ "Name": "John Doe", "Email": "john@example.com" }],
  "columns": ["Name", "Email"]
}
```

**Response:**
```json
{
  "records": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "crm_status": "GOOD_LEAD_FOLLOW_UP",
      ...
    }
  ],
  "imported": 1,
  "skipped": 0,
  "total": 1
}
```

---

## CRM Field Mapping

The AI extracts the following fields from each row:

| Field | Type | Notes |
|---|---|---|
| `created_at` | string | ISO date, normalized from any date format |
| `name` | string | Full name |
| `email` | string | Primary email; extras go to `crm_note` |
| `country_code` | string | e.g. `+91` |
| `mobile_without_country_code` | string | Primary phone without country code |
| `company` | string | |
| `city` | string | |
| `state` | string | |
| `country` | string | |
| `lead_owner` | string | |
| `crm_status` | enum | See values below |
| `crm_note` | string | Extra info, overflow emails/phones |
| `data_source` | enum | See values below |
| `possession_time` | string | |
| `description` | string | |

### `crm_status` values
`GOOD_LEAD_FOLLOW_UP` · `DID_NOT_CONNECT` · `BAD_LEAD` · `SALE_DONE`

### `data_source` values
`leads_on_demand` · `meridian_tower` · `eden_park` · `varah_swamy` · `sarjapur_plots`

**Skip rule:** Records with neither a valid email nor a mobile number are skipped.

---

## Development

### Regenerate API client after spec changes

```bash
pnpm --filter @workspace/api-spec run codegen
```

### Typecheck all packages

```bash
pnpm run typecheck
```

### Build all packages

```bash
pnpm run build
```

---

## Known Limitations

- Large CSVs (thousands of rows) will take longer due to OpenAI rate limits and batch processing
- `OPENAI_API_KEY` must be set or the import step returns a 500 error
- AI field extraction quality depends on the clarity of source column names; very ambiguous CSVs may produce less accurate mappings
