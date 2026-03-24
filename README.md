# Smart Work Tracker (Chrome Extension)

Greenfield Chrome MV3 extension: Vite, CRXJS, React 18, TypeScript, Tailwind CSS.

- **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** — architecture, schemas, SUB-TASK 1–17
- **[docs/DEVELOPER_RUNBOOK.md](docs/DEVELOPER_RUNBOOK.md)** — dependencies, waves, PR workflow

## Prerequisites

- Node 18+ and npm (not Yarn, per plan)

## Scripts

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Vite + CRXJS dev build; load **`dist/`** unpacked |
| `npm run build`  | Typecheck + production build to `dist/`           |
| `npm run lint`   | ESLint                                            |
| `npm run test`   | Vitest (unit + `tests/integration`)               |
| `npm run format` | Prettier write                                    |

## Load the extension (unpacked)

1. Run `npm run dev` (or `npm run build` for production assets).
2. Chrome → **Extensions** → enable **Developer mode**.
3. **Load unpacked** → select this repo’s **`dist/`** folder.
4. **Popup:** toolbar icon. **Options:** extension details → Extension options. **Dashboard:** link from Options, or `chrome-extension://<id>/dashboard.html`.

## Google APIs (optional)

- **Per-user sign-in:** Everyone uses their own Google account at link time. The OAuth **Client ID** is the app registration in Google Cloud, not “the developer’s account.”
- **Without a build-time client:** In **Options**, paste an OAuth 2.0 **Web application** Client ID and add the shown **redirect URI** (`https://<extension-id>.chromiumapp.org/`) under Authorized redirect URIs.
- **With a build-time client:** Copy [`.env.example`](.env.example) to `.env`, set `VITE_GOOGLE_OAUTH_CLIENT_ID`, then `npm run build`.

## Project layout

- `src/popup` — hourly task log form (Zustand, IndexedDB, draft in `chrome.storage.local`)
- `src/options` — working hours, leave, notifications, Google link, Sheets ID, data reset
- `src/dashboard` — daily/monthly analytics (Recharts)
- `src/background` — alarms, notifications → open popup, sync/export hooks, keyboard command
- `src/shared` — Dexie DB, settings store, analytics engine, Google Drive/Sheets helpers, offline queue
- `manifest.config.ts` — MV3 manifest (`oauth2` included when client ID is set at build time)
# smart-work-tracker
