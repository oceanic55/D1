# D1 Upload — Web Client

## Overview

A static web client for the D1 Upload system. Mirrors the macOS SwiftUI app in functionality across four tabs: Upload, Library, LLM, and Instruction. No build tooling — two files delivered as plain HTML and JavaScript.

## File Structure

```
web/
├── index.html   — HTML structure and all CSS styles
├── app.js       — All JavaScript logic
├── spec.md      — Original implementation spec
└── AGENTS.md    — This file
```

## Architecture

```
Browser (index.html + app.js)
    │
    ├── POST   /upload
    ├── GET    /docs
    ├── PATCH  /docs/:path
    ├── DELETE /docs/:path
    ├── GET    /docs/:path/download
    ├── GET    /models/live
    ├── GET    /instructions?device_id=
    └── PUT    /instructions/:path?device_id=
         │
         ▼
    Cloudflare Worker  ──▶  D1 (SQLite)
    (m5-live.reinholdmess444.workers.dev)
```

All API calls use the `X-Upload-Token` header for authentication.

The Worker requires CORS headers for browser access. Add a `withCORS` helper and handle `OPTIONS` preflight requests in `chat-stick/server/src/index.ts`:

```typescript
function withCORS(response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, PUT, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Upload-Token")
    return new Response(response.body, { status: response.status, headers })
}

if (request.method === "OPTIONS") {
    return withCORS(new Response(null, { status: 204 }))
}
```

## Configuration

All configuration is stored in `localStorage`:

| Key | Default | Description |
|---|---|---|
| `d1upload_server_url` | `https://m5-live.reinholdmess444.workers.dev` | Worker base URL |
| `d1upload_token` | — | `X-Upload-Token` value (required) |
| `d1upload_active_tab` | `upload` | Last active tab, restored on reload |
| `d1upload_selected_model` | — | Last selected Gemini Live model name |

Settings are edited via the gear icon (⚙) in the header. If no token is saved, the settings panel opens automatically on load.

## Constants (app.js)

```js
DEFAULT_SERVER_URL  = 'https://m5-live.reinholdmess444.workers.dev'
DEFAULT_DEVICE_ID   = 'm5s3-live'
```

`DEFAULT_DEVICE_ID` is passed as `?device_id=` on all `/instructions` requests.

## Tabs

### Upload

- Drag-and-drop zone accepts any file; click-to-browse fallback via hidden `<input type="file">`
- Reads file content with `file.text()` (native browser API, UTF-8)
- Uploads as `POST /upload` with body `{ title: "library/<filename>", content: "..." }`
- Success banner shows: path · formatted size · chunk count
- Error banner shows server error message or HTTP status

### Library

- Fetches `GET /docs` on every tab activation and on manual Refresh
- Each row shows: path, size, chunk count, updated date
- Per-row ⋯ menu with three actions:
  - **Download** — `GET /docs/:path/download`, triggers browser file save
  - **Rename** — modal with text input, `PATCH /docs/:path` body `{ new_path: "..." }`, updates row in-place
  - **Delete** — confirmation modal, `DELETE /docs/:path`, removes row from list
- Path encoding: `encodeURIComponent(path)` for all per-document URLs

### LLM

- Fetches `GET /models/live` on tab activation
- Renders a `<select>` of available Gemini Live models
- Selected model name is persisted to `localStorage`
- Shows model details (full name, description, configured-model badge) below the selector
- Read-only view — selection is stored locally; no write endpoint is called

### Instruction

- Fetches `GET /instructions?device_id={DEFAULT_DEVICE_ID}` on tab activation
- Response shape: `{ status: "ok", prompts: [{ path, content, updated_at }] }`
- Each prompt is rendered as a labeled `<textarea>` with monospace font
- Edits are held in `promptDrafts` (in-memory object keyed by path) until Save is pressed
- **Save** — iterates all prompts and calls `PUT /instructions/:path?device_id=` with body `{ content: "..." }` for each; shows success banner and reloads from server
- **Reload** — discards all drafts and re-fetches from server

## API Reference

### POST /upload
```
Headers: Content-Type: application/json, X-Upload-Token: {token}
Body:    { "title": "library/file.txt", "content": "..." }
200:     { "path": "library/file.txt", "total_size": 1234, "chunk_count": 2 }
```

### GET /docs
```
Headers: X-Upload-Token: {token}
200:     { "status": "ok", "docs": [{ path, title, total_size, chunk_count, updated_at }] }
```

### PATCH /docs/:path
```
Headers: Content-Type: application/json, X-Upload-Token: {token}
Body:    { "new_path": "new-name.txt" }
200:     { "status": "ok" }
```

### DELETE /docs/:path
```
Headers: X-Upload-Token: {token}
200:     { "status": "ok", "deleted": true, "path": "..." }
```

### GET /docs/:path/download
```
Headers: X-Upload-Token: {token}
200:     (plain text body — raw document content)
```

### GET /models/live
```
Headers: X-Upload-Token: {token}
200:     { "status": "ok", "models": [{ name, displayName, description, source }] }
```

### GET /instructions
```
Query:   ?device_id={deviceId}
Headers: X-Upload-Token: {token}
200:     { "status": "ok", "prompts": [{ path, content, updated_at }] }
```

### PUT /instructions/:path
```
Query:   ?device_id={deviceId}
Headers: Content-Type: application/json, X-Upload-Token: {token}
Body:    { "content": "..." }
200:     { "status": "ok" }
```

## UI Patterns

### Banners
`showBanner(container, type, title, detail)` — injects a dismissable banner into a container element. `type` is `"success"` or `"error"`. Replaces any existing banner in that container.

### Modals
Rendered by injecting HTML into `.modal-overlay` divs. On mobile (< 480px) they slide up from the bottom as sheets. On wider screens they appear centred.

### Menus
Per-row action menus use a delegated `click` listener on `document`. Opening a menu closes any other open menu. Clicking outside closes all menus.

## Design

- **Theme:** Light mode only
- **Palette:** Apple system colours — `#f5f5f7` background, `#007aff` accent, `#ff3b30` danger
- **Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace (Instruction tab):** `ui-monospace, "SF Mono", Menlo, monospace`
- **Breakpoint:** 480px — modals switch from bottom-sheet to centred dialog; tab buttons compress at 380px

## Mobile Considerations

- `min-height: 100dvh` for correct viewport on iOS Safari
- Safe-area insets (`env(safe-area-inset-*)`) on header, action bars, and modal bottom padding
- All interactive elements have minimum 36–40px touch targets
- Inputs and selects use `font-size: 16px` to prevent iOS auto-zoom
- Scrollable areas use `-webkit-overflow-scrolling: touch`
- Tab bar scrolls horizontally with hidden scrollbar on overflow

## Hosting

Any static host works. Recommended: Cloudflare Pages — deploy by uploading the `web/` folder or connecting a git repository. No build step required.
