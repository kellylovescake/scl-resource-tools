/**
 * src/app/api/isbn-blooper/route.ts
 *
 * API route handler for the ISBN Blooper feature.
 *
 * WHY THIS FILE EXISTS:
 * Next.js App Router uses files named route.ts inside /api/ directories as
 * server-side request handlers. This is the thin server layer between the
 * Blooper UI and the core engine — it receives a POST with an ISBN, calls
 * lookupIsbn(), and returns the result as JSON.
 *
 * WHAT THIS DOES NOT DO:
 * - No business logic (all of that is in src/core/isbnService.ts)
 * - No ISBN parsing or validation beyond checking the input exists
 *   (isbnService.ts handles real validation and throws on bad input)
 *
 * MARKER: ENGINE ENTRY (ISBN Blooper)
 * This is where the web UI connects to the ISBN Blooper engine.
 * The engine entry point is: src/core/isbnService.ts → lookupIsbn()
 *
 * MARKER: ISBN SERVICE PROVIDER
 * lookupIsbn() uses direct HTTP calls to Syndetics / Open Library / Google Books.
 * To switch to the MCP connector for an AI wrapper, update isbnService.ts —
 * this route handler does not change.
 *
 * ERROR HANDLING:
 * - Empty input → 400 with input_format error
 * - Invalid ISBN (thrown by lookupIsbn) → 400 with input_format error
 * - Service errors (network failures etc.) → 500 with external_service error
 * - All errors are product-shaped (message + action), never raw stack traces
 *
 * SAFE TO EDIT:
 * - Error messages and HTTP status codes
 * - Add rate limiting here if needed for public deployment
 * - Add request logging here for observability
 *
 * MARKER: FUTURE AUTH CONFIG
 * No authentication in V1. If auth is added, check session/token here
 * before calling lookupIsbn().
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupIsbn } from "@/core/isbnService";
import type { AppError } from "@/types";

// ── POST /api/isbn-blooper ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Parse request body ───────────────────────────────────────────────────────
  let body: { isbn?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, {
      category: "input_format",
      message:  "Request body could not be read.",
      action:   "Try again.",
    });
  }

  const rawIsbn = typeof body.isbn === "string" ? body.isbn.trim() : "";

  // ── Basic surface validation (empty check only — real validation in engine) ──
  if (!rawIsbn) {
    return errorResponse(400, {
      category: "input_format",
      message:  "Please enter an ISBN.",
      action:   "Type or paste a 10 or 13 digit ISBN and try again.",
    });
  }

  // ── Call the engine ──────────────────────────────────────────────────────────
  try {
    const result = await lookupIsbn(rawIsbn, true);
    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    // lookupIsbn throws for invalid ISBNs (input_format errors)
    // and may throw for network/service failures (external_service errors)
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";

    // Classify: invalid ISBN errors contain "not a valid ISBN" in the message
    const isInputError = message.toLowerCase().includes("not a valid isbn") ||
                         message.toLowerCase().includes("isbn");

    return errorResponse(
      isInputError ? 400 : 500,
      {
        category: isInputError ? "input_format" : "external_service",
        message,
        action: isInputError
          ? "Check the ISBN and try again. ISBNs are 10 or 13 digits."
          : "The metadata service may be temporarily unavailable. Try again in a moment.",
      }
    );
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function errorResponse(status: number, error: AppError) {
  return NextResponse.json({ error }, { status });
}
