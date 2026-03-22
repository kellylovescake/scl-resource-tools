/**
 * src/app/api/cover-bibliography/generate/route.ts
 *
 * API route: fetch cover images + generate cover bibliography DOCX.
 *
 * WHY THIS FILE EXISTS:
 * Cover image fetching must be server-side — it requires network access
 * to Syndetics, and the image bytes (Buffer) need to be passed directly
 * into buildDocx() without ever being sent to the client.
 *
 * WHAT THIS DOES:
 * - Accepts POST with { job: BibliographyJob } where items have coverUrl set
 * - Fetches cover images concurrently for all items that have a coverUrl
 * - Sets coverImageData (Buffer) and hasCover on each item
 * - Calls buildDocx() with the fully populated job
 * - Returns { docxBase64, jsonData, summary }
 *
 * MARKER: ENGINE ENTRY (Cover Bibliography)
 * Engine entry point: src/core/buildDocx.ts → buildDocx()
 * Cover fetch: src/core/isbnService.ts → fetchCoverBytes()
 *
 * COVER FETCHING STRATEGY:
 * All cover fetches run concurrently via Promise.all.
 * fetchCoverBytes() has an 8-second per-request timeout.
 * If a cover fetch fails or returns a placeholder, hasCover = false
 * and no image appears for that item — the document still generates.
 *
 * NOTE ON coverImageData SERIALIZATION:
 * Clients send items with coverUrl (string) but no coverImageData.
 * This route fetches the bytes server-side and never sends them back
 * to the client — only the DOCX (base64) is returned.
 *
 * SAFE TO EDIT:
 * - Error messages
 * - Add request logging
 * - Add per-item timeout override if needed
 *
 * MARKER: FUTURE AUTH CONFIG
 * No authentication in V1. If auth is added, check session here.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDocx }                 from "@/core/buildDocx";

// Vercel function timeout — cover generation fetches images over the network.
// Hobby plan caps this at 10s; Pro/Enterprise plans respect the full 60s.
// Setting it here future-proofs the route so upgrading the plan automatically
// gives more headroom without any code change.
export const maxDuration = 60;
import { fetchCoverBytes }           from "@/core/isbnService";
import type { BibliographyJob, BibliographyItem, AppError, ResultSummary } from "@/types";

// ── POST /api/cover-bibliography/generate ─────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { job?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, {
      category: "input_format",
      message:  "Request body could not be read.",
      action:   "Try again.",
    });
  }

  const job = body.job as BibliographyJob | undefined;

  // ── Validate ──────────────────────────────────────────────────────────────────
  if (!job || !Array.isArray(job.items) || job.items.length === 0) {
    return errorResponse(400, {
      category: "input_format",
      message:  "No items were provided.",
      action:   "Go back and make sure the merge completed successfully.",
    });
  }

  if (!job.meta?.title?.trim()) {
    return errorResponse(400, {
      category: "input_format",
      message:  "Document title is required.",
      action:   "Go back and enter a title for this bibliography.",
    });
  }

  if (!job.meta?.preparedBy?.trim()) {
    return errorResponse(400, {
      category: "input_format",
      message:  "\"Prepared by\" is required.",
      action:   "Go back and enter a name in the \"Prepared by\" field.",
    });
  }

  // ── Annotation completeness check (MARKER: ANNOTATION MODE) ───────────────────
  if (job.annotationMode === "manual") {
    const missing = job.items.filter(item => !item.annotation?.trim());
    if (missing.length > 0) {
      return errorResponse(400, {
        category: "workflow_rule",
        message:  `${missing.length} item${missing.length === 1 ? " is" : "s are"} missing an annotation.`,
        affects:  `${missing.length} of ${job.items.length} items`,
        action:   "All items must have an annotation, or turn off annotations and regenerate.",
      });
    }
  }

  // ── Fetch cover images concurrently ───────────────────────────────────────────
  // Items arrive from the client with coverUrl set (from the RSS merge).
  // We fetch the actual image bytes here, server-side, and attach them
  // to the items before passing to buildDocx.
  let itemsWithCovers: BibliographyItem[];
  try {
    itemsWithCovers = await Promise.all(
      job.items.map(async (item: BibliographyItem) => {
        if (!item.coverUrl) {
          return { ...item, hasCover: false, coverImageData: undefined };
        }
        const buffer = await fetchCoverBytes(item.coverUrl);
        return {
          ...item,
          coverImageData: buffer ?? undefined,
          hasCover:       buffer !== null,
        };
      })
    );
  } catch (err) {
    return errorResponse(500, {
      category: "external_service",
      message:  err instanceof Error ? err.message : "Cover image fetching failed.",
      action:   "Try again. If the problem persists, the cover image service may be temporarily unavailable.",
    });
  }

  // ── Build the final job with covers attached ────────────────────────────────
  const jobWithCovers: BibliographyJob = {
    ...job,
    items: itemsWithCovers,
  };

  // ── Generate DOCX ──────────────────────────────────────────────────────────
  try {
    const docxBuffer = await buildDocx(jobWithCovers);
    const docxBase64 = docxBuffer.toString("base64");

    // Tally cover results for the summary
    const itemsWithCoverCount    = itemsWithCovers.filter(i => i.hasCover).length;
    const itemsWithoutCoverCount = itemsWithCovers.length - itemsWithCoverCount;

    // Build JSON for the optional download — strip Buffer fields (not serializable)
    const jsonData = {
      meta:           job.meta,
      mode:           job.mode,
      annotationMode: job.annotationMode,
      items: itemsWithCovers.map(({ coverImageData: _omit, ...rest }) => rest),
      generatedAt:    new Date().toISOString(),
    };

    const summary: ResultSummary = {
      totalItems:           job.items.length,
      itemsWithCovers:      itemsWithCoverCount,
      itemsWithoutCovers:   itemsWithoutCoverCount,
      annotated:            job.annotationMode !== "none",
      mode:                 "Cover bibliography",
      documentTitle:        job.meta.title,
      warnings: itemsWithoutCoverCount > 0 ? [
        `${itemsWithoutCoverCount} item${itemsWithoutCoverCount === 1 ? "" : "s"} had no cover image and will appear without one.`,
      ] : undefined,
    };

    return NextResponse.json({ docxBase64, jsonData, summary }, { status: 200 });
  } catch (err) {
    return errorResponse(500, {
      category: "external_service",
      message:  err instanceof Error ? err.message : "Document generation failed.",
      action:   "Try again. If the problem persists, check the server logs.",
    });
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function errorResponse(status: number, error: AppError) {
  return NextResponse.json({ error }, { status });
}
