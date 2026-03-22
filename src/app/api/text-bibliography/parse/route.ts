/**
 * src/app/api/text-bibliography/parse/route.ts
 *
 * API route: parse raw staff export text into BibliographyItems.
 *
 * WHY THIS FILE EXISTS:
 * Parsing runs server-side so the client only sends text and receives
 * structured data. The actual parsing logic lives in src/core/parseStaffExport.ts.
 *
 * WHAT THIS DOES:
 * - Accepts a POST with { text: string }
 * - Calls parseStaffExport() from the core engine
 * - Returns { items, warnings } on success, { error } on failure
 *
 * NOTE: A successful parse with zero items is treated as a client error (400),
 * not a server error — the input was valid JSON but meaningless.
 *
 * SAFE TO EDIT:
 * - Error messages
 * - Add request logging for observability
 */

import { NextRequest, NextResponse } from "next/server";
import { parseStaffExport }          from "@/core/parseStaffExport";
import type { AppError }             from "@/types";

// ── POST /api/text-bibliography/parse ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Parse request body ───────────────────────────────────────────────────────
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, {
      category: "input_format",
      message:  "Request body could not be read.",
      action:   "Try again.",
    });
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  if (!rawText) {
    return errorResponse(400, {
      category: "input_format",
      message:  "Please paste some text to parse.",
      action:   "Copy your staff export from the ILS and paste it into the text box.",
    });
  }

  // ── Run the parser ────────────────────────────────────────────────────────────
  try {
    const result = parseStaffExport(rawText);

    if (result.items.length === 0) {
      return errorResponse(400, {
        category: "input_format",
        message:  "No items could be parsed from the text you entered.",
        action:   "Make sure you copied the full staff export from the ILS. Each item should be on its own line.",
      });
    }

    return NextResponse.json(
      { items: result.items, warnings: result.warnings },
      { status: 200 },
    );
  } catch (err) {
    return errorResponse(500, {
      category: "external_service",
      message:  err instanceof Error ? err.message : "Parsing failed unexpectedly.",
      action:   "Try again. If the problem persists, check that your text is a valid staff export.",
    });
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function errorResponse(status: number, error: AppError) {
  return NextResponse.json({ error }, { status });
}
