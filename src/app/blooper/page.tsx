/**
 * src/app/blooper/page.tsx
 *
 * ISBN Blooper — single-ISBN lookup workflow.
 *
 * WHY THIS FILE EXISTS:
 * The Blooper is a self-contained single-item workflow:
 *   1. Staff enters one ISBN
 *   2. App looks it up (metadata + cover)
 *   3. App shows a clean metadata record card
 *
 * This file is a Client Component (because it manages form state and
 * makes fetch calls). The actual lookup happens server-side via the
 * API route at /api/isbn-blooper.
 *
 * MARKER: ISBN BLOOPER DISPLAY
 * The result card at the bottom of this file (BlooperResultCard) is where
 * the IsbnBlooperResult fields are rendered for staff.
 * The display order, field labels, and "Copy JSON" action are all here.
 *
 * WHAT IS IN THIS FILE:
 * - BlooperPage: top-level page component (form + results orchestration)
 * - IsbnInputForm: the ISBN entry form with sample loader
 * - BlooperResultCard: the polished metadata display card
 * - CoverDisplay: the cover image or placeholder box
 * - CopyJsonButton: the copy-to-clipboard action
 *
 * WHAT IS NOT IN THIS FILE:
 * - Lookup logic (src/core/isbnService.ts)
 * - HTTP handling (src/app/api/isbn-blooper/route.ts)
 *
 * SAFE TO EDIT:
 * - Field labels and display order in BlooperResultCard
 * - Sample ISBN (change SAMPLE_ISBN constant)
 * - Placeholder text and helper text
 * - Card styling
 */

"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import ErrorCard from "@/components/ui/ErrorCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { IsbnBlooperResult, AppError } from "@/types";

// ── Sample ISBN ───────────────────────────────────────────────────────────────
// Pre-fill for the "Try a sample" button.
// Using a known dinosaur book from the test fixtures.
const SAMPLE_ISBN = "9780375859588"; // The Big Golden Book of Dinosaurs

// ── Page state type ───────────────────────────────────────────────────────────
type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: IsbnBlooperResult }
  | { status: "error";   error: AppError };

// ═════════════════════════════════════════════════════════════════════════════
// BlooperPage — top-level component
// ═════════════════════════════════════════════════════════════════════════════
export default function BlooperPage() {
  const [pageState, setPageState] = useState<PageState>({ status: "idle" });
  const [isbnValue, setIsbnValue] = useState("");

  // ── Lookup handler ─────────────────────────────────────────────────────────
  const handleLookup = useCallback(async (isbn: string) => {
    const trimmed = isbn.trim();
    if (!trimmed) return;

    setPageState({ status: "loading" });

    try {
      const res = await fetch("/api/isbn-blooper", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isbn: trimmed }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setPageState({
          status: "error",
          error:  json.error ?? {
            category: "external_service",
            message:  "An unexpected error occurred.",
            action:   "Try again.",
          },
        });
      } else {
        setPageState({ status: "success", result: json.result });
      }
    } catch {
      setPageState({
        status: "error",
        error:  {
          category: "external_service",
          message:  "Could not reach the server.",
          action:   "Check your connection and try again.",
        },
      });
    }
  }, []);

  // ── Reset handler ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPageState({ status: "idle" });
    setIsbnValue("");
  }, []);

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
        <h1 className="text-2xl font-bold text-scl-dark">ISBN Blooper</h1>
        <p className="mt-1 text-sm text-scl-gray">
          Look up one ISBN and see the full metadata record — title, author,
          publisher, cover image, and source.
        </p>
      </div>

      {/* ── Orange rule ────────────────────────────────────────────────────── */}
      <div className="scl-rule mb-6" />

      {/* ── ISBN input form ─────────────────────────────────────────────────── */}
      <IsbnInputForm
        value={isbnValue}
        onChange={setIsbnValue}
        onSubmit={handleLookup}
        loading={pageState.status === "loading"}
      />

      {/* ── Results area ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        {pageState.status === "loading" && (
          <div className="flex justify-center py-12">
            <LoadingSpinner label="Looking up ISBN…" size="lg" />
          </div>
        )}

        {pageState.status === "error" && (
          <div>
            <ErrorCard error={pageState.error} />
            <button
              onClick={handleReset}
              className="mt-3 text-sm text-scl-orange hover:underline"
            >
              Try a different ISBN
            </button>
          </div>
        )}

        {pageState.status === "success" && (
          <div>
            {/* MARKER: ISBN BLOOPER DISPLAY */}
            <BlooperResultCard result={pageState.result} />
            <button
              onClick={handleReset}
              className="mt-4 text-sm text-scl-orange hover:underline"
            >
              Look up another ISBN
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// IsbnInputForm
// ═════════════════════════════════════════════════════════════════════════════

interface IsbnInputFormProps {
  value:    string;
  onChange: (val: string) => void;
  onSubmit: (isbn: string) => void;
  loading:  boolean;
}

function IsbnInputForm({ value, onChange, onSubmit, loading }: IsbnInputFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  const handleSample = () => {
    onChange(SAMPLE_ISBN);
    // Focus the input so the user can see what loaded
    inputRef.current?.focus();
    // Auto-submit with the sample
    onSubmit(SAMPLE_ISBN);
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">

        {/* Label and helper text */}
        <div>
          <label
            htmlFor="isbn-input"
            className="block text-sm font-semibold text-scl-dark mb-1"
          >
            ISBN
          </label>
          <p className="text-xs text-scl-gray mb-2">
            Enter a 10 or 13 digit ISBN. Hyphens and spaces are OK.{" "}
            <span className="italic">
              You&apos;ll find the ISBN on the back of the book, usually below the barcode.
            </span>
          </p>
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id="isbn-input"
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 978-0-375-85958-8"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            className={`
              flex-1 rounded border px-3 py-2 text-sm font-mono
              border-scl-rule bg-white text-scl-dark
              placeholder:text-scl-gray/50
              focus:outline-none focus:border-scl-orange focus:ring-1 focus:ring-scl-orange
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className={`
              px-4 py-2 rounded text-sm font-semibold
              bg-scl-orange text-white
              hover:opacity-90 transition-opacity
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {loading ? "Looking up…" : "Look up"}
          </button>
        </div>

      </form>

      {/* Sample loader */}
      <div className="mt-3">
        <button
          type="button"
          onClick={handleSample}
          disabled={loading}
          className="text-xs text-scl-gray hover:text-scl-orange transition-colors disabled:opacity-40"
        >
          Try a sample →
        </button>
        <span className="text-xs text-scl-gray/60 ml-1">
          loads a known dinosaur book
        </span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BlooperResultCard
//
// MARKER: ISBN BLOOPER DISPLAY
// This card renders an IsbnBlooperResult as a clean metadata record.
// It is intentionally NOT an API debugger — the rawJson is behind a
// "Copy JSON" button, not displayed inline.
// ═════════════════════════════════════════════════════════════════════════════

interface BlooperResultCardProps {
  result: IsbnBlooperResult;
}

function BlooperResultCard({ result }: BlooperResultCardProps) {
  return (
    <div className="rounded-lg border border-scl-rule bg-white shadow-sm overflow-hidden">

      {/* Orange top accent */}
      <div className="h-1 bg-scl-orange" />

      <div className="p-5">
        <div className="flex gap-5">

          {/* ── Cover image column ────────────────────────────────────────── */}
          <div className="flex-shrink-0">
            <CoverDisplay result={result} />
          </div>

          {/* ── Bibliographic details column ──────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Title */}
            <h2 className="text-base font-bold text-scl-dark leading-snug">
              {result.title}
            </h2>

            {/* Author */}
            {result.author && (
              <p className="text-sm text-scl-gray mt-0.5">
                {result.author}
              </p>
            )}

            {/* Publisher and date */}
            {(result.publisher || result.publishDate) && (
              <p className="text-sm text-scl-gray mt-2">
                {[result.publisher, result.publishDate].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* ISBN row */}
            <div className="mt-3 flex flex-wrap gap-3">
              <IsbnBadge label="ISBN-13" value={result.isbn13} />
              {result.isbn10 && (
                <IsbnBadge label="ISBN-10" value={result.isbn10} />
              )}
            </div>

            {/* Source attribution */}
            <div className="mt-3 flex flex-wrap gap-2">
              <SourceBadge
                label="Metadata"
                value={SOURCE_LABELS[result.metadataSource]}
                muted={result.metadataSource === "none"}
              />
              {result.hasCover && result.coverSource && (
                <SourceBadge
                  label="Cover"
                  value={COVER_SOURCE_LABELS[result.coverSource]}
                />
              )}
            </div>

            {/* Subjects (if available, up to 3) */}
            {result.subjects && result.subjects.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-scl-gray uppercase tracking-wide mb-1">
                  Subjects
                </p>
                <p className="text-xs text-scl-gray">
                  {result.subjects.slice(0, 3).join(" · ")}
                </p>
              </div>
            )}

            {/* Cover warning */}
            {result.coverWarning && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                ⚠ {result.coverWarning}
              </div>
            )}

            {/* Copy JSON button */}
            <div className="mt-4 pt-3 border-t border-scl-rule">
              <CopyJsonButton rawJson={result.rawJson} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Source label maps ─────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<IsbnBlooperResult["metadataSource"], string> = {
  open_library:  "Open Library",
  google_books:  "Google Books",
  none:          "Not found",
};

const COVER_SOURCE_LABELS: Record<
  Exclude<IsbnBlooperResult["coverSource"], undefined>,
  string
> = {
  syndetics:    "Syndetics",
  google_books: "Google Books",
};

// ═════════════════════════════════════════════════════════════════════════════
// CoverDisplay
// Shows the cover image if found, or a styled placeholder if not.
// ═════════════════════════════════════════════════════════════════════════════

function CoverDisplay({ result }: { result: IsbnBlooperResult }) {
  // Cover display size: larger than DOCX output for screen readability
  // ~120px wide × ~160px tall — roughly same 3:4 portrait ratio as book covers
  const SIZE_CLASS = "w-[100px] h-[140px]";

  if (result.hasCover && result.coverImageData) {
    return (
      <div className={`${SIZE_CLASS} rounded overflow-hidden shadow-sm border border-scl-rule flex-shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${result.coverImageData}`}
          alt={`Cover of ${result.title}`}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // No cover placeholder
  return (
    <div
      className={`
        ${SIZE_CLASS} rounded border border-dashed border-scl-rule
        bg-scl-light flex flex-col items-center justify-center
        flex-shrink-0 text-center p-2
      `}
      aria-label="No cover available"
    >
      <span className="text-2xl mb-1" aria-hidden="true">📖</span>
      <span className="text-[10px] text-scl-gray leading-tight">No cover found</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CopyJsonButton
// Copies the raw JSON payload to the clipboard. Shows brief feedback.
// ═════════════════════════════════════════════════════════════════════════════

function CopyJsonButton({ rawJson }: { rawJson: object }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in non-HTTPS contexts — gracefully ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-scl-gray hover:text-scl-orange transition-colors flex items-center gap-1.5"
      aria-label="Copy JSON metadata to clipboard"
    >
      <span aria-hidden="true">{copied ? "✓" : "{}"}</span>
      <span>{copied ? "Copied!" : "Copy JSON"}</span>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Small display primitives
// ═════════════════════════════════════════════════════════════════════════════

function IsbnBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-semibold text-scl-gray uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xs font-mono text-scl-dark">{value}</span>
    </div>
  );
}

function SourceBadge({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
        border ${muted
          ? "border-scl-rule text-scl-gray bg-scl-light"
          : "border-scl-orange/30 text-scl-orange bg-scl-light"
        }
      `}
    >
      <span className="font-semibold">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
