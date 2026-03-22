/**
 * src/components/ui/ErrorCard.tsx
 *
 * Reusable product-shaped error display component.
 *
 * WHY THIS FILE EXISTS:
 * All meaningful errors in the app should be product-shaped:
 * - What happened (message)
 * - What it affects (affects — optional)
 * - What to do next (action — optional)
 *
 * This component renders any AppError in that consistent format.
 * Used by: ISBN Blooper, text bibliography flow, cover bibliography flow.
 *
 * WHAT THIS IS NOT:
 * - Not a raw error dump — never show stack traces here
 * - Not a toast/notification — this is an inline error card
 *
 * SAFE TO EDIT:
 * - Styling (colors, icons, spacing)
 * - Add/remove optional fields
 * - Add a "dismiss" button if needed
 */

import type { AppError } from "@/types";

// ── Category labels and colors ─────────────────────────────────────────────────
// Maps error category to a human-readable prefix and a color scheme.
const CATEGORY_DISPLAY: Record<
  AppError["category"],
  { label: string; bgClass: string; borderClass: string; textClass: string }
> = {
  input_format: {
    label:       "Input problem",
    bgClass:     "bg-amber-50",
    borderClass: "border-amber-300",
    textClass:   "text-amber-800",
  },
  workflow_rule: {
    label:       "Workflow error",
    bgClass:     "bg-amber-50",
    borderClass: "border-amber-300",
    textClass:   "text-amber-800",
  },
  external_service: {
    label:       "Service error",
    bgClass:     "bg-red-50",
    borderClass: "border-red-300",
    textClass:   "text-red-800",
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ErrorCardProps {
  error:     AppError;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ErrorCard({ error, className = "" }: ErrorCardProps) {
  const display = CATEGORY_DISPLAY[error.category] ?? CATEGORY_DISPLAY.external_service;

  return (
    <div
      className={`rounded-lg border p-4 ${display.bgClass} ${display.borderClass} ${className}`}
      role="alert"
    >
      {/* Category badge */}
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${display.textClass}`}>
        {display.label}
      </p>

      {/* What happened */}
      <p className={`text-sm font-medium ${display.textClass}`}>
        {error.message}
      </p>

      {/* What it affects (optional) */}
      {error.affects && (
        <p className={`text-sm mt-1 ${display.textClass} opacity-80`}>
          Affects: {error.affects}
        </p>
      )}

      {/* What to do next (optional) */}
      {error.action && (
        <p className={`text-sm mt-2 ${display.textClass} font-medium`}>
          → {error.action}
        </p>
      )}
    </div>
  );
}
