# Kerala Flood Desk

Non-commercial classroom demo showing how to keep third-party API keys (`NEWSDATA_API_KEY` and `GEMINI_API_KEY`) safely on a Node.js + Express backend while serving a React frontend.

## Environment Variables

Set these in your shell or `.env` file (never commit real keys):

| Variable | Required | Description |
| --- | --- | --- |
| `NEWSDATA_API_KEY` | Yes (for news/plan) | NewsData.io API key. Read on the server only; redacted as `***REDACTED***` in `requestPreview`. If omitted, `GET /api/health` reports `newsdataKey: false` and `/api/news` returns `401 missing_key`. |
| `GEMINI_API_KEY` | Yes (for `/api/plan`) | Google Gemini API key used server-side with `gemini-2.5-flash` via `@google/genai`. |
| `CLASS_ACCESS_CODE` | No | Optional shared access code. When set, every `/api/*` route except `/api/health` requires a matching `x-class-code` header (`401 missing_or_invalid_class_code` otherwise). |
| `PORT` | No | Server port (defaults to `3000`). |

## Running the Server

Install dependencies:

```bash
npm install
```

### Development (Express + Vite middleware)

```bash
npm run dev
```

### Production (build frontend static files + run Express)

```bash
npm run build
NODE_ENV=production npm start
```

## Project Structure (`/api`)

All backend API routes, real domain data (Kerala's 14 districts, caveats, credit limits), and in-memory cache/rate-limit stores live under `/api` at the project root:

- `api/health.ts` — `GET /api/health` health & credit status endpoint
- `api/news.ts` — `GET /api/news` NewsData.io proxy endpoint
- `api/plan.ts` — `POST /api/plan` Gemini query + 14-district triage endpoint
- `api/_lib/` — Shared server data, NewsData client, Gemini helper, and error/auth utilities
- `server.ts` — Express server mounting `/api/*` and serving Vite / `dist/` static files

## API Endpoints

- `GET /api/health` — Returns key availability and current credit counters (`200/day`, `30/15min`).
- `GET /api/news?q=&country=&language=&category=` — Proxies NewsData `/api/1/latest` with 15-minute in-memory caching, 10s upstream timeout, and `q <= 100` character validation.
- `POST /api/plan` — Accepts `{ "situation": string, "country": "in" }`, uses `gemini-2.5-flash` to generate a `<= 100` character `OR` query, fetches headlines via the `/api/news` logic, and ranks Kerala's 14 districts strictly from the returned article IDs.
