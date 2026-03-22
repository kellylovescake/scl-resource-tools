/**
 * src/app/cover-bibliography/page.tsx
 *
 * Cover Bibliography — multi-step workflow.
 *
 * WHY THIS FILE EXISTS:
 * The cover bibliography extends the text bibliography with two additional
 * concerns: an RSS URL input and a strict merge step. This file orchestrates
 * that extended workflow.
 *
 * THE WORKFLOW:
 *   1. Input       — staff export + RSS URL + document metadata
 *   2. Parsing     — loading while both inputs are parsed and merged
 *   3. MergeError  — if merge failed, show structured error details (blocking)
 *   4. Preview     — review merged items with cover URL status
 *   5. Annotating  — (annotation mode only) per-item annotation text fields
 *   6. Review      — final summary before generation
 *   7. Generating  — loading while covers are fetched and DOCX is built
 *   8. Result      — download DOCX + JSON
 *   9. Error       — generic error with recovery
 *
 * THE MERGE ERROR STEP:
 * Cover bibliography merge is strict — any mismatch blocks generation.
 * MergeErrors are product-shaped with type, message, affects, action,
 * and a list of specific titles involved. They are rendered as a structured
 * display, not a generic error card.
 * See: src/core/mergeItems.ts — MARKER: STRICT MERGE RULES
 *
 * STATE DESIGN:
 * Same flat useState pattern as text-bibliography/page.tsx.
 * Additional state for merge errors and cover counts.
 *
 * MARKER: ENGINE ENTRY (Cover Bibliography)
 * The generate step POSTs to /api/cover-bibliography/generate,
 * which fetches covers via fetchCoverBytes() and calls buildDocx().
 *
 * WHAT IS IN THIS FILE:
 * - CoverBibPage: top-level orchestrator
 * - InputStep: expanded input form with RSS URL field
 * - MergeErrorStep: structured merge failure display
 * - PreviewStep: merged item list with cover URL indicators
 * - AnnotatingStep: per-item annotation form (shared logic with text bib)
 * - ReviewStep: final summary with cover count
 * - ResultStep: download buttons with cover stats
 * - StepLabel, MergeErrorCard: shared display primitives
 *
 * SAFE TO EDIT:
 * - Field labels, placeholder text
 * - Merge error display format
 * - Cover count display in preview and review
 */

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import ErrorCard      from "@/components/ui/ErrorCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type {
  BibliographyItem,
  BibliographyJob,
  AnnotationMode,
  MergeError,
  ResultSummary,
  AppError,
} from "@/types";

// ── Local types ────────────────────────────────────────────────────────────────

interface FormData {
  rawText:        string;
  rssUrl:         string;
  title:          string;
  ageGroup:       string;
  preparedBy:     string;
  includeHoopla:  boolean;
  annotationMode: AnnotationMode;
}

type Step =
  | "input"
  | "parsing"
  | "mergeError"
  | "preview"
  | "annotating"
  | "review"
  | "generating"
  | "result"
  | "error";

// ── Default form state ────────────────────────────────────────────────────────

const DEFAULT_FORM: FormData = {
  rawText:        "",
  rssUrl:         "",
  title:          "",
  ageGroup:       "",
  preparedBy:     "",
  includeHoopla:  false,
  annotationMode: "none",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function makeFilename(title: string): string {
  const slug = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `SCL-${slug || "cover-bibliography"}-covers.docx`;
}

function downloadBase64(base64: string, filename: string, mimeType: string) {
  const bytes = atob(base64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob  = new Blob([arr], { type: mimeType });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════════════
// CoverBibPage — top-level orchestrator
// ═════════════════════════════════════════════════════════════════════════════

export default function CoverBibPage() {
  // ── Step ───────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("input");

  // ── Form data ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  // ── Merge results ──────────────────────────────────────────────────────────
  const [mergedItems,     setMergedItems]     = useState<BibliographyItem[]>([]);
  const [mergeErrors,     setMergeErrors]     = useState<MergeError[]>([]);
  const [mergeStaffCount, setMergeStaffCount] = useState(0);
  const [mergeRssCount,   setMergeRssCount]   = useState(0);

  // ── Annotations ────────────────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState<string[]>([]);

  // ── Error state ────────────────────────────────────────────────────────────
  const [error,         setError]         = useState<AppError | null>(null);
  const [errorBackStep, setErrorBackStep] = useState<Step>("input");

  // ── Result state ───────────────────────────────────────────────────────────
  const [resultDocxBase64, setResultDocxBase64] = useState("");
  const [resultJsonData,   setResultJsonData]   = useState<object>({});
  const [resultSummary,    setResultSummary]    = useState<ResultSummary | null>(null);
  const [resultFilename,   setResultFilename]   = useState("");

  // ── Helper: show generic error ─────────────────────────────────────────────
  const showError = useCallback((err: AppError, backTo: Step) => {
    setError(err);
    setErrorBackStep(backTo);
    setStep("error");
  }, []);

  // ── Step 1 → 2: Parse + merge ──────────────────────────────────────────────
  const handleParse = useCallback(async (data: FormData) => {
    setForm(data);
    setStep("parsing");

    try {
      const res  = await fetch("/api/cover-bibliography/parse", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: data.rawText, rssUrl: data.rssUrl }),
      });
      const json = await res.json();

      if (res.status === 409 && json.mergeErrors) {
        // Merge conflict — show the structured merge error step
        setMergeErrors(json.mergeErrors);
        setMergeStaffCount(json.staffCount ?? 0);
        setMergeRssCount(json.rssCount ?? 0);
        setStep("mergeError");
      } else if (!res.ok || json.error) {
        showError(json.error ?? {
          category: "external_service",
          message:  "Something went wrong while parsing.",
          action:   "Try again.",
        }, "input");
      } else {
        setMergedItems(json.mergedItems);
        setMergeStaffCount(json.staffCount);
        setMergeRssCount(json.rssCount);
        setAnnotations((json.mergedItems as BibliographyItem[]).map(() => ""));
        setStep("preview");
      }
    } catch {
      showError({
        category: "external_service",
        message:  "Could not reach the server.",
        action:   "Check your connection and try again.",
      }, "input");
    }
  }, [showError]);

  // ── Confirm preview → annotating or review ─────────────────────────────────
  const handlePreviewConfirm = useCallback(() => {
    if (form.annotationMode === "manual") {
      setStep("annotating");
    } else {
      setStep("review");
    }
  }, [form.annotationMode]);

  // ── Confirm annotations → review ───────────────────────────────────────────
  const handleAnnotationsConfirm = useCallback((updatedAnnotations: string[]) => {
    setAnnotations(updatedAnnotations);
    setMergedItems(prev =>
      prev.map((item, i) => ({ ...item, annotation: updatedAnnotations[i]?.trim() ?? "" }))
    );
    setStep("review");
  }, []);

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const job: BibliographyJob = {
      mode: "cover_bibliography",
      meta: {
        title:            form.title,
        ageGroup:         form.ageGroup,
        preparedBy:       form.preparedBy,
        dateStr:          todayStr(),
        digitalResources: form.includeHoopla ? ["Hoopla"] : [],
      },
      items:          mergedItems,
      annotationMode: form.annotationMode,
    };

    setStep("generating");

    try {
      const res  = await fetch("/api/cover-bibliography/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ job }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        showError(json.error ?? {
          category: "external_service",
          message:  "Generation failed unexpectedly.",
          action:   "Try again.",
        }, form.annotationMode === "manual" ? "annotating" : "review");
      } else {
        setResultDocxBase64(json.docxBase64);
        setResultJsonData(json.jsonData);
        setResultSummary(json.summary);
        setResultFilename(makeFilename(form.title));
        setStep("result");
      }
    } catch {
      showError({
        category: "external_service",
        message:  "Could not reach the server.",
        action:   "Check your connection and try again.",
      }, "review");
    }
  }, [form, mergedItems, showError]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setForm(DEFAULT_FORM);
    setMergedItems([]);
    setMergeErrors([]);
    setMergeStaffCount(0);
    setMergeRssCount(0);
    setAnnotations([]);
    setError(null);
    setResultDocxBase64("");
    setResultJsonData({});
    setResultSummary(null);
    setResultFilename("");
    setStep("input");
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">

      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link
        href="/"
        className="text-xs text-scl-gray hover:text-scl-orange transition-colors inline-flex items-center gap-1 mb-6"
      >
        ← All tools
      </Link>

      {/* ── Page heading ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-scl-dark">Cover Bibliography</h1>
        <p className="mt-1 text-sm text-scl-gray">
          Paste a staff export and its RSS feed URL. The app merges them,
          fetches cover images, and downloads a branded DOCX reading list.
        </p>
      </div>

      {/* ── Orange rule ────────────────────────────────────────────────────── */}
      <div className="scl-rule mb-6" />

      {/* ── Step content ───────────────────────────────────────────────────── */}

      {step === "input" && (
        <InputStep form={form} onSubmit={handleParse} />
      )}

      {step === "parsing" && (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Parsing your export and fetching the RSS feed…" size="lg" />
        </div>
      )}

      {step === "mergeError" && (
        <MergeErrorStep
          errors={mergeErrors}
          staffCount={mergeStaffCount}
          rssCount={mergeRssCount}
          onBack={() => setStep("input")}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          items={mergedItems}
          staffCount={mergeStaffCount}
          rssCount={mergeRssCount}
          annotationMode={form.annotationMode}
          onConfirm={handlePreviewConfirm}
          onBack={() => setStep("input")}
        />
      )}

      {step === "annotating" && (
        <AnnotatingStep
          items={mergedItems}
          annotations={annotations}
          onConfirm={handleAnnotationsConfirm}
          onBack={() => setStep("preview")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          form={form}
          items={mergedItems}
          onGenerate={handleGenerate}
          onBack={() => setStep(form.annotationMode === "manual" ? "annotating" : "preview")}
        />
      )}

      {step === "generating" && (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Fetching cover images and building your bibliography…" size="lg" />
        </div>
      )}

      {step === "result" && resultSummary && (
        <ResultStep
          docxBase64={resultDocxBase64}
          jsonData={resultJsonData}
          summary={resultSummary}
          filename={resultFilename}
          onReset={handleReset}
        />
      )}

      {step === "error" && error && (
        <div>
          <ErrorCard error={error} />
          <button
            onClick={() => setStep(errorBackStep)}
            className="mt-3 text-sm text-scl-orange hover:underline"
          >
            ← Go back
          </button>
        </div>
      )}

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// StepLabel
// ═════════════════════════════════════════════════════════════════════════════

function StepLabel({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-scl-gray hover:text-scl-orange transition-colors"
        >
          ← Back
        </button>
      )}
      <span className="text-xs font-semibold text-scl-orange uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// InputStep — staff export + RSS URL + metadata form
// ═════════════════════════════════════════════════════════════════════════════

interface InputStepProps {
  form:     FormData;
  onSubmit: (data: FormData) => void;
}

function InputStep({ form, onSubmit }: InputStepProps) {
  const [local, setLocal] = useState<FormData>(form);

  const set = (patch: Partial<FormData>) =>
    setLocal(prev => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(local);
  };

  const canSubmit =
    local.rawText.trim() &&
    local.rssUrl.trim() &&
    local.title.trim() &&
    local.preparedBy.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* ── Staff export ────────────────────────────────────────────────────── */}
      <div>
        <label
          htmlFor="raw-text"
          className="block text-sm font-semibold text-scl-dark mb-1"
        >
          Staff export
        </label>
        <p className="text-xs text-scl-gray mb-2">
          In the ILS, go to your list and copy the staff export text.
          Paste it here — same format as the text bibliography.
        </p>
        <textarea
          id="raw-text"
          rows={10}
          value={local.rawText}
          onChange={e => set({ rawText: e.target.value })}
          placeholder={"* __Title.__ Author. Collection: Adult Non-Fiction, Call #: 005 M"}
          spellCheck={false}
          className={`
            w-full rounded border px-3 py-2 text-sm font-mono
            border-scl-rule bg-white text-scl-dark
            placeholder:text-scl-gray/40
            focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
            resize-y
          `}
        />
      </div>

      {/* ── RSS URL ─────────────────────────────────────────────────────────── */}
      <div>
        <label
          htmlFor="rss-url"
          className="block text-sm font-semibold text-scl-dark mb-1"
        >
          RSS feed URL <span className="text-scl-orange">*</span>
        </label>
        <p className="text-xs text-scl-gray mb-2">
          In the ILS, open the <em>same list</em> you used for the staff export.
          Find the RSS link and copy the URL. It looks like:{" "}
          <span className="font-mono text-scl-dark">
            https://tlc.sunflower.lib.ms.us/list/static/424777195/rss
          </span>
        </p>
        <input
          id="rss-url"
          type="url"
          value={local.rssUrl}
          onChange={e => set({ rssUrl: e.target.value })}
          placeholder="https://tlc.sunflower.lib.ms.us/list/static/…/rss"
          spellCheck={false}
          className={`
            w-full rounded border px-3 py-2 text-sm font-mono
            border-scl-rule bg-white text-scl-dark
            placeholder:text-scl-gray/40
            focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
          `}
        />
        <p className="text-xs text-scl-gray mt-1">
          The staff export and RSS feed must be from the <strong>same list</strong>.
          If they differ, the merge will fail.
        </p>
      </div>

      {/* ── Document metadata ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-scl-rule bg-scl-light p-4 flex flex-col gap-4">
        <p className="text-xs font-semibold text-scl-dark uppercase tracking-wide">
          Document details
        </p>

        <div>
          <label htmlFor="doc-title" className="block text-sm font-semibold text-scl-dark mb-1">
            Title <span className="text-scl-orange">*</span>
          </label>
          <input
            id="doc-title"
            type="text"
            value={local.title}
            onChange={e => set({ title: e.target.value })}
            placeholder="e.g. Dinosaur Reference"
            className={`
              w-full rounded border px-3 py-2 text-sm
              border-scl-rule bg-white text-scl-dark
              placeholder:text-scl-gray/50
              focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
            `}
          />
        </div>

        <div>
          <label htmlFor="age-group" className="block text-sm font-semibold text-scl-dark mb-1">
            Age group
          </label>
          <input
            id="age-group"
            type="text"
            value={local.ageGroup}
            onChange={e => set({ ageGroup: e.target.value })}
            placeholder="e.g. for Children — leave blank to omit"
            className={`
              w-full rounded border px-3 py-2 text-sm
              border-scl-rule bg-white text-scl-dark
              placeholder:text-scl-gray/50
              focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
            `}
          />
        </div>

        <div>
          <label htmlFor="prepared-by" className="block text-sm font-semibold text-scl-dark mb-1">
            Prepared by <span className="text-scl-orange">*</span>
          </label>
          <input
            id="prepared-by"
            type="text"
            value={local.preparedBy}
            onChange={e => set({ preparedBy: e.target.value })}
            placeholder="Your name"
            className={`
              w-full rounded border px-3 py-2 text-sm
              border-scl-rule bg-white text-scl-dark
              placeholder:text-scl-gray/50
              focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
            `}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-scl-dark mb-2">Digital resources</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={local.includeHoopla}
              onChange={e => set({ includeHoopla: e.target.checked })}
              className="accent-scl-orange"
            />
            <span className="text-sm text-scl-dark">Include Hoopla</span>
          </label>
        </div>
      </div>

      {/* ── Annotations toggle ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-scl-rule bg-white p-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={local.annotationMode === "manual"}
            onChange={e => set({ annotationMode: e.target.checked ? "manual" : "none" })}
            className="accent-scl-orange mt-0.5"
          />
          <div>
            <p className="text-sm font-semibold text-scl-dark">Add annotations</p>
            <p className="text-xs text-scl-gray mt-0.5">
              You&apos;ll be asked to write a short annotation for each item.
              All-or-nothing — every item must have one.
            </p>
          </div>
        </label>
      </div>

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            px-5 py-2.5 rounded text-sm font-semibold
            bg-scl-orange text-white
            hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed
          `}
        >
          Parse and merge →
        </button>
        {!canSubmit && (
          <p className="text-xs text-scl-gray mt-2">
            Staff export, RSS URL, title, and &ldquo;Prepared by&rdquo; are required.
          </p>
        )}
      </div>

    </form>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MergeErrorStep — structured display of merge failures
//
// MARKER: STRICT MERGE RULES
// This step renders when mergeItems() returns success: false.
// It shows each MergeError with its type, message, affects, action, and
// the specific titles involved. Generation is blocked until the user
// fixes their inputs and tries again.
// ═════════════════════════════════════════════════════════════════════════════

interface MergeErrorStepProps {
  errors:     MergeError[];
  staffCount: number;
  rssCount:   number;
  onBack:     () => void;
}

// Maps MergeError type to a human-readable heading
const MERGE_ERROR_HEADING: Record<MergeError["type"], string> = {
  count_mismatch:  "Count mismatch",
  unmatched_item:  "Unmatched titles",
  duplicate_title: "Duplicate titles",
  empty_input:     "Empty input",
};

function MergeErrorStep({ errors, staffCount, rssCount, onBack }: MergeErrorStepProps) {
  return (
    <div>
      <StepLabel label="Merge failed" onBack={onBack} />

      {/* Explanation banner */}
      <div className="mb-5 p-4 rounded border border-red-300 bg-red-50">
        <p className="text-sm font-semibold text-red-800 mb-1">
          The staff export and RSS feed could not be merged.
        </p>
        <p className="text-xs text-red-700">
          The staff export had{" "}
          <span className="font-semibold">{staffCount} item{staffCount !== 1 ? "s" : ""}</span>{" "}
          and the RSS feed had{" "}
          <span className="font-semibold">{rssCount} item{rssCount !== 1 ? "s" : ""}</span>.
          {" "}Both inputs must come from the same list with no edits in between.
        </p>
      </div>

      {/* Individual error cards */}
      <div className="flex flex-col gap-3 mb-6">
        {errors.map((err, i) => (
          <MergeErrorCard key={i} error={err} />
        ))}
      </div>

      {/* Recovery */}
      <button
        type="button"
        onClick={onBack}
        className="px-5 py-2.5 rounded text-sm font-semibold bg-scl-orange text-white hover:opacity-90 transition-opacity"
      >
        ← Go back and fix
      </button>
    </div>
  );
}

function MergeErrorCard({ error }: { error: MergeError }) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
        {MERGE_ERROR_HEADING[error.type]}
      </p>
      <p className="text-sm font-medium text-amber-800">{error.message}</p>
      <p className="text-sm text-amber-700 mt-1 opacity-90">Affects: {error.affects}</p>
      <p className="text-sm text-amber-700 mt-2 font-medium">→ {error.action}</p>

      {/* Specific titles involved */}
      {error.items && error.items.length > 0 && (
        <div className="mt-3 pt-2 border-t border-amber-200">
          <p className="text-xs font-semibold text-amber-700 mb-1">Titles involved:</p>
          <ul className="space-y-0.5">
            {error.items.map((title, i) => (
              <li key={i} className="text-xs text-amber-700 font-mono">
                &ldquo;{title}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PreviewStep — merged item list with cover URL indicators
// ═════════════════════════════════════════════════════════════════════════════

interface PreviewStepProps {
  items:          BibliographyItem[];
  staffCount:     number;
  rssCount:       number;
  annotationMode: AnnotationMode;
  onConfirm:      () => void;
  onBack:         () => void;
}

function PreviewStep({ items, staffCount, rssCount, annotationMode, onConfirm, onBack }: PreviewStepProps) {
  const withCover    = items.filter(i => i.coverUrl).length;
  const withoutCover = items.length - withCover;
  const nextLabel    = annotationMode === "manual"
    ? "Continue to annotations →"
    : "Continue to review →";

  return (
    <div>
      <StepLabel label="Step 2 — Preview" onBack={onBack} />

      {/* Merge success summary */}
      <div className="mb-4 p-3 rounded border border-scl-rule bg-scl-light">
        <p className="text-sm font-semibold text-scl-dark">
          ✓ Merge successful — {items.length} item{items.length !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-scl-gray mt-0.5">
          Staff export: {staffCount} items · RSS feed: {rssCount} items ·{" "}
          {withCover} with cover URL
          {withoutCover > 0 ? `, ${withoutCover} without` : ""}
        </p>
        <p className="text-xs text-scl-gray mt-1">
          Cover images are fetched during generation — the list below shows whether
          a cover URL was found in the RSS feed, not whether the image exists.
        </p>
      </div>

      {/* Item list */}
      <div className="rounded-lg border border-scl-rule overflow-hidden mb-5">
        <div className="divide-y divide-scl-rule">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              {/* Cover indicator */}
              <div className="flex-shrink-0 mt-1">
                {item.coverUrl ? (
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-green-500"
                    title="Cover URL found"
                    aria-label="Cover URL found"
                  />
                ) : (
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-scl-rule"
                    title="No cover URL"
                    aria-label="No cover URL"
                  />
                )}
              </div>

              {/* Item details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-scl-dark leading-snug">
                  {item.title}
                </p>
                {item.author && (
                  <p className="text-xs text-scl-gray mt-0.5">{item.author}</p>
                )}
                {(item.callNumber || item.collection) && (
                  <p className="text-xs text-scl-gray/70 mt-0.5 font-mono">
                    {[item.collection, item.callNumber].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cover legend */}
      <div className="flex gap-4 mb-5 text-xs text-scl-gray">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Cover URL found ({withCover})
        </span>
        {withoutCover > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-scl-rule" />
            No cover URL ({withoutCover})
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onConfirm}
          className="px-5 py-2.5 rounded text-sm font-semibold bg-scl-orange text-white hover:opacity-90 transition-opacity"
        >
          {nextLabel}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-scl-gray hover:text-scl-orange transition-colors"
        >
          ← Edit inputs
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AnnotatingStep — per-item annotation form
// MARKER: ANNOTATION MODE — same all-or-nothing logic as text bibliography
// ═════════════════════════════════════════════════════════════════════════════

interface AnnotatingStepProps {
  items:       BibliographyItem[];
  annotations: string[];
  onConfirm:   (annotations: string[]) => void;
  onBack:      () => void;
}

function AnnotatingStep({ items, annotations: initialAnnotations, onConfirm, onBack }: AnnotatingStepProps) {
  const [annotations, setAnnotations] = useState<string[]>(
    initialAnnotations.length === items.length
      ? initialAnnotations
      : items.map(item => item.annotation ?? "")
  );
  const [showErrors, setShowErrors] = useState(false);

  const updateAnnotation = (index: number, value: string) => {
    setAnnotations(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleConfirm = () => {
    if (!annotations.every(a => a.trim())) {
      setShowErrors(true);
      return;
    }
    onConfirm(annotations);
  };

  const emptyCount = annotations.filter(a => !a.trim()).length;

  return (
    <div>
      <StepLabel label="Step 3 — Annotations" onBack={onBack} />

      <div className="mb-4">
        <p className="text-sm text-scl-dark font-semibold">Add an annotation for each item</p>
        <p className="text-xs text-scl-gray mt-0.5">
          One or two sentences per item. 25 words is a good target.
          Every item must have an annotation.
        </p>
      </div>

      {showErrors && emptyCount > 0 && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50">
          <p className="text-xs font-semibold text-red-800">
            {emptyCount} item{emptyCount === 1 ? " is" : "s are"} missing an annotation.
          </p>
          <p className="text-xs text-red-700 mt-1">
            Fill in the highlighted fields, or go back and turn off annotations.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        {items.map((item, i) => {
          const isEmpty  = !annotations[i]?.trim();
          const hasError = showErrors && isEmpty;
          const wordCount = annotations[i]
            ? annotations[i].trim().split(/\s+/).filter(Boolean).length
            : 0;

          return (
            <div key={i}>
              <p className="text-sm font-semibold text-scl-dark mb-1">
                <span className="text-scl-gray/60 font-mono text-xs mr-2">{i + 1}.</span>
                {item.title}
              </p>
              {item.author && (
                <p className="text-xs text-scl-gray mb-1.5">{item.author}</p>
              )}
              <textarea
                rows={3}
                value={annotations[i] ?? ""}
                onChange={e => updateAnnotation(i, e.target.value)}
                placeholder="Write a brief description of this book…"
                className={`
                  w-full rounded border px-3 py-2 text-sm
                  bg-white text-scl-dark
                  placeholder:text-scl-gray/40
                  focus:outline-none focus:ring-1
                  resize-y
                  ${hasError
                    ? "border-red-400 focus:border-red-400 focus:ring-red-300"
                    : "border-scl-rule focus:border-scl-orange focus:ring-scl-orange"
                  }
                `}
              />
              <p className={`text-xs mt-0.5 ${wordCount > 35 ? "text-amber-700" : "text-scl-gray/60"}`}>
                {wordCount} word{wordCount === 1 ? "" : "s"}
                {wordCount > 35 ? " — consider trimming" : ""}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleConfirm}
          className="px-5 py-2.5 rounded text-sm font-semibold bg-scl-orange text-white hover:opacity-90 transition-opacity"
        >
          Continue to review →
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-scl-gray hover:text-scl-orange transition-colors"
        >
          ← Back to preview
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ReviewStep — final summary before generation
// ═════════════════════════════════════════════════════════════════════════════

interface ReviewStepProps {
  form:       FormData;
  items:      BibliographyItem[];
  onGenerate: () => void;
  onBack:     () => void;
}

function ReviewStep({ form, items, onGenerate, onBack }: ReviewStepProps) {
  const withCover    = items.filter(i => i.coverUrl).length;
  const withoutCover = items.length - withCover;
  const stepNum      = form.annotationMode === "manual" ? "4" : "3";

  return (
    <div>
      <StepLabel label={`Step ${stepNum} — Review`} onBack={onBack} />

      <div className="rounded-lg border border-scl-rule bg-white overflow-hidden mb-5">
        <div className="h-1 bg-scl-orange" />
        <div className="p-4 flex flex-col gap-3">

          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Title</p>
            <p className="text-sm text-scl-dark mt-0.5">{form.title}</p>
          </div>

          {form.ageGroup && (
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Age group</p>
              <p className="text-sm text-scl-dark mt-0.5">{form.ageGroup}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Prepared by</p>
            <p className="text-sm text-scl-dark mt-0.5">{form.preparedBy}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Date</p>
            <p className="text-sm text-scl-dark mt-0.5">{todayStr()}</p>
          </div>

          {form.includeHoopla && (
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Digital resources</p>
              <p className="text-sm text-scl-dark mt-0.5">Hoopla</p>
            </div>
          )}

          <div className="border-t border-scl-rule pt-3 flex flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Items</p>
              <p className="text-sm text-scl-dark mt-0.5">{items.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Cover URLs</p>
              <p className="text-sm text-scl-dark mt-0.5">
                {withCover} found
                {withoutCover > 0 && (
                  <span className="text-amber-700"> · {withoutCover} missing</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Annotations</p>
              <p className="text-sm text-scl-dark mt-0.5">
                {form.annotationMode === "manual" ? "Yes — all items annotated" : "None"}
              </p>
            </div>
          </div>

          {withoutCover > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              ⚠ {withoutCover} item{withoutCover === 1 ? "" : "s"} had no cover URL in the RSS feed
              and will appear without a cover image in the document.
            </p>
          )}

        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onGenerate}
          className="px-5 py-2.5 rounded text-sm font-semibold bg-scl-orange text-white hover:opacity-90 transition-opacity"
        >
          Generate bibliography →
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-scl-gray hover:text-scl-orange transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ResultStep — download buttons + cover summary
// ═════════════════════════════════════════════════════════════════════════════

interface ResultStepProps {
  docxBase64: string;
  jsonData:   object;
  summary:    ResultSummary;
  filename:   string;
  onReset:    () => void;
}

function ResultStep({ docxBase64, jsonData, summary, filename, onReset }: ResultStepProps) {
  const jsonFilename = filename.replace(/\.docx$/, ".json");

  return (
    <div>
      <StepLabel label="Done" />

      <div className="rounded-lg border border-scl-rule bg-white overflow-hidden mb-5">
        <div className="h-1 bg-scl-orange" />
        <div className="p-5">

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl" aria-hidden="true">✓</span>
            <h2 className="text-base font-bold text-scl-dark">Your bibliography is ready</h2>
          </div>

          <p className="text-sm text-scl-gray mb-1">
            <span className="font-semibold text-scl-dark">{summary.documentTitle}</span>
            {" · "}{summary.totalItems} item{summary.totalItems === 1 ? "" : "s"}
            {summary.annotated ? " · annotated" : ""}
          </p>

          {/* Cover stats */}
          {summary.itemsWithCovers !== undefined && (
            <p className="text-xs text-scl-gray mt-1">
              {summary.itemsWithCovers} with cover image
              {(summary.itemsWithoutCovers ?? 0) > 0 && (
                <span className="text-amber-700">
                  {" · "}{summary.itemsWithoutCovers} without cover
                </span>
              )}
            </p>
          )}

          {/* Warnings (e.g. items without covers) */}
          {summary.warnings && summary.warnings.length > 0 && (
            <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200">
              {summary.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                downloadBase64(
                  docxBase64,
                  filename,
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
              }
              className="px-4 py-2 rounded text-sm font-semibold bg-scl-orange text-white hover:opacity-90 transition-opacity"
            >
              ↓ Download DOCX
            </button>
            <button
              type="button"
              onClick={() => downloadJson(jsonData, jsonFilename)}
              className="px-4 py-2 rounded text-sm font-semibold border border-scl-rule text-scl-gray hover:text-scl-orange hover:border-scl-orange transition-colors"
            >
              ↓ Download JSON
            </button>
          </div>

          <p className="text-xs text-scl-gray mt-3">
            Saved as <span className="font-mono">{filename}</span>
          </p>

        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="text-sm text-scl-orange hover:underline"
      >
        Start over
      </button>
    </div>
  );
}
