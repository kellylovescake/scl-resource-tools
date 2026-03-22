/**
 * src/app/page.tsx
 *
 * Home page — mode selection screen.
 *
 * WHY THIS FILE EXISTS:
 * This is the first screen staff see when they open the app.
 * Its only job is to show the three available modes and let the user pick one.
 *
 * WHAT LIVES HERE:
 * - Mode selection cards (ISBN Blooper, Text-Only Bibliography, Cover Bibliography)
 * - Brief description of each mode so staff know which to choose
 *
 * WHAT DOES NOT LIVE HERE:
 * - Workflow logic (that lives in the mode-specific pages and src/core/)
 * - Form inputs (those are on the workflow pages)
 *
 * MARKER: MODE ROUTING
 * The three links below route to the three workflow pages.
 * Adding a new mode means: add a card here, add a route under src/app/,
 * add the engine logic to src/core/.
 *
 * SAFE TO EDIT:
 * - Card text and descriptions
 * - Layout adjustments
 * - Add/remove modes (update routing accordingly)
 */

import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type ModeStatus = "ready" | "coming-soon";

interface ModeConfig {
  route:       string;
  title:       string;
  subtitle:    string;
  description: string;
  // Explicit ModeStatus type (not inferred) so TypeScript allows both values
  // in the ModeCard component even when all entries are currently "coming-soon".
  status:      ModeStatus;
  icon:        string;
}

// ── Mode card data ─────────────────────────────────────────────────────────────
// Each mode has a route, title, subtitle, description, and a status indicator.
// Status: "ready" | "coming-soon" — controls whether the card is a live link.
// To activate a mode as it is completed, change its status to "ready".
//
// MARKER: MODE ROUTING
// To add a new mode: add an entry here, create src/app/{route}/page.tsx,
// and add the engine logic to src/core/.
const MODES: ModeConfig[] = [
  {
    route: "/blooper",
    title: "ISBN Blooper",
    subtitle: "Single-item lookup",
    description:
      "Look up one ISBN and get a clean metadata record: title, author, publisher, publication date, cover image, and source. Useful for quick catalog verification.",
    status: "ready",
    icon: "🔍",
  },
  {
    route: "/text-bibliography",
    title: "Text Bibliography",
    subtitle: "Formatted reading list",
    description:
      "Paste a staff export from the ILS, review the parsed items, optionally add annotations, and download a branded DOCX reading list. No covers.",
    status: "ready",
    icon: "📄",
  },
  {
    route: "/cover-bibliography",
    title: "Cover Bibliography",
    subtitle: "Visual reading list with book covers",
    description:
      "Paste a staff export and an RSS feed from the same ILS list. The app merges them, fetches cover images, and downloads a branded DOCX with cover art beside each title.",
    status: "ready",
    icon: "📚",
  },
];

// ── Home page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div>

      {/* ── Page heading ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-scl-dark">
          What would you like to create?
        </h1>
        <p className="mt-1 text-scl-gray text-sm">
          Choose a workflow below. Each one will walk you through the steps.
        </p>
      </div>

      {/* ── Orange rule ────────────────────────────────────────────────────── */}
      <div className="scl-rule mb-8" />

      {/* ── Mode cards grid ────────────────────────────────────────────────── */}
      {/*
       * Desktop-first: three columns side by side on wide screens,
       * stacks to one column on mobile.
       */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {MODES.map((mode) => (
          <ModeCard key={mode.route} mode={mode} />
        ))}
      </div>

      {/* ── Help text ──────────────────────────────────────────────────────── */}
      <div className="mt-10 p-4 bg-scl-light rounded border border-scl-rule text-sm text-scl-gray">
        <p className="font-semibold text-scl-dark mb-1">Not sure which to use?</p>
        <ul className="space-y-1 list-none">
          <li>→ Use <strong>ISBN Blooper</strong> to check a single book&apos;s metadata or cover.</li>
          <li>→ Use <strong>Text Bibliography</strong> for a clean numbered list — no covers needed.</li>
          <li>→ Use <strong>Cover Bibliography</strong> when you want cover art on the handout. Requires the RSS feed from the same ILS list.</li>
        </ul>
      </div>

    </div>
  );
}

// ── ModeCard component ─────────────────────────────────────────────────────────
// Renders one mode option. If status is "ready", it's a clickable link.
// If "coming-soon", it's a visual placeholder (not yet linked).
function ModeCard({ mode }: { mode: ModeConfig }) {
  const baseClass =
    "border-t-4 border-scl-orange rounded-lg p-5 shadow-sm bg-white";

  const inner = (
    <>
      <div className="text-2xl mb-3" aria-hidden="true">
        {mode.icon}
      </div>
      <h2 className="text-base font-bold text-scl-dark">{mode.title}</h2>
      <p className="text-xs text-scl-orange font-medium uppercase tracking-wide mt-0.5 mb-2">
        {mode.subtitle}
      </p>
      <p className="text-sm text-scl-gray leading-relaxed">{mode.description}</p>

      {mode.status === "coming-soon" && (
        <p className="mt-4 text-xs text-scl-gray italic">Coming soon&hellip;</p>
      )}

      {mode.status === "ready" && (
        <p className="mt-4 text-xs text-scl-orange font-semibold">
          Start &rarr;
        </p>
      )}
    </>
  );

  if (mode.status === "ready") {
    return (
      <Link href={mode.route} className={baseClass + " hover:shadow-md transition-shadow block"}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={baseClass + " opacity-70 cursor-not-allowed"}>
      {inner}
    </div>
  );
}
