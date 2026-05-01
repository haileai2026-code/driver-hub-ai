# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Haile AI — Driver Hub** is the operational dashboard for a driver recruitment company serving the Ethiopian community in Israel. It manages candidates through a pipeline from lead to placement with partner bus companies.

- **CEO:** Beny Asefa
- **Partners:** Egged, Afikim
- **Candidate cities:** Ashkelon, Kiryat Gat
- **Languages:** Hebrew (primary UI), Amharic, Russian (candidate-facing content)
- **UI direction:** RTL (Hebrew), `dir="rtl"` on root elements

## Commands

```bash
bun run dev        # start dev server (vite dev)
bun run build      # production build
bun run lint       # eslint
bun run format     # prettier
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19, SSR/server functions) |
| Routing | TanStack Router (file-based, `src/routeTree.gen.ts` is auto-generated) |
| Data fetching | TanStack Query + `useServerFn` |
| UI | shadcn/ui (Radix UI) + Tailwind CSS v4 |
| Backend | Supabase (Postgres + Auth + Storage) |
| AI | Lovable AI gateway → Google Gemini Flash |
| Deployment | Cloudflare Workers (`wrangler.jsonc`) |
| Package manager | Bun (also has `package-lock.json`) |
| Validation | Zod |

## Project Structure

```
src/
  routes/
    __root.tsx          # root layout
    index.tsx           # entire app UI (single-page SPA-in-a-route)
  lib/
    app-data.functions.ts       # CRUD server functions for candidates
    auth.functions.ts           # first-admin creation, user invite
    candidate-import.functions.ts  # CSV/Excel bulk import with multilingual header mapping
    haile-ai.functions.ts       # AI text generation (next step, translate, status template)
    utils.ts
  integrations/
    supabase/
      client.ts           # browser Supabase client
      client.server.ts    # admin Supabase client (service role key, server only)
      types.ts            # auto-generated DB types
    lovable/index.ts
  components/ui/          # shadcn/ui components (do not edit manually)
  hooks/
supabase/
  migrations/             # SQL migrations (apply via Supabase CLI or dashboard)
  config.toml
```

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `candidates` | Core entity — name (multilingual JSON), phone, age, city, stage, license_status, documents (JSON), preferred_language, localized_profile (JSON) |
| `ai_recommendations` | AI-generated next-step suggestions per candidate |
| `company_assets` | Fleet/vehicle tracking (plate, mileage, service dates) |
| `finance_entries` | Revenue and expenses linked to candidates and bus companies |
| `message_templates` | WhatsApp/SMS templates per language and role |
| `operation_logs` | Interaction logs in he/am/ru with sentiment and Hebrew translation |
| `user_roles` | RBAC — maps `user_id` to `app_role` |

### Key Enums

| Enum | Values |
|---|---|
| `app_role` | `super_admin`, `operator`, `viewer`, `admin`, `ceo`, `evp`, `coo`, `cfo`, `recruiter` |
| `candidate_city` | `Ashkelon`, `Kiryat Gat` |
| `candidate_stage` | `Lead`, `Learning`, `Test`, `Placed` |
| `license_status` | `Not Started`, `Learning`, `Theory Ready`, `Test Scheduled`, `Licensed` |
| `bus_company` | `Egged`, `Afikim` |
| `preferred_language` | `he`, `am`, `ru` |

### Role Permissions

- **super_admin**: full access including user management (`AdminUsersPage`)
- **operator**: can create, edit, delete candidates and import
- **viewer**: read-only

All server functions validate the caller's role via `getAuthorizedUser()` in `app-data.functions.ts`.

## Environment Variables

```
VITE_SUPABASE_URL          # Supabase project URL (browser)
VITE_SUPABASE_ANON_KEY     # Supabase anon key (browser)
SUPABASE_SERVICE_ROLE_KEY  # Service role key (server only, never expose to browser)
LOVABLE_API_KEY            # Lovable AI gateway key (server only)
```

## Architecture Notes

### Server Functions
All mutations and sensitive reads use TanStack Start `createServerFn`. They receive the user's `accessToken`, validate it with the admin Supabase client, check the role, then act. Never bypass this pattern.

### AI Integration
`generateHaileAiText` calls the Lovable AI gateway (Gemini Flash). It has three modes: `candidate_next_step`, `translate_to_hebrew`, `status_template`. Hard-coded fallbacks in he/am/ru are used when the API key is missing or the service is rate-limited.

### Candidate Import
`importCandidatesFromRows` accepts up to 500 rows from CSV or Excel. It maps both English and Hebrew column headers. Required fields: `phone` and `city` (must resolve to `Ashkelon` or `Kiryat Gat`). Missing rows are skipped and counted.

### UI Pages
The entire app is rendered in `src/routes/index.tsx` via a `activePage` state switch. Pages:
- **Dashboard** — KPI cards, recent candidates table, operation logs
- **Candidates** — list + profile panel + AI tools + CSV import/export
- **Agents** — AI agent status cards (Recruiter, Voice, CIEL, SOL)
- **Reports** — manual PDF report generation (partially implemented)
- **SOL** — Google Calendar + Gmail integration (planned)
- **CIEL** — real-time lead monitoring (planned)
- **Voice** — Twilio voice interview agent (planned)
- **Settings** — CEO profile, integration config
- **Admin** — user management (super_admin only)

### Routing
`src/routeTree.gen.ts` is auto-generated by `@tanstack/router-plugin` — never edit it manually. Add new routes by creating files in `src/routes/`.

## Conventions

- All UI strings are in Hebrew.
- RTL layout — use `dir="rtl"` on page roots.
- No mock data — only real Supabase data is displayed.
- `candidate_city` enum currently has only `Ashkelon` and `Kiryat Gat`. Adding Ashdod requires a new migration.
- `supabase/migrations/` — run in order. Use Supabase CLI (`supabase db push`) or dashboard to apply.
- shadcn/ui components in `src/components/ui/` are managed by the shadcn CLI — prefer not to hand-edit them.
