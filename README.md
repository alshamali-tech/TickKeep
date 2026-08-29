# TickKeep

Free, offline-first, browser-based time tracker and invoice generator.
No account. No cloud. No subscription. All data stays on the user's device.

**Tagline:** Free. Offline. No sign-up.

---

## Quick start

```bash
npm install
npm run dev      # local development
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

## Architecture

- **Vite + React 18 + TypeScript (strict)** — static SPA, no server runtime
- **Tailwind CSS v4** with CSS-variable theming (light/dark/system, no-flash bootstrap)
- **Zustand + persist** — the ledger lives in `localStorage` (debounced writes, quota-safe compaction, migration-proof merge on load, legacy `timevault-v1` key auto-migrated)
- **PDF** — jsPDF + autotable, code-split; loaded only when a PDF is generated
- **Hash routing** (`#/app/...`) — works on any static host with zero rewrite rules
- **PWA** — manifest + network-first service worker with the `SKIP_WAITING` update handshake; user data is *never* in the SW cache
- **Sync** — one JSON file (`tickkeep-backup.json`) moved between devices via the File System Access API (a Google Drive / OneDrive desktop-sync folder, or any local folder); conflict-safe pull that never overwrites without asking, plus optional scheduled auto-backup — no relay server
- **In-app E2E bench** (`#/app/tests`) — 50+ cases including a 1000-client / 1000-project / 1000-invoice / 100-teammate stress run; snapshots and restores your data, survives mid-run navigation

## Testing

Open the app → sidebar → **System → Test bench** → *Run all*.

The bench drives the real UI (clicks, typing, shortcuts, file imports), streams a log, times every case, and is safe on live data. It survives mid-run navigation and always returns you to the results.

Playwright specs live in `tests/e2e/` (config in `playwright.config.ts`, chromium + mobile projects):

- `multi-tab.spec.ts` — two tabs share storage; a timer started in one tab bills **exactly once**; writes propagate live.
- `pdf.spec.ts` — cold-start UI flow (client → project → entry → wizard) ending in a real `INV-xxxx.pdf` download.

Run: `npm run build`, `npm run preview`, then `npx playwright test`.

## Deploying (static — any CDN)

### Cloudflare Pages (recommended)

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` · Output directory: `dist`.
4. Deploy. Add your custom domain under **Custom domains** (Cloudflare handles the certificate).

### Vercel

Same repo → **Add New Project** → framework *Vite* → build `npm run build`, output `dist`. Add the domain in project settings.

Both are free tiers; both serve the service worker and hash routes correctly with no extra config.

## Production checklist (before you announce it)

| Item | Where | Action |
|---|---|---|
| Domain | `index.html`, `public/robots.txt`, `public/sitemap.xml` | Replace `tickkeep.app` with your real domain (3 files) |
| OG image | `index.html` → `og:image` / `twitter:image` | Host the PNG yourself (e.g. `public/og-image.png`) and point both tags at `/og-image.png`; a local SVG ships today |
| Donation link | `src/app/shell.tsx` → `DONATIONS` | Ko-fi handle (currently `mammonalshamali`) |
| Contact | `src/app/settings.tsx`, `src/app/legal.tsx`, landing footer | Email / LinkedIn (currently `mamoonalshamali@gmail.com`) |
| Legal contact | `src/app/legal.tsx` | Set the governing-law line in Terms |
| Analytics | — | None by design; do not add tracking (it's in the Privacy Policy) |
| Post-deploy smoke test | live site | Open landing → app, create an entry, reload (data must survive), toggle dark mode, generate a PDF, run the test bench once |

## Repo map

```
src/
  lib/        store (persist, merge-safe migrations), invoice engine + PDF,
              reports aggregation, collab merge, sync transports, undo stack,
              platform services (rates, chime, feature flags), e2e engine
  components/ ui kit, charts, icons
  app/        pages: dashboard, timer/entries, calendar, projects, clients,
              invoices, expenses, estimates, reports (+ builder), year review,
              sync, import, settings, tests, legal, landing, shell
public/       manifest, sw.js, icons, robots, sitemap, og-image
```

## Architecture decision records

- **ADR-001 — Sync strategy: single-file merge, not event sourcing.** Each device pushes one `tickkeep-backup.json`; merges union adds, apply last-write-wins per record with a deterministic content-hash tiebreak (so all devices converge), propagate deletes via tombstones, and take the max invoice number. *Rejected:* event-sourced device logs (more moving parts for a 1–5 person audience; the single file is inspectable, trivially restorable, and already stress-tested at 1000×1000 scale) and CRDTs (binary, hard to debug, overkill). Revisit if multi-writer conflicts become frequent in the wild.
- **ADR-002 — PDF engine: jsPDF + autotable, fixed-point layout.** All coordinates are absolute points; no `canvas.measureText`, no html2canvas screenshot pass, so output is byte-stable across browsers. Code-split — the ~130 KB gzip engine loads only when a PDF is generated. *Rejected:* pdfmake (adds a VFS font blob to the bundle for marginal gains at our three fixed templates).
- **ADR-003 — Timer: persisted event, not running process.** `activeTimer.startedAt` is an absolute timestamp written on punch-in; elapsed is always `Date.now() − startedAt`. Immune to tab throttling, sleep, crash, and restart; a 24h guard confirms runaway timers before saving.
- **ADR-004 — Storage defense in depth.** `navigator.storage.persist()` on boot, quota/usage estimation, a risk-graded banner with one-click export, folder auto-backup on an interval, receipt compression to ≤200 KB, and quota-safe persistence that strips base64 blobs before failing. Eviction is treated as probable, not possible.
- **ADR-005 — State: Zustand + localStorage persist (debounced, migration-proof).** One atomic snapshot per burst of mutations; legacy keys migrate forward; version bumps merge against fresh defaults instead of discarding. *Rejected:* Dexie/IndexedDB (extra async surface for a dataset that fits comfortably in localStorage at target scale; revisit past ~5 MB of data), Redux/React Query (no server state exists).
- **ADR-006 — Multi-tab: shared storage + BroadcastChannel guards.** Writes land in one storage key; a `tickkeep-collab` channel carries ledger-changed pings when team mode is on, and the bench verifies a timer started in one tab bills exactly once.

## License

Proprietary — TickKeep End-User License Agreement (EULA). All Rights Reserved. See [LICENSE](LICENSE).
