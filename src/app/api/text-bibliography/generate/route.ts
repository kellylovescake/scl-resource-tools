/**
 * src/app/api/text-bibliography/generate/route.ts
 *
 * API route: generate a text bibliography DOCX from a BibliographyJob.
 *
 * WHY THIS FILE EXISTS:
 * DOCX generation runs server-side — it reads the logo from the filesystem
 * and uses the `docx` library which is not browser-compatible.
 * The client sends a BibliographyJob (items + metadata) and receives
 * the generated file as a base64-encoded string plus a JSON summary.
 *
 * MARKER: ENGINE ENTRY (Text Bibliography)
 * This is where the text bibliography UI connects to the DOCX engine.
 * Engine entry point: src/core/buildDocx.ts → buildDocx()
 *
 * WHAT THIS DOES:
 * - Accepts POST with { job: BibliographyJob }
 * - Validates required fields (title, preparedBy, annotation completeness)
 * - Calls buildDocx()
 * - Returns { docxBase64, jsonData, summary } on success
 *
 * ERROR HANDLING:
 * - Missing required fields → 400 input_format
 * - Incomplete annotations → 400 workflow_rule
 * - buildDocx failure → 500 external_service
 *
 * SAFE TO EDIT:
 * - Error messages
 * - Add rate limiting or request logging if needed
 *
 * MARKER: FUTURE AUTH CONFIG
 * No authentication in V1. If auth is added, check session here.
 */

import { NextRequest, NextResponse }      from "next/server";
import { buildDocx }                      from "@/core/buildDocx";

// Vercel function timeout — DOCX generation can be slow for large lists.
// Hobby plan caps this at 10s; Pro/Enterprise plans respect the full 60s.
export const maxDuration = 60;
import type { BibliographyJob, AppError, ResultSummary } from "@/types";

// ── POST /api/text-bibliography/generate ─────────────────────────────────────
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
      action:   "Go back and make sure your staff export was parsed successfully.",
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
  // All-or-nothing rule: if annotationMode is "manual", every item must have
  // a non-empty annotation. Partial annotations are not allowed.
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

  // ── Generate ──────────────────────────────────────────────────────────────────
  try {
    const docxBuffer  = await buildDocx(job);
    const docxBase64  = docxBuffer.toString("base64");

    // Build a clean JSON representation for the optional JSON download.
    // Strip coverImageData (a Buffer) — not serializable and not relevant here.
    const jsonData = {
      meta:            job.meta,
      mode:            job.mode,
      annotationMode:  job.annotationMode,
      items:           job.items.map(({ coverImageData: _omit, ...rest }) => rest),
      generatedAt:     new Date().toISOString(),
    };

    const summary: ResultSummary = {
      totalItems:    job.items.length,
      annotated:     job.annotationMode !== "none",
      mode:          "Text bibliography",
      documentTitle: job.meta.title,
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
