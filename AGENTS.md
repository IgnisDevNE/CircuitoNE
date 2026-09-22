# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Rules

- Everything in this project follows TDD. Write or update the test first, confirm it fails for the expected reason, implement the smallest change that makes it pass, and then refactor while keeping the tests green.
- Every pull request must be validated in homologation before production. Use the dedicated Supabase homologation database `CircuitoNE-dev` on GitHub first, apply and validate migrations there, and only promote the change after homologation succeeds. Do not test schema changes directly against the production database.
- After each pull request is approved and completed, clean up branches so that only `main` remains. Before starting new work, create a fresh branch from the updated `main`.

## GitHub Agent Identity

- Use `node scripts/github-app.mjs gh <args>` for GitHub operations and `node scripts/github-app.mjs git <args>` for authenticated Git operations and commits. These commands use the `ignisdevne` App with a temporary token scoped to this repository.
- Do not fall back to the saved human GitHub credentials when App access is denied. Report the missing permission; keep review and branch protections intact.
- Never commit or print files from `secrets/`, private keys, or tokens. The helper also accepts `GITHUB_APP_PRIVATE_KEY_FILE` for an external key path.
- The App is installed across the IgnisDevNE organization. Canonical acceptance tests must be controlled outside this App's installations. Local helpers/instructions do not replace credential and execution isolation; see `docs/engineering/delivery.md`.

## Documentation Locations

All paths below are relative to the repository root:

- Architecture Decision Records (ADRs): `docs/decisions/`
- Specifications, technical requirements, and architecture/infrastructure contracts: `docs/specs/` (see its index; approved target architecture is not necessarily implemented)
- Database migration files: `docs/migrations/`
- Business rules: `docs/business-rules/`

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
