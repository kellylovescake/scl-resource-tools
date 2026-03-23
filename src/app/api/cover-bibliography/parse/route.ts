/**
 * src/app/api/cover-bibliography/parse/route.ts
 *
 * API route: parse staff export + fetch RSS feed + run strict merge.
 *
 * WHY THIS FILE EXISTS:
 * The cover bibliography requires both a staff export and an RSS feed,
 * both parsed and merged before the user can proceed. This route does
 * all three steps in one request so the UI stays simple.
 *
 * WHAT THIS DOES:
 * - Accepts POST with { text: string, rssUrl: string }
 * - Parses staff export text (via parseStaffExport)
 * - Fetches and parses the RSS feed (via parseRssFeed)
 * - Runs the strict merge (via mergeItems)
 * - On success:  returns { mergedItems, staffCount, rssCount }
 * - On merge failure: returns { mergeErrors, staffCount, rssCount } with 409
 * - On input/network error: returns { error: AppError }
 *
 * NOTE ON 409 vs 400:
 * Merge failures are distinct from bad input — both inputs were valid and
 * parsed, but they could not be merged. 409 (Conflict) signals this to the
 * client so it can render the structured MergeError display rather than
 * a generic error card.
 *
 * MARKER: STRICT MERGE RULES
 * Any merge failure blocks generation. See src/core/mergeItems.ts.
 *
 * SAFE TO EDIT:
 * - Error messages
 * - Add request logging for observability
 */

import { NextRequest, NextResponse } from "next/server";
import { parseStaffExport }          from "@/core/parseStaffExport";
import { parseRssFeed }              from "@/core/parseRssFeed";
import { mergeItems }                from "@/core/mergeItems";
import type { AppError }             from "@/types";

// ── POST /api/cover-bibliography/parse ────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Parse request body ───────────────────────────────────────────────────────
  let body: { text?: unknown; rssUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, {
      category: "input_format",
      message:  "Request body could not be read.",
      action:   "Try again.",
    });
  }

  const rawText  = typeof body.text   === "string" ? body.text.trim()   : "";
  const rssUrl   = typeof body.rssUrl === "string" ? body.rssUrl.trim() : "";

  if (!rawText) {
    return errorResponse(400, {
      category: "input_format",
      message:  "Please paste your staff export text.",
      action:   "Copy your staff export from the ILS and paste it into the text box.",
    });
  }

  if (!rssUrl) {
    return errorResponse(400, {
      category: "input_format",
      message:  "Please enter the RSS URL for this list.",
      action:   "In the ILS, go to your list, find the RSS link, and paste the URL here.",
    });
  }

  // Basic URL sanity check
  try {
    const url = new URL(rssUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return errorResponse(400, {
      category: "input_format",
      message:  "The RSS URL does not look valid.",
      action:   "It should start with https:// — copy it directly from the ILS list page.",
    });
  }

  // ── Parse staff export and fetch RSS concurrently ─────────────────────────────
  let staffParseResult;
  let rssParseResult;

  try {
    [staffParseResult, rssParseResult] = await Promise.all([
      Promise.resolve(parseStaffExport(rawText)),
      parseRssFeed(rssUrl),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not fetch the RSS feed.";
    // Network errors are always RSS-related (staff parse is synchronous)
    return errorResponse(500, {
      category: "external_service",
      message,
      action:   "Check that the RSS URL is correct and the ILS is reachable, then try again.",
    });
  }

  if (staffParseResult.items.length === 0) {
    return errorResponse(400, {
      category: "input_format",
      message:  "No items could be parsed from the staff export.",
      action:   "Make sure you copied the full staff export from the ILS. Each item should be on its own line.",
    });
  }

  // ── Run the strict merge ───────────────────────────────────────────────────────
  const mergeResult = mergeItems(staffParseResult.items, rssParseResult.items);

  if (!mergeResult.success) {
    // Merge failed — return structured MergeErrors so the UI can show them
    // specifically. 409 Conflict signals "both inputs were valid but incompatible".
    return NextResponse.json(
      {
        mergeErrors: mergeResult.errors,
        staffCount:  mergeResult.staffCount,
        rssCount:    mergeResult.rssCount,
        // TEMPORARY DEBUG — remove after diagnosing merge failure
        _debug: {
          parserVersion: "v5-debug",
          firstStaffItem: staffParseResult.items[0] ?? null,
        },
      },
      { status: 409 },
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      mergedItems: mergeResult.mergedItems,
      staffCount:  mergeResult.staffCount,
      rssCount:    mergeResult.rssCount,
    },
    { status: 200 },
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function errorResponse(status: number, error: AppError) {
  return NextResponse.json({ error }, { status });
}
