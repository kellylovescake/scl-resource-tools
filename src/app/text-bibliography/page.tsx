/**
 * src/app/text-bibliography/page.tsx
 *
 * Text Bibliography — multi-step workflow.
 *
 * WHY THIS FILE EXISTS:
 * The text bibliography workflow has several distinct steps that need
 * to be orchestrated in sequence. This file owns that orchestration.
 * Actual parsing and DOCX generation happen server-side via API routes.
 *
 * THE WORKFLOW:
 *   1. Input      — paste staff export, enter document metadata
 *   2. Parsing    — brief loading state while the API parses the text
 *   3. Preview    — review parsed items and any parse warnings
 *   4. Annotating — (annotation mode only) per-item annotation text fields
 *   5. Review     — final summary before generation
 *   6. Generating — loading state while DOCX is built
 *   7. Result     — download DOCX + JSON, start over
 *   8. Error      — product-shaped error with recovery options
 *
 * STATE DESIGN:
 * Each step's data lives in a flat set of useState hooks at the page level.
 * The `step` variable controls which component is rendered.
 * This makes back-navigation simple: just change `step`.
 *
 * MARKER: ENGINE ENTRY (Text Bibliography)
 * The generate step POSTs to /api/text-bibliography/generate,
 * which calls buildDocx() in src/core/buildDocx.ts.
 *
 * WHAT IS IN THIS FILE:
 * - TextBibPage: top-level orchestrator
 * - InputStep: staff export textarea + document metadata form
 * - PreviewStep: parsed item list + warning display
 * - AnnotatingStep: per-item annotation form
 * - ReviewStep: final summary before generation
 * - ResultStep: download buttons
 * - StepLabel: shared heading component for each step
 *
 * WHAT IS NOT IN THIS FILE:
 * - Parsing logic (src/core/parseStaffExport.ts)
 * - DOCX generation (src/core/buildDocx.ts)
 * - HTTP handling (src/app/api/text-bibliography/)
 *
 * SAFE TO EDIT:
 * - Field labels, placeholder text, descriptions
 * - Add/remove digital resource options (currently Hoopla only)
 * - Card styling and layout
 */

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import ErrorCard     from "@/components/ui/ErrorCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type {
  BibliographyItem,
  BibliographyJob,
  AnnotationMode,
  ResultSummary,
  AppError,
} from "@/types";

// ── Local types (used only in this file) ──────────────────────────────────────

interface ParseWarning {
  line:    number;
  raw:     string;
  message: string;
}

interface FormData {
  rawText:        string;
  title:          string;
  ageGroup:       string;
  preparedBy:     string;
  includeHoopla:  boolean;
  annotationMode: AnnotationMode;
}

type Step =
  | "input"
  | "parsing"
  | "preview"
  | "annotating"
  | "review"
  | "generating"
  | "result"
  | "error";

// ── Default form state ────────────────────────────────────────────────────────

const DEFAULT_FORM: FormData = {
  rawText:        "",
  title:          "",
  ageGroup:       "",
  preparedBy:     "",
  includeHoopla:  false,
  annotationMode: "none",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as MM/DD/YYYY — format expected by DocumentMeta.dateStr */
function todayStr(): string {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Converts a bibliography title into a safe filename slug */
function makeFilename(title: string): string {
  const slug = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `SCL-${slug || "bibliography"}.docx`;
}

/** Triggers a browser download from a base64-encoded string */
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

/** Triggers a browser download of a JSON object */
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
// TextBibPage — top-level orchestrator
// ═════════════════════════════════════════════════════════════════════════════

export default function TextBibPage() {
  // ── Step ───────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("input");

  // ── Form data — preserved across back navigation ───────────────────────────
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  // ── Parse results ───────────────────────────────────────────────────────────
  const [parsedItems,    setParsedItems]    = useState<BibliographyItem[]>([]);
  const [parseWarnings,  setParseWarnings]  = useState<ParseWarning[]>([]);

  // ── Annotations — one entry per parsed item ─────────────────────────────────
  const [annotations, setAnnotations] = useState<string[]>([]);

  // ── Error state ─────────────────────────────────────────────────────────────
  const [error,         setError]         = useState<AppError | null>(null);
  const [errorBackStep, setErrorBackStep] = useState<Step>("input");

  // ── Result state ────────────────────────────────────────────────────────────
  const [resultDocxBase64, setResultDocxBase64] = useState("");
  const [resultJsonData,   setResultJsonData]   = useState<object>({});
  const [resultSummary,    setResultSummary]     = useState<ResultSummary | null>(null);
  const [resultFilename,   setResultFilename]    = useState("");

  // ── Helpers: show error with a "back to" step ──────────────────────────────
  const showError = useCallback((err: AppError, backTo: Step) => {
    setError(err);
    setErrorBackStep(backTo);
    setStep("error");
  }, []);

  // ── Step 1 → 2: Submit form and call parse API ─────────────────────────────
  const handleParse = useCallback(async (data: FormData) => {
    setForm(data);
    setStep("parsing");

    try {
      const res  = await fetch("/api/text-bibliography/parse", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: data.rawText }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        showError(json.error ?? {
          category: "external_service",
          message:  "Parsing failed unexpectedly.",
          action:   "Try again.",
        }, "input");
      } else {
        setParsedItems(json.items);
        setParseWarnings(json.warnings ?? []);
        // Initialize annotations array — one empty string per item
        setAnnotations((json.items as BibliographyItem[]).map(() => ""));
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

  // ── Step 3 → 4 or 5: Confirm preview ──────────────────────────────────────
  const handlePreviewConfirm = useCallback(() => {
    if (form.annotationMode === "manual") {
      setStep("annotating");
    } else {
      setStep("review");
    }
  }, [form.annotationMode]);

  // ── Step 4 → 5: Confirm annotations ────────────────────────────────────────
  const handleAnnotationsConfirm = useCallback((updatedAnnotations: string[]) => {
    setAnnotations(updatedAnnotations);
    // Merge annotations into parsedItems so the review step and job both have them
    setParsedItems(prev =>
      prev.map((item, i) => ({ ...item, annotation: updatedAnnotations[i]?.trim() ?? "" }))
    );
    setStep("review");
  }, []);

  // ── Step 5 → 6: Generate ───────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const job: BibliographyJob = {
      mode: "text_only_bibliography",
      meta: {
        title:            form.title,
        ageGroup:         form.ageGroup,
        preparedBy:       form.preparedBy,
        dateStr:          todayStr(),
        digitalResources: form.includeHoopla ? ["Hoopla"] : [],
      },
      items:          parsedItems,
      annotationMode: form.annotationMode,
    };

    setStep("generating");

    try {
      const res  = await fetch("/api/text-bibliography/generate", {
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
  }, [form, parsedItems, showError]);

  // ── Reset — back to blank input ────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setForm(DEFAULT_FORM);
    setParsedItems([]);
    setParseWarnings([]);
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
        <h1 className="text-2xl font-bold text-scl-dark">Text Bibliography</h1>
        <p className="mt-1 text-sm text-scl-gray">
          Paste a staff export, review the items, and download a branded DOCX reading list.
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
          <LoadingSpinner label="Parsing your staff export…" size="lg" />
        </div>
      )}

      {step === "preview" && (
        <PreviewStep
          items={parsedItems}
          warnings={parseWarnings}
          annotationMode={form.annotationMode}
          onConfirm={handlePreviewConfirm}
          onBack={() => setStep("input")}
        />
      )}

      {step === "annotating" && (
        <AnnotatingStep
          items={parsedItems}
          annotations={annotations}
          onConfirm={handleAnnotationsConfirm}
          onBack={() => setStep("preview")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          form={form}
          items={parsedItems}
          warnings={parseWarnings}
          onGenerate={handleGenerate}
          onBack={() => setStep(form.annotationMode === "manual" ? "annotating" : "preview")}
        />
      )}

      {step === "generating" && (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Building your bibliography…" size="lg" />
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
// StepLabel — shared step heading with optional back button
// ═════════════════════════════════════════════════════════════════════════════

function StepLabel({
  label,
  onBack,
}: {
  label:   string;
  onBack?: () => void;
}) {
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
// InputStep — staff export textarea + document metadata form
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
    local.title.trim() &&
    local.preparedBy.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* ── Staff export text ───────────────────────────────────────────────── */}
      <div>
        <label
          htmlFor="raw-text"
          className="block text-sm font-semibold text-scl-dark mb-1"
        >
          Staff export
        </label>
        <p className="text-xs text-scl-gray mb-2">
          In the ILS, go to your list and copy the full text of the staff export.
          Paste it here. Each item should be on its own line.
        </p>
        <textarea
          id="raw-text"
          rows={12}
          value={local.rawText}
          onChange={e => set({ rawText: e.target.value })}
          placeholder={"* __Title.__ Author. Collection: Adult Non-Fiction, Call #: 005 M\n* __Another Title.__ Author. Collection: Easy, Call #: E SMITH"}
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

      {/* ── Document metadata ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-scl-rule bg-scl-light p-4 flex flex-col gap-4">
        <p className="text-xs font-semibold text-scl-dark uppercase tracking-wide">
          Document details
        </p>

        {/* Title */}
        <div>
          <label
            htmlFor="doc-title"
            className="block text-sm font-semibold text-scl-dark mb-1"
          >
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

        {/* Age group */}
        <div>
          <label
            htmlFor="age-group"
            className="block text-sm font-semibold text-scl-dark mb-1"
          >
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

        {/* Prepared by */}
        <div>
          <label
            htmlFor="prepared-by"
            className="block text-sm font-semibold text-scl-dark mb-1"
          >
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
          <p className="text-xs text-scl-gray mt-1">
            Appears in the document footer on one line.
          </p>
        </div>

        {/* Digital resources */}
        <div>
          <p className="text-sm font-semibold text-scl-dark mb-2">
            Digital resources
          </p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={local.includeHoopla}
              onChange={e => set({ includeHoopla: e.target.checked })}
              className="accent-scl-orange"
            />
            <span className="text-sm text-scl-dark">Include Hoopla</span>
          </label>
          <p className="text-xs text-scl-gray mt-1">
            Adds a &ldquo;Also available digitally: Hoopla&rdquo; note to the document.
          </p>
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
            <p className="text-sm font-semibold text-scl-dark">
              Add annotations
            </p>
            <p className="text-xs text-scl-gray mt-0.5">
              You&apos;ll be asked to write a short annotation for each item.
              Annotations are all-or-nothing — every item must have one.
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
          Parse and preview →
        </button>
        {!canSubmit && (
          <p className="text-xs text-scl-gray mt-2">
            Staff export, title, and &ldquo;Prepared by&rdquo; are required.
          </p>
        )}
      </div>

    </form>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PreviewStep — parsed item list + parse warnings
// ═════════════════════════════════════════════════════════════════════════════

interface PreviewStepProps {
  items:          BibliographyItem[];
  warnings:       ParseWarning[];
  annotationMode: AnnotationMode;
  onConfirm:      () => void;
  onBack:         () => void;
}

function PreviewStep({ items, warnings, annotationMode, onConfirm, onBack }: PreviewStepProps) {
  const nextLabel = annotationMode === "manual"
    ? "Continue to annotations →"
    : "Continue to review →";

  return (
    <div>
      <StepLabel label="Step 2 — Preview" onBack={onBack} />

      {/* Summary */}
      <div className="mb-4">
        <p className="text-sm text-scl-dark font-semibold">
          {items.length} item{items.length === 1 ? "" : "s"} found
        </p>
        {annotationMode === "manual" && (
          <p className="text-xs text-scl-gray mt-0.5">
            You&apos;ll add an annotation for each item on the next step.
          </p>
        )}
      </div>

      {/* Parse warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 p-3 rounded border border-amber-300 bg-amber-50">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
            {warnings.length} line{warnings.length === 1 ? "" : "s"} could not be parsed
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">
                <span className="font-mono">Line {w.line}:</span>{" "}
                {w.message}
                {" — "}
                <span className="italic opacity-80">{w.raw.slice(0, 60)}{w.raw.length > 60 ? "…" : ""}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2 font-medium">
            These lines were skipped. If you need them, go back, fix the text, and re-parse.
          </p>
        </div>
      )}

      {/* Item list */}
      <div className="rounded-lg border border-scl-rule overflow-hidden mb-5">
        <div className="divide-y divide-scl-rule">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <span className="text-xs font-mono text-scl-gray/60 mt-0.5 w-5 flex-shrink-0 text-right">
                {i + 1}
              </span>
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
          ← Edit text
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AnnotatingStep — per-item annotation text fields
//
// MARKER: ANNOTATION MODE
// This step only renders when annotationMode === "manual".
// All-or-nothing rule: every item must have a non-empty annotation
// before the user can continue to review.
// ═════════════════════════════════════════════════════════════════════════════

interface AnnotatingStepProps {
  items:       BibliographyItem[];
  annotations: string[];
  onConfirm:   (annotations: string[]) => void;
  onBack:      () => void;
}

function AnnotatingStep({ items, annotations: initialAnnotations, onConfirm, onBack }: AnnotatingStepProps) {
  const [annotations, setAnnotations] = useState<string[]>(
    // Preserve any previously entered values; fall back to item.annotation if going back from review
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
    const allFilled = annotations.every(a => a.trim());
    if (!allFilled) {
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
        <p className="text-sm text-scl-dark font-semibold">
          Add an annotation for each item
        </p>
        <p className="text-xs text-scl-gray mt-0.5">
          Keep each annotation to one or two sentences. 25 words is a good target.
          Every item must have an annotation before you can continue.
        </p>
      </div>

      {/* All-or-nothing error banner */}
      {showErrors && emptyCount > 0 && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50">
          <p className="text-xs font-semibold text-red-800">
            {emptyCount} item{emptyCount === 1 ? " is" : "s are"} missing an annotation.
          </p>
          <p className="text-xs text-red-700 mt-1">
            All items must have an annotation. Fill in the highlighted fields below,
            or go back and turn off annotations.
          </p>
        </div>
      )}

      {/* Per-item annotation fields */}
      <div className="flex flex-col gap-4 mb-6">
        {items.map((item, i) => {
          const isEmpty  = !annotations[i]?.trim();
          const hasError = showErrors && isEmpty;
          const wordCount = annotations[i]
            ? annotations[i].trim().split(/\s+/).filter(Boolean).length
            : 0;

          return (
            <div key={i}>
              {/* Item title as label */}
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

      {/* Actions */}
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
  warnings:   ParseWarning[];
  onGenerate: () => void;
  onBack:     () => void;
}

function ReviewStep({ form, items, warnings, onGenerate, onBack }: ReviewStepProps) {
  const stepNum = form.annotationMode === "manual" ? "4" : "3";

  return (
    <div>
      <StepLabel label={`Step ${stepNum} — Review`} onBack={onBack} />

      {/* Summary card */}
      <div className="rounded-lg border border-scl-rule bg-white overflow-hidden mb-5">
        <div className="h-1 bg-scl-orange" />
        <div className="p-4 flex flex-col gap-3">

          {/* Document title */}
          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Title</p>
            <p className="text-sm text-scl-dark mt-0.5">{form.title}</p>
          </div>

          {/* Age group */}
          {form.ageGroup && (
            <div>
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Age group</p>
              <p className="text-sm text-scl-dark mt-0.5">{form.ageGroup}</p>
            </div>
          )}

          {/* Prepared by */}
          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Prepared by</p>
            <p className="text-sm text-scl-dark mt-0.5">{form.preparedBy}</p>
          </div>

          {/* Date */}
          <div>
            <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Date</p>
            <p className="text-sm text-scl-dark mt-0.5">{todayStr()}</p>
          </div>

          {/* Digital resources */}
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
              <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide">Annotations</p>
              <p className="text-sm text-scl-dark mt-0.5">
                {form.annotationMode === "manual" ? "Yes — all items annotated" : "None"}
              </p>
            </div>
            {warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Skipped lines</p>
                <p className="text-sm text-amber-700 mt-0.5">{warnings.length}</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Actions */}
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
// ResultStep — download buttons + summary
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

      {/* Result card */}
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

          <div className="mt-4 flex flex-wrap gap-3">
            {/* DOCX download — primary */}
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

            {/* JSON download — secondary */}
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

      {/* Start over */}
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
