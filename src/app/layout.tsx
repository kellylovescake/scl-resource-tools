/**
 * src/app/layout.tsx
 *
 * Root layout for SCL Resource Tools.
 *
 * WHY THIS FILE EXISTS:
 * In Next.js App Router, layout.tsx is the persistent shell that wraps every
 * page. It runs once and stays mounted as users navigate between pages.
 * This is where global fonts, metadata, and the app shell live.
 *
 * WHAT LIVES HERE:
 * - HTML document structure
 * - Page <title> and metadata defaults
 * - Global CSS import
 * - App shell (top bar with logo and app name)
 *
 * WHAT DOES NOT LIVE HERE:
 * - Business logic (that belongs in src/core/)
 * - Page-specific content (that belongs in page.tsx files)
 * - Authentication gates (V1 has no auth; if added later, put it here)
 *
 * SAFE TO EDIT:
 * - Update the app title/description in the metadata object
 * - Adjust the top bar layout or branding
 * - Add navigation links if the app grows
 *
 * MARKER: FUTURE AUTH CONFIG
 * If authentication is added later, this is where the auth provider/session
 * wrapper would be placed — wrapping {children} below.
 */

import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

// ── Page metadata ─────────────────────────────────────────────────────────────
// This appears in the browser tab and is used by search engines/social sharing.
export const metadata: Metadata = {
  title: "SCL Resource Tools",
  description:
    "Sunflower County Library System — staff tool for creating bibliographies and resource lists",
};

// ── Root layout ───────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        {/*
         * Thin branded header. Stays visible on every page.
         * Logo left, app name right of logo, subtle bottom rule.
         * Desktop-first: compact on small screens, comfortable on desktop.
         */}
        <header className="border-b border-scl-rule bg-scl-light">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">

            {/* SCL logo — sized to match footer logo proportions */}
            <Image
              src="/scl-logo.png"
              alt="Sunflower County Library System"
              width={138}   /* LOGO_PX_W from colorways — ~2.16" at 96dpi, scaled to ~1.44" */
              height={49}   /* LOGO_PX_H from colorways — proportional */
              priority      /* Load immediately — it's above the fold */
              className="h-10 w-auto"
            />

            {/* Vertical divider */}
            <div className="h-8 w-px bg-scl-rule" aria-hidden="true" />

            {/* App name */}
            <div>
              <span className="text-sm font-semibold text-scl-dark tracking-wide uppercase">
                Resource Tools
              </span>
              <span className="block text-xs text-scl-gray">
                Staff workspace
              </span>
            </div>

          </div>
        </header>

        {/* ── Main content area ─────────────────────────────────────────────── */}
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
          {children}
        </main>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        {/*
         * Minimal web footer — separate from the DOCX footer.
         * The DOCX footer (logo + page numbers + prepared by) is built in
         * src/core/buildDocx.ts. This web footer is just a simple attribution.
         */}
        <footer className="border-t border-scl-rule bg-scl-light mt-auto">
          <div className="max-w-5xl mx-auto px-6 py-3 text-xs text-scl-gray flex items-center justify-between">
            <span>Sunflower County Library System</span>
            <span>Staff use only</span>
          </div>
        </footer>

      </body>
    </html>
  );
}
