import { Router, type IRouter } from "express";
import Papa from "papaparse";
import OpenAI from "openai";
import {
  ParseCSVBody,
  ImportCSVBody,
  ParseCSVResponse,
  ImportCSVResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BATCH_SIZE = 15;

const CRM_FIELDS = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description",
];

const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
];

const DATA_SOURCE_VALUES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
];

function buildExtractionPrompt(
  columns: string[],
  rows: Record<string, string>[],
): string {
  return `You are a CRM data extraction engine for GrowEasy, a real estate CRM platform.

Your task: Map records from a CSV (which may have any column structure) into GrowEasy CRM format.

## CSV Column Headers
${columns.join(", ")}

## Records to Process (JSON)
${JSON.stringify(rows, null, 2)}

## GrowEasy CRM Fields to Extract
${CRM_FIELDS.join(", ")}

## Strict Rules

### Field Mapping
- Intelligently map ANY column name to the correct CRM field. Examples:
  - "Full Name", "Contact Name", "Client", "Person" → name
  - "Phone", "Mobile", "Cell", "Contact No", "Phone Number" → mobile_without_country_code
  - "Email Address", "Email ID", "E-mail" → email
  - "Organisation", "Organization", "Company Name", "Employer" → company
  - "Remarks", "Notes", "Comments", "Feedback" → crm_note
  - "Status", "Lead Status", "Stage", "Pipeline Stage" → crm_status
  - "Source", "Lead Source", "Origin", "Channel" → data_source
  - "Date", "Created Date", "Submission Date", "Entry Date" → created_at
  - "Country Code", "ISD", "Dial Code" → country_code
  - "City", "Location" → city
  - "State", "Province", "Region" → state

### crm_status
ONLY use one of: ${CRM_STATUS_VALUES.join(", ")}
Map similar values intelligently:
  - "Hot", "Interested", "Follow Up", "Warm", "Potential" → GOOD_LEAD_FOLLOW_UP
  - "No Response", "Not Reachable", "Busy", "Call Back", "Voicemail", "Not Picking" → DID_NOT_CONNECT
  - "Not Interested", "Closed Lost", "Dead", "Cold", "Rejected" → BAD_LEAD
  - "Won", "Closed Won", "Converted", "Deal Done", "Sold" → SALE_DONE
  - If none match confidently → null

### data_source
ONLY use one of: ${DATA_SOURCE_VALUES.join(", ")}
Map based on context clues in the data (project names, source names). If none match → null

### date format
created_at must be parseable by JavaScript's \`new Date()\`. Convert to ISO 8601 if needed.

### Multiple emails/phones
- If multiple emails: use the first in "email", append others to crm_note
- If multiple phones: use the first in "mobile_without_country_code", append others to crm_note

### mobile_without_country_code
Strip the country code prefix if present (e.g., "+91 9876543210" → "9876543210").

### Skip records
Set "_skip": true if the record has NEITHER an email NOR a mobile number. Otherwise "_skip": false.

### Line breaks
Escape any line breaks within field values as \\n to keep records single-line.

### Null fields
Use null for fields that cannot be extracted.

## Output Format
Return ONLY valid JSON — a JSON array of objects. Each object contains all CRM fields plus "_skip" (boolean).
No explanation, no markdown, no code blocks. Just the JSON array.

Example output:
[
  {
    "created_at": "2026-05-13T14:20:48",
    "name": "John Doe",
    "email": "john@example.com",
    "country_code": "+91",
    "mobile_without_country_code": "9876543210",
    "company": "GrowEasy",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "lead_owner": "test@gmail.com",
    "crm_status": "GOOD_LEAD_FOLLOW_UP",
    "crm_note": "Client asked to reschedule demo",
    "data_source": null,
    "possession_time": null,
    "description": null,
    "_skip": false
  }
]`;
}

async function processRowsWithAI(
  client: OpenAI,
  columns: string[],
  rows: Record<string, string>[],
): Promise<{ records: Record<string, string | null>[]; skipped: number }> {
  const allRecords: Record<string, string | null>[] = [];
  let totalSkipped = 0;

  // Process rows in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    logger.info(
      { batchNum, totalBatches, batchSize: batch.length },
      "Processing batch",
    );

    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        attempts++;
        const prompt = buildExtractionPrompt(columns, batch);

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 8192,
          messages: [
            {
              role: "system",
              content:
                "You are a precise data extraction engine. Always return valid JSON arrays only, with no additional text or formatting.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from AI");
        }

        // The response_format: json_object wraps arrays in an object
        // Try to parse as array directly, or extract from wrapper object
        let parsed: unknown;
        const rawContent = content.trim();

        try {
          parsed = JSON.parse(rawContent);
        } catch {
          throw new Error(`Invalid JSON from AI: ${rawContent.slice(0, 200)}`);
        }

        // Handle if AI returned { records: [...] } or { leads: [...] } or just [...]
        let records: unknown[];
        if (Array.isArray(parsed)) {
          records = parsed;
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          const arrayValue = Object.values(obj).find((v) => Array.isArray(v));
          if (arrayValue) {
            records = arrayValue as unknown[];
          } else {
            throw new Error(
              "AI returned object but no array found inside it",
            );
          }
        } else {
          throw new Error("AI returned unexpected format");
        }

        for (const record of records) {
          if (!record || typeof record !== "object") continue;
          const rec = record as Record<string, unknown>;
          const shouldSkip = rec["_skip"] === true;
          if (shouldSkip) {
            totalSkipped++;
            continue;
          }

          // Extract only CRM fields
          const crmRecord: Record<string, string | null> = {};
          for (const field of CRM_FIELDS) {
            const val = rec[field];
            crmRecord[field] =
              val === null || val === undefined ? null : String(val);
          }
          allRecords.push(crmRecord);
        }

        success = true;
      } catch (err) {
        logger.warn(
          { err, attempt: attempts, batchNum },
          "AI batch attempt failed",
        );
        if (attempts >= maxAttempts) {
          logger.error(
            { err, batchNum },
            "All retry attempts exhausted for batch",
          );
          // Skip entire batch on repeated failure rather than crashing
          totalSkipped += batch.length;
        } else {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)),
          );
        }
      }
    }
  }

  return { records: allRecords, skipped: totalSkipped };
}

// POST /csv/parse
router.post("/csv/parse", async (req, res): Promise<void> => {
  const parsed = ParseCSVBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { csvText } = parsed.data;

  if (!csvText || csvText.trim().length === 0) {
    res.status(400).json({ error: "CSV text is empty" });
    return;
  }

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors && result.errors.length > 0) {
    const criticalErrors = result.errors.filter(
      (e) => e.type === "Delimiter" || e.type === "Quotes",
    );
    if (criticalErrors.length > 0) {
      res.status(400).json({
        error: `Invalid CSV format: ${criticalErrors[0]?.message}`,
      });
      return;
    }
    req.log.warn(
      { errors: result.errors.slice(0, 3) },
      "Non-critical CSV parse warnings",
    );
  }

  const columns = result.meta.fields ?? [];
  const rows = result.data as Record<string, string>[];

  const response = ParseCSVResponse.parse({
    columns,
    rows,
    totalRows: rows.length,
  });

  res.json(response);
});

// POST /csv/import
router.post("/csv/import", async (req, res): Promise<void> => {
  const parsed = ImportCSVBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { rows, columns } = parsed.data;

  if (!rows || rows.length === 0) {
    res.status(400).json({ error: "No rows provided for import" });
    return;
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    res.status(500).json({
      error:
        "OPENAI_API_KEY is not configured. Please add it as a secret in the Replit environment.",
    });
    return;
  }

  const openai = new OpenAI({ apiKey });

  req.log.info({ rowCount: rows.length }, "Starting AI CSV import");

  // Cast rows to the expected type
  const typedRows = rows as Record<string, string>[];

  const { records, skipped } = await processRowsWithAI(
    openai,
    columns,
    typedRows,
  );

  const total = rows.length;
  const imported = records.length;

  req.log.info({ total, imported, skipped }, "AI CSV import complete");

  const response = ImportCSVResponse.parse({
    records,
    imported,
    skipped,
    total,
  });

  res.json(response);
});

export default router;
