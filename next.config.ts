import type { NextConfig } from "next";

/**
 * next.config.ts
 *
 * Next.js configuration for SCL Resource Tools.
 *
 * WHY THIS FILE EXISTS:
 * Next.js reads this file at build time and dev server startup.
 * Most defaults are fine for this project. Additions here are intentional.
 *
 * SAFE TO EDIT:
 * - Add environment variable exposure under `env` if needed later
 * - Add redirects/rewrites if URL structure changes
 * - Add image domains if cover image proxying moves to next/image
 *
 * DO NOT:
 * - Disable TypeScript or ESLint checks without a good reason
 * - Add experimental features without testing on Vercel first
 */

const nextConfig: NextConfig = {
  // ---------------------------------------------------------------------------
  // MARKER: DEPLOYMENT CONFIG
  // Vercel handles Next.js deployments natively — no special output mode needed.
  // If you ever move to a different host (Docker, standalone Node, etc.),
  // uncomment `output: "standalone"` below and update deployment docs.
  // ---------------------------------------------------------------------------
  // output: "standalone",

  // Allow server-side code to use Node.js built-ins (needed for docx + fs in API routes)
  // This is the default for App Router API routes — listed here for clarity.
  serverExternalPackages: [],
};

export default nextConfig;
