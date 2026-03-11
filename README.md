<div align="center">

<img src="public/brightdata.svg" height="40" alt="Bright Data" />
&nbsp;&nbsp;&nbsp;×&nbsp;&nbsp;&nbsp;
<img src="public/yutori.png" height="28" alt="Yutori N1" />

<br /><br />

# Ticket Hunter Agent

**An autonomous AI agent that browses the web in real-time to find you the best available tickets — live.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/brightdata/ticket-hunter-agent)


</div>

---

## What is this?

Ticket Hunter is a **fully autonomous AI agent** that takes a natural-language query like `"Taylor Swift Eras Tour NYC"` and — without any human intervention — searches Google, opens Ticketmaster, StubHub, SeatGeek, and other ticket platforms, navigates the pages, and returns ranked, structured ticket listings in real-time.

The agent streams its work live to the browser: **you watch it browse, click, and extract data as it happens.**

**Built with [Bright Data](https://brightdata.com) + [Yutori N1](https://yutori.com)**

---

## How it works

The agent runs as a **5-stage LangGraph pipeline**, streamed live to your browser via Server-Sent Events:

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 1 · SERP Search                                  │
│  Bright Data SERP API searches Google for ticket sites  │
│  Scores and selects the top 3 most relevant URLs        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2 · Browser Pipeline                             │
│  Connects to Bright Data Scraping Browser via CDP       │
│  Opens each URL with a real Chromium instance           │
│  Takes initial screenshot → streamed to UI live         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3 · Yutori N1 Agentic Loop (up to 15 steps)     │
│  N1 vision model views screenshots and decides actions  │
│  Tools: navigate · click · scroll · type · screenshot   │
│  Iterates until tickets are found or step limit reached │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 4 · Structured Extraction                        │
│  OpenRouter (Gemini Flash) extracts JSON from findings  │
│  Fields: event, date, venue, section, row, price, url   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 5 · Merge & Rank                                 │
│  Deduplicates results across platforms                  │
│  Sorts by price (lowest first) → returned to UI         │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) · React 19 · TypeScript 5 |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) |
| **Agent Orchestration** | [LangGraph](https://langchain-ai.github.io/langgraphjs/) |
| **Browser Automation** | [Playwright Core](https://playwright.dev) + Chrome DevTools Protocol (CDP) |
| **Web Infrastructure** | [Bright Data Scraping Browser](https://brightdata.com/products/scraping-browser) + SERP API |
| **Vision LLM** | [Yutori N1](https://yutori.com) (multimodal, tool-use) |
| **Extraction LLM** | [OpenRouter](https://openrouter.ai) → Google Gemini Flash |
| **Rate Limiting** | [Upstash Redis](https://upstash.com) (per-IP, 1 search / 24h for the demo) |
| **Deployment** | [Vercel](https://vercel.com) via GitHub Actions |

---

## Supported Ticket Platforms

The agent autonomously detects and browses any of these platforms based on Google results:

- Ticketmaster
- StubHub
- SeatGeek
- Vivid Seats
- AXS
- TickPick
- Gametime
- Eventbrite
- Viagogo
- TicketNetwork
- Tickets.com

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Bright Data](https://brightdata.com) account with Scraping Browser + SERP API enabled
- A [Yutori N1](https://yutori.com) API key
- An [OpenRouter](https://openrouter.ai) API key
- An [Upstash](https://upstash.com) Redis database (for rate limiting)

### 1. Clone the repo

```bash
git clone https://github.com/brightdata/ticket-hunter-agent.git
cd ticket-hunter-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Yutori N1 — vision LLM for autonomous browsing
YUTORI_API_KEY=your_yutori_api_key

# Bright Data — Scraping Browser CDP WebSocket endpoint
# Found in your Bright Data dashboard under Scraping Browser > Access Parameters
BRD_CDP_URL=wss://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:9222

# Bright Data — API key for SERP and Web Unlocker
BRIGHTDATA_API_KEY=your_brightdata_api_key
BRIGHTDATA_SERP_ZONE=serp                   # optional, defaults to "serp"
BRIGHTDATA_WEB_UNLOCKER_ZONE=unblocker      # optional, defaults to "unblocker"

# OpenRouter — structured JSON extraction via Gemini Flash
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=google/gemini-flash-1.5    # optional

# Upstash Redis — rate limiting (remove or leave blank to disable)
KV_REST_API_URL=https://your-instance.upstash.io
KV_REST_API_TOKEN=your_upstash_token
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and search for any event.

---

## Project Structure

```
src/
├── app/
│   ├── api/search/route.ts          # POST endpoint — SSE stream orchestrator
│   ├── page.tsx                     # Main UI page
│   └── layout.tsx                   # Root layout + global metadata
├── components/
│   ├── SearchForm.tsx               # Query input with example prompts
│   ├── BrowserView.tsx              # Live browser screenshot panels (1–3 platforms)
│   ├── StatusLog.tsx                # Real-time agent activity log
│   └── ResultCard.tsx               # Ticket card with price, venue, seats
├── hooks/
│   └── useTicketSearch.ts           # SSE consumer + client state management
└── lib/
    ├── agent/
    │   ├── graph.ts                 # LangGraph workflow definition
    │   ├── state.ts                 # Agent state schema
    │   ├── stream-events.ts         # SSE event emitters
    │   ├── runtime-session.ts       # Browser session lifecycle
    │   ├── browser-utils.ts         # Playwright helpers
    │   ├── tools.ts                 # N1 tool schemas (click, scroll, etc.)
    │   └── nodes/
    │       ├── serp-search.ts       # Stage 1: Google SERP via Bright Data
    │       ├── browser-open.ts      # Stage 2: CDP browser connection
    │       ├── browser-pipeline.ts  # Stage 2: per-URL browsing orchestration
    │       ├── n1-browse-core.ts    # Stage 3: N1 agentic loop (15-step max)
    │       ├── n1-browse.ts         # Stage 3: N1 LangGraph node wrapper
    │       ├── extract.ts           # Stage 4: structured JSON extraction
    │       └── merge-and-rank.ts    # Stage 5: dedup + price sort
    ├── bright-data.ts               # Bright Data SDK wrapper
    ├── n1-client.ts                 # Yutori N1 OpenAI-compatible client
    ├── openrouter-client.ts         # OpenRouter extraction client
    ├── rate-limit.ts                # Upstash Redis rate limiter
    └── types.ts                     # Shared TypeScript interfaces
```

---

## Deployment

The repo includes a GitHub Actions workflow for automatic Vercel deployment.

### Deploy to Vercel (one-click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/brightdata/ticket-hunter-agent)

Then add all environment variables in your Vercel project settings.

### Deploy via GitHub Actions

1. Fork the repo
2. Connect it to a Vercel project
3. Add these secrets to your GitHub repo:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
4. Add all `.env.local` variables to Vercel's environment settings
5. Push to `main` — the workflow deploys automatically

### Manual CLI deploy

```bash
npm run build
npx vercel deploy --prod
```

---

## Ticket Result Schema

Each result returned by the agent follows this structure:

```typescript
interface TicketResult {
  eventName: string;    // "Taylor Swift | The Eras Tour"
  eventDate: string;    // "Friday, June 7, 2025"
  venue: string;        // "MetLife Stadium"
  city: string;         // "East Rutherford, NJ"
  ticketType: string;   // "Floor A · General Admission"
  section: string;      // "GA Floor"
  row: string;          // "N/A"
  seats: string;        // "2 available"
  quantity: number;     // 2
  price: string;        // "$380"
  currency: string;     // "USD"
  platform: string;     // "StubHub"
  url: string;          // Deep link to the listing
  notes: string;        // Any additional context
}
```

---

## Real-Time Streaming

The agent communicates with the frontend via **Server-Sent Events (SSE)**. Events emitted during a search:

| Event | Payload | Description |
|---|---|---|
| `status` | `{ message, level }` | Agent log entry (INFO, ACTION, WARN, DONE, etc.) |
| `screenshot` | `{ data, source }` | Base64 browser screenshot streamed live |
| `inspect_url` | `{ url, source }` | Current URL the browser has navigated to |
| `result` | `{ tickets, finalAnswer }` | Final structured ticket results |
| `error` | `{ message }` | Agent error |
| `done` | — | Stream complete |

---

## Rate Limiting

The live demo enforces **1 search per IP per 24 hours** via Upstash Redis.

When running locally with your own keys, this limit is not enforced unless you configure Upstash in your `.env.local`.

---

## Powered by

<table>
<tr>
<td width="50%" valign="top">

### Bright Data

[Bright Data](https://brightdata.com) provides the web infrastructure that makes the agent possible:

- **Scraping Browser** — a real Chromium instance with residential proxy routing, anti-bot bypass, and JavaScript execution, connected via CDP
- **SERP API** — reliable Google search results to discover the right ticket platform URLs

</td>
<td width="50%" valign="top">

### Yutori N1

[Yutori N1](https://yutori.com) is the multimodal vision LLM at the core of the agent loop:

- Receives browser screenshots as visual input
- Decides which actions to take (click, scroll, navigate, type)
- Extracts ticket information from what it sees
- Runs up to 15 reasoning steps per URL

</td>
</tr>
</table>

---

## License

MIT © [Bright Data](https://brightdata.com) & [Yutori](https://yutori.com)
