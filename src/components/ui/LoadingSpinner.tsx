/**
 * src/components/ui/LoadingSpinner.tsx
 *
 * Reusable loading spinner with optional label.
 * Used during API calls (ISBN lookup, DOCX generation, etc.)
 *
 * SAFE TO EDIT: Styling, animation, label text defaults.
 */

interface LoadingSpinnerProps {
  label?: string;
  size?:  "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm:  "h-4 w-4 border-2",
  md:  "h-6 w-6 border-2",
  lg:  "h-8 w-8 border-2",
};

export default function LoadingSpinner({
  label = "Loading…",
  size  = "md",
}: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3 text-scl-gray" role="status" aria-live="polite">
      <div
        className={`rounded-full border-scl-orange border-t-transparent animate-spin ${SIZE_CLASSES[size]}`}
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
