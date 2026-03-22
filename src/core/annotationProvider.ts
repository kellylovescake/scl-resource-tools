/**
 * src/core/annotationProvider.ts
 *
 * Annotation provider interface and V1 implementation (manual only).
 *
 * WHY THIS FILE EXISTS:
 * Annotations are an optional enrichment layer on top of bibliography items.
 * V1 only supports manual annotations entered by staff.
 * Future: AI-generated annotations plugged in here without touching the rest
 * of the engine.
 *
 * MARKER: ANNOTATION MODE
 * This is the seam where annotation generation lives.
 *
 * V1 behavior:
 * - "none": no annotations on any item
 * - "manual": staff typed annotations are passed through as-is
 *
 * MARKER: FUTURE AI ANNOTATION PROVIDER
 * To add AI-generated annotations:
 * 1. Add "ai" to the AnnotationMode type in src/types/index.ts
 * 2. Implement an AiAnnotationProvider below that accepts items and
 *    returns annotations from Claude (or another AI)
 * 3. Update getAnnotationProvider() to return it when mode === "ai"
 * 4. The AI provider would receive BibliographyItems and return the same
 *    items with the `annotation` field populated
 *
 * Annotation guidelines (from ANNOTATED_SKILL.md):
 * - Exactly 1 sentence
 * - Plain declarative — no "This book…" opener, no marketing language
 * - Focus on topic, angle, audience, usefulness
 * - Under 20 words is ideal; 25 is the hard cap
 * - Do not editorialize ("excellent," "must-read")
 *
 * SAFE TO EDIT:
 * - Add new provider implementations
 * - Update the provider selection logic in getAnnotationProvider()
 */

import type { BibliographyItem, AnnotationMode } from "@/types";

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * AnnotationProvider
 *
 * The contract for any annotation implementation.
 * V1 has one (ManualAnnotationProvider).
 * Future AI provider would implement this same interface.
 */
export interface AnnotationProvider {
  /**
   * annotate(items)
   * Takes items and returns them with the `annotation` field populated.
   * For manual: items must already have `annotation` set by the UI.
   * For AI: this would call the AI service and fill in annotations.
   */
  annotate(items: BibliographyItem[]): Promise<BibliographyItem[]>;
}

// ── V1 Implementation: Manual Annotation Provider ────────────────────────────

/**
 * ManualAnnotationProvider
 *
 * Simply validates that all items have a non-empty annotation and returns them.
 * The actual annotation text was entered by staff in the web UI and is already
 * on each BibliographyItem when this is called.
 *
 * Throws if any item is missing an annotation (all-or-nothing rule).
 *
 * MARKER: ANNOTATION MODE
 * The all-or-nothing rule is enforced here. If the UI already validated,
 * this is a safety net. Do not remove this check.
 */
class ManualAnnotationProvider implements AnnotationProvider {
  async annotate(items: BibliographyItem[]): Promise<BibliographyItem[]> {
    const missing = items.filter(item => !item.annotation?.trim());
    if (missing.length > 0) {
      throw new Error(
        `Annotations are missing for ${missing.length} item(s): ` +
        missing.map(i => i.title).join(", ") + ". " +
        "All items must have an annotation when annotations are enabled."
      );
    }
    // Items already have annotations — return as-is
    return items;
  }
}

// ── MARKER: FUTURE AI ANNOTATION PROVIDER ────────────────────────────────────
// Uncomment and implement when AI annotations are ready:
//
// class AiAnnotationProvider implements AnnotationProvider {
//   constructor(private readonly goal: string) {}
//   async annotate(items: BibliographyItem[]): Promise<BibliographyItem[]> {
//     // Call Claude API (or other AI service) here
//     // Pass each item's title and author
//     // Return items with annotation field populated
//     throw new Error("AI annotation provider not yet implemented");
//   }
// }

// ── Provider factory ──────────────────────────────────────────────────────────

/**
 * getAnnotationProvider(mode)
 *
 * Returns the appropriate provider for the given annotation mode.
 * This is the switch point — adding a new mode means adding a case here.
 */
export function getAnnotationProvider(
  mode: AnnotationMode,
): AnnotationProvider | null {
  switch (mode) {
    case "none":
      // No annotations — return null so the engine knows to skip this step
      return null;

    case "manual":
      return new ManualAnnotationProvider();

    // MARKER: FUTURE AI ANNOTATION PROVIDER
    // case "ai":
    //   return new AiAnnotationProvider(options.goal);

    default:
      throw new Error(`Unknown annotation mode: ${mode}`);
  }
}
