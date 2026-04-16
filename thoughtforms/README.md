# Thoughtforms Prototype

Thoughtforms is a sidecar proof-of-concept.

It is not a rewrite of Chronos.

The current prototype boundary is:
- Chronos remains the backend and source of truth
- Thoughtforms is a separate React/TypeScript frontend
- the dashboard server exposes a thin delegated `/api/thoughtforms/*` bridge
- the whiteboard talks to Chronos, but does not become Chronos

## Structure

- `config.yml`
  Whiteboard-specific prototype settings.
- `server.py`
  Delegated API bridge for the Thoughtforms prototype.
- `app/`
  React + TypeScript frontend.
- `IDEA.md`
  Living concept and product notes.

## Run

1. Start the Chronos dashboard server as usual.
2. In a separate shell:

```powershell
cd thoughtforms\app
npm install
npm run dev
```

3. Open:

```text
http://127.0.0.1:4174
```

The Vite dev server proxies `/api/*` to the Chronos server on port `7357`.

## Initial API Surface

- `GET /api/thoughtforms/health`
- `GET /api/thoughtforms/bootstrap`
- `POST /api/thoughtforms/query`

These endpoints are intentionally read-mostly and low-risk for the prototype.
