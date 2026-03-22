/**
 * src/core/colorways.ts
 *
 * SCL brand color constants and document layout dimensions.
 * Used by the DOCX builder (buildDocx.ts) for all three output modes.
 *
 * WHY THIS FILE EXISTS:
 * The original scripts each had their own copy of these constants.
 * Centralizing them here means a brand update happens in one place.
 *
 * MARKER: COLORWAY POLICY
 * These are the authoritative DOCX color values for the SCL brand.
 * The web UI uses matching colors defined in tailwind.config.ts,
 * but the web and print layers are intentionally separate — changes
 * here affect the printed document; changes in tailwind.config.ts
 * affect the web UI only.
 *
 * WHAT IS SAFE TO EDIT:
 * - Change hex values if branding is updated (update tailwind.config.ts to match)
 * - Add new named colors if new document modes are introduced
 *
 * MARKER: FUTURE AI STYLE SELECTION
 * V1 uses a single fixed colorway (SCL brand palette below).
 * Future: an AI-driven style selector could choose from multiple colorways
 * based on the bibliography's subject or audience. The switch point would be:
 *   - Define additional colorway objects (e.g., COLORWAY_YOUTH, COLORWAY_SEASONAL)
 *   - Pass the selected colorway into buildDocx() instead of using the defaults
 *   - The AI annotation provider or a separate style provider could select it
 * This file would grow to export a ColorwayConfig type and multiple presets.
 * For now, the constants are exported directly and buildDocx.ts uses them.
 *
 * Note on colorway naming:
 * The original scripts used a "dino test palette" (green/brown/yellow).
 * That was a test-only variation — not a supported colorway. The SCL brand
 * palette is the only colorway in V1.
 */

// ── SCL Brand Colors (hex strings, no # prefix — docx library format) ─────────
export const SCL_ORANGE = "C97C2E";   // Section headers, rules, accents
export const SCL_DARK   = "1A1A1A";   // Primary text, titles
export const SCL_GRAY   = "6B6B6B";   // Secondary text, author/meta lines
export const SCL_LIGHT  = "FDF6EC";   // Title band background (warm off-white)
export const SCL_RULE   = "E8C99A";   // Light separator rules

// ── Annotation text color ─────────────────────────────────────────────────────
// Slightly lighter than SCL_GRAY to visually subordinate annotations.
// Source: ANNOTATED_SKILL.md — "8.5pt italic, #888888"
export const SCL_ANNOTATION = "888888";

// ── Page layout dimensions (in DXA units — 1 inch = 1440 DXA) ────────────────
// US Letter paper, 1-inch margins all sides.
// These match the original scripts exactly and must not change silently.
export const PAGE_W_DXA = 12240;         // 8.5 inches
export const PAGE_H_DXA = 15840;         // 11 inches
export const MARGIN     = 1440;          // 1 inch
export const CONTENT_W  = PAGE_W_DXA - MARGIN * 2; // 9360 DXA = 6.5 inches

// ── Logo dimensions ───────────────────────────────────────────────────────────
// These are exact values from the original scripts, derived from the actual
// scl-logo.png file dimensions. Do not change without measuring the new logo.
// EMU = English Metric Units (used internally by Word/OOXML)
export const LOGO_W_EMU = 1976438;
export const LOGO_H_EMU = 699355;
// Converted to pixels at 96dpi for docx ImageRun
export const LOGO_PX_W  = Math.round((LOGO_W_EMU / 914400) * 96); // ~207px ≈ 2.16"
export const LOGO_PX_H  = Math.round((LOGO_H_EMU / 914400) * 96); // ~73px  ≈ 0.76"

// ── Text-only bibliography column widths ──────────────────────────────────────
// Used by buildDocx.ts for the text-only and annotated layout.
// CALL_W is the right column for call numbers; TITLE_W is the rest.
import { convertInchesToTwip } from "docx";
export const CALL_W   = convertInchesToTwip(1.5); // 2160 DXA
export const TITLE_W  = CONTENT_W - CALL_W;        // 7200 DXA

// ── Cover bibliography column widths ──────────────────────────────────────────
// Used by buildDocx.ts for the cover layout.
// Source: COVER_SKILL.md design spec.
export const COVER_COL_W = convertInchesToTwip(0.85);  // Cover image column
export const COVER_GUTTER = convertInchesToTwip(0.15); // Gap between cover and text
export const TEXT_COL_W  = CONTENT_W - COVER_COL_W - COVER_GUTTER;

// ── Cover image display size ──────────────────────────────────────────────────
// Pixels at 96dpi. Portrait ratio ~2:3.
// Source: generate_cover_list.js and COVER_SKILL.md
export const COVER_PX_W = 61;   // ~0.64"
export const COVER_PX_H = 92;   // ~0.96"

// ── Footer column widths ──────────────────────────────────────────────────────
// Three-column invisible footer table: logo | page number | prepared by
// These match the original scripts.
export const FOOTER_COL_LOGO  = convertInchesToTwip(2.3);
export const FOOTER_COL_MID   = convertInchesToTwip(2.0);
export const FOOTER_COL_RIGHT = CONTENT_W - FOOTER_COL_LOGO - FOOTER_COL_MID;

// ── Annotation typography ─────────────────────────────────────────────────────
// Source: ANNOTATED_SKILL.md and generate_annotated_list.js
export const ANNOTATION_INDENT_TWIP = convertInchesToTwip(0.2);
export const ANNOTATION_SIZE = 17; // half-points = 8.5pt

// ── Library constants (used in document headers/footers) ─────────────────────
export const LIBRARY_NAME = "Sunflower County Library System";
export const LIBRARY_PHONE = "662-887-1672";
export const LIBRARY_WEBSITE = "https://sunflower.lib.ms.us/";
