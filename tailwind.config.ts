import type { Config } from "tailwindcss";

/**
 * tailwind.config.ts
 *
 * Tailwind CSS configuration for SCL Resource Tools.
 *
 * WHY THIS FILE EXISTS:
 * Tailwind is a utility-first CSS framework. This file tells it:
 * - Which files to scan for class names (so unused styles are stripped in production)
 * - Custom design tokens (colors, fonts) that match the SCL brand
 *
 * MARKER: COLORWAY POLICY (UI layer)
 * The colors defined here are the SCL brand palette used in the web UI.
 * These are SEPARATE from the DOCX colorway constants in src/core/colorways.ts,
 * which control the printed document output.
 * Both sets of constants should stay in sync if the brand ever changes.
 *
 * SAFE TO EDIT:
 * - Add new colors or spacing values as the UI grows
 * - The `scl-*` color names are stable references — use them in components
 *
 * FUTURE: If branding changes, update both this file AND src/core/colorways.ts
 */

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── SCL Brand Palette ──────────────────────────────────────────────
        // These match the constants in src/core/colorways.ts exactly.
        // SCL_ORANGE = "C97C2E" — used for section headers, rules, accents
        // SCL_DARK   = "1A1A1A" — used for primary text
        // SCL_GRAY   = "6B6B6B" — used for secondary/meta text
        // SCL_LIGHT  = "FDF6EC" — used for title band background
        // SCL_RULE   = "E8C99A" — used for light separator rules
        "scl-orange": "#C97C2E",
        "scl-dark":   "#1A1A1A",
        "scl-gray":   "#6B6B6B",
        "scl-light":  "#FDF6EC",
        "scl-rule":   "#E8C99A",
      },
      fontFamily: {
        // Use system sans-serif stack for the web UI.
        // Calibri is used in the DOCX output (controlled in colorways.ts).
        // Web UI does not need to match the print font exactly.
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
