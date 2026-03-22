/**
 * jest.config.js
 *
 * Jest configuration for SCL Resource Tools.
 * Written as plain CommonJS (.js) to avoid needing ts-node as a dependency.
 *
 * WHY THIS FILE EXISTS:
 * Jest is the test runner. This file tells it:
 * - How to handle TypeScript files (via ts-jest)
 * - How to resolve the @/* path alias (must match tsconfig.json paths)
 * - Where to find tests
 *
 * HOW TO RUN TESTS:
 *   npm test                    — run all tests once
 *   npm test -- --watch         — re-run tests on file changes
 *   npm test -- --coverage      — run with coverage report
 *
 * SAFE TO EDIT:
 * - testMatch: add new patterns if tests move to different directories
 * - Add new moduleNameMapper entries if new path aliases are added to tsconfig.json
 */

/** @type {import("jest").Config} */
const config = {
  // Use ts-jest to transform TypeScript files on the fly
  preset: "ts-jest",
  testEnvironment: "node",

  // Resolve the @/* alias to match tsconfig.json paths
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Where to look for test files
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.spec.ts",
  ],

  // Files to exclude from test discovery
  testPathIgnorePatterns: [
    "/node_modules/",
    "/.next/",
    "/_reference/",
  ],

  // ts-jest config: use the project's tsconfig.json
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },

  // Optional: collect coverage when running with --coverage flag
  collectCoverageFrom: [
    "src/core/**/*.ts",
    "!src/core/buildDocx.ts", // Excluded: requires file system for logo
  ],
};

module.exports = config;
