# D1 Upload — Web Client Spec

## Overview

A single-page web app that replicates the macOS D1 Upload utility as a hostable HTML page. It talks to the same Cloudflare Worker endpoints using the same token-based authentication. No build tooling — delivered as a single `index.html` file.

## Architecture

```
index.html (static, any host)
    │
    ├── fetch POST /upload          ─┐
    ├── fetch GET  /docs             ├─▶  Cloudflare Worker  ──▶  D1
    ├── fetch DELETE /docs/:path     │    (existing, unchanged
    └── fetch PATCH  /docs/:path    ─┘     except CORS headers)
```

The Worker requires one small change: CORS response headers so a browser on a different origin can call it. All other Worker logic is untouched.

---

## Worker Changes

**File:** `chat-stick/server/src/index.ts`

Add CORS headers to every response. The simplest approach is a helper that wraps any `Response` before it is returned:

```typescript
function withCORS(response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Upload-Token")
    return new Response(response.body, { status: response.status, headers })
}
```

Also handle `OPTIONS` preflight requests, which browsers send automatically before cross-origin requests with custom headers:

```typescript
if (request.method === "OPTIONS") {
    return withCORS(new Response(null, { status: 204 }))
}
```

No changes to endpoint logic.

---

## Web App

### Technology

- Vanilla HTML, CSS, JavaScript — no framework, no build step
- Single file: `D1/index.html`
- `localStorage` for token and server URL persistence
- Native browser `fetch()` for all API calls
- Native HTML5 drag-and-drop events for file upload

### Layout

Two-tab layout matching the macOS app structure:

```
┌─────────────────────────────────┐
│  [Upload]  [Library]            │  ← tab bar
├─────────────────────────────────┤
│                                 │
│         (active tab)            │
│                                 │
└─────────────────────────────────┘
```

A settings gear icon in the top-right corner opens the settings panel.

---

### Settings Panel

Shown as an overlay panel (not a separate page). Opens on gear icon click, closes on save or click-outside.

**Fields:**
- Server URL (text input, pre-filled from `localStorage` or default)
- Upload Token (password input, pre-filled from `localStorage`)

**Behaviour:**
- "Save" writes both values to `localStorage` and closes the panel
- If no token is saved, the panel opens automatically on first load
- Values persist across page refreshes and browser sessions

**Storage keys:**
```
d1upload_server_url   →  localStorage  (default: "https://m5-live.reinholdmess444.workers.dev")
d1upload_token        →  localStorage
```

---

### Upload Tab

Mirrors the macOS drop zone view.

**States:**

| State | Display |
|---|---|
| Idle | Dashed border box, arrow-down icon, "Drop a text file here" in muted text |
| Drag hover | Border and icon switch to accent colour, text changes to "Drop to upload" |
| Uploading | Spinner replaces drop content, "Uploading…" label |
| Success | Green banner at top of tab area |
| Error | Red banner at top of tab area |

**File handling:**
- Accept via drag-and-drop onto the drop zone div
- Also accept via a fallback "or click to browse" link that triggers a hidden `<input type="file">`
- Read file content with `FileReader.readAsText()` (UTF-8 default, no encoding fallback needed for MVP)
- Path sent as `"library/" + filename` to match the macOS app behaviour
- Banner shows: path · file size (formatted) · chunk count
- Banner has an × dismiss button; does not auto-dismiss

**API call:**
```
POST {serverURL}/upload
Headers: Content-Type: application/json, X-Upload-Token: {token}
Body: { "title": "library/filename.txt", "content": "..." }
```

**Error cases to surface:**
- No token configured → show inline prompt to open settings
- Network error → red banner with error message
- Non-200 response → red banner with server error field or HTTP status

---

### Library Tab

Mirrors the macOS LibraryView.

**States:**

| State | Display |
|---|---|
| Loading | Spinner centred in tab area |
| Empty | "No documents uploaded yet" in muted text |
| Loaded | Table of documents |
| Error | Red banner at top of tab area |

**Document table columns:**
- Icon (document icon, decorative)
- Path
- Size (formatted, e.g. "27.7 KB")
- Chunks
- Updated date
- Actions menu (⋯ button per row)

**Actions menu (per row):**
- Rename
- Delete (destructive, shown in red)

**Rename flow:**
1. Click Rename → inline modal appears (centred overlay)
2. Modal shows current path, text input pre-filled with current path
3. "Rename" button submits, "Cancel" dismisses
4. On success: update the row in-place without refetching the full list
5. On error: show red banner inside modal

**Delete flow:**
1. Click Delete → confirmation dialog: `Delete "filename"? This cannot be undone.`
2. Two buttons: Cancel, Delete (red)
3. On confirm: call DELETE endpoint, remove row from list on success
4. On error: show error banner in the tab area

**Refresh:**
- Refresh button (↺) in the top-right of the tab area
- Tab fetches the list automatically on first activation and on each subsequent tab switch

**API calls:**
```
GET    {serverURL}/docs                    → list
DELETE {serverURL}/docs/{encodedPath}      → delete
PATCH  {serverURL}/docs/{encodedPath}      → rename
  Body: { "new_path": "new-name.txt" }
```

Path encoding: `encodeURIComponent(path)` to handle paths with `/` characters.

---

## Visual Design

Match the macOS app's minimal aesthetic. No external CSS frameworks.

**Palette:**
- Background: `#1e1e1e` (dark, matches macOS dark mode default)
- Surface: `#2a2a2a`
- Border: `#3a3a3a`
- Accent: `#0a84ff` (macOS system blue)
- Text primary: `#f0f0f0`
- Text secondary: `#888`
- Success background: `rgba(48, 209, 88, 0.12)` (macOS system green tint)
- Error background: `rgba(255, 69, 58, 0.12)` (macOS system red tint)

**Typography:**
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Base size: 14px

**Spacing and shape:**
- Border radius: 8px for cards/panels, 6px for buttons and inputs
- Consistent 12–20px padding

---

## File Structure

```
D1/
└── index.html      ← entire app (HTML + CSS + JS inline)
```

No dependencies, no package.json, no build step. The file can be opened directly in a browser or served from any static host.

---

## Hosting

Recommended: Cloudflare Pages (free tier, deploys from a git push or a direct upload of the `D1/` folder). Any static host works equally well.

---

## Non-Goals

- No batch / multi-file upload
- No file preview or content viewing
- No authentication beyond the static token
- No dark/light mode toggle (dark only)
- No mobile-optimised layout (desktop-first, usable on mobile without special handling)
- No service worker / offline support
- No TypeScript or build tooling

---

## Implementation Tasks

1. **Worker: add CORS** — `withCORS` helper + OPTIONS preflight handler in `index.ts`
2. **HTML skeleton** — tab bar, settings panel, upload tab shell, library tab shell
3. **Settings panel** — form, localStorage read/write, auto-open on missing token
4. **Upload tab** — drop zone drag events, file input fallback, FileReader, fetch POST, banners
5. **Library tab — list** — fetch GET /docs on tab activate, render table, loading/empty/error states
6. **Library tab — delete** — confirmation dialog, fetch DELETE, row removal
7. **Library tab — rename** — modal, fetch PATCH, in-place row update
8. **Polish** — visual states, transitions, consistent error handling, refresh button
