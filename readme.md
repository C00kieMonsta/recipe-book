# La Table d'Amélie, Recipe Book

Internal management tool for a catering business. Handles recipes, ingredients, event planning, cost/margin calculations, and grocery list generation.

## Redesign

The 2026 redesign (week-first home, readable recipes and cook mode, clients with weekly templates, an accounting ledger replacing the Excel workbook) is specified in [docs/redesign/REDESIGN.md](docs/redesign/REDESIGN.md). It is delivered in six slices and adds two DynamoDB tables, `ta-clients` and `ta-ledger`. Section 9 of that document lists the open questions for the owner.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Internet                          │
└──────────┬───────────────────────────┬───────────────────┘
           │                           │
    ┌──────▼──────┐             ┌──────▼──────┐
    │  CloudFront │             │  CloudFront │
    │  (Admin SPA)│             │  (Landing)  │
    └──────┬──────┘             └─────────────┘
           │ HTTPS
    ┌──────▼──────┐
    │  S3 Bucket  │  (static assets, Vite build)
    └─────────────┘

           │ API calls (HTTPS)
    ┌──────▼──────────────────┐
    │    EC2 t2.micro          │
    │  ┌────────────────────┐ │
    │  │  NestJS API (PM2)  │ │  port 3001 → Nginx → 80/443
    │  └────────┬───────────┘ │
    └───────────┼─────────────┘
                │  AWS SDK
    ┌───────────▼─────────────┐       ┌──────────────┐
    │      DynamoDB            │       │  S3 Bucket   │
    │  (7 tables, on-demand)  │       │ (photo store)│
    └─────────────────────────┘       └──────────────┘

    Secrets: AWS SSM Parameter Store
```

---

## Monorepo Structure

```
recipe-book/
├── apps/
│   ├── frontend/          # React SPA (Vite + Tailwind)
│   └── backend/           # NestJS REST API
├── packages/
│   ├── types/             # Shared TypeScript types + Zod schemas
│   ├── ui/                # Shared UI components (unused currently)
│   └── utils/             # Shared utilities (unused currently)
├── infrastructure/        # AWS CDK stacks
└── scripts/               # AWS setup & deployment helpers
```

**Package manager:** pnpm workspaces  
**Node version:** 20.x

---

## Frontend (`apps/frontend`)

| Concern | Choice |
|---|---|
| Framework | React 18 |
| Build | Vite + SWC |
| Routing | React Router v6 |
| Styling | Tailwind CSS |
| PDF export | jsPDF + jsPDF-AutoTable |
| CSV/Excel | PapaParse, xlsx |
| Icons | Lucide React |
| Validation | Zod (via shared types) |

The SPA is a pure client-side app. It authenticates with a JWT (stored in `sessionStorage`) and talks to the backend via a thin `api.ts` client that includes a TTL cache for read-heavy endpoints (ingredients, recipes, settings).

**Key pages:**

| Route | Description |
|---|---|
| `/` | Dashboard: KPIs, recent events, saved grocery lists |
| `/recipes` | Recipe list with search/filter |
| `/recipes/:id` | Recipe detail: editable inline, cost breakdown |
| `/recipes/:id/cook` | Step-by-step cook mode (mobile-friendly) |
| `/ingredients` | Ingredient catalogue |
| `/events` | Event list: multi-select + grocery list generation |
| `/events/:id` | Event detail: cost/margin, PDF recipe export |
| `/grocery-list` | Grocery list: check items, track stock, save to DB |
| `/settings` | App settings |

**Build output:** `apps/frontend/dist/` → deployed to S3 + CloudFront.

---

## Backend (`apps/backend`)

| Concern | Choice |
|---|---|
| Framework | NestJS 10 |
| Runtime | Node.js 20 |
| Database | AWS DynamoDB (Document Client) |
| Auth | JWT (HS256) + bcrypt password hashing |
| Validation | Zod (schemas from `@packages/types`) |
| File storage | AWS S3 |
| Process manager | PM2 |
| Reverse proxy | Nginx |

All routes are under `/api/admin/*` and protected by a JWT `AdminGuard`. The API is stateless; secrets are injected via environment variables at boot.

**Modules:**

| Module | Routes | DynamoDB table |
|---|---|---|
| `IngredientsModule` | `/admin/ingredients` | `ta-ingredients-{stage}` |
| `RecipesModule` | `/admin/recipes` | `ta-recipes-{stage}` |
| `EventsModule` | `/admin/events` | `ta-events-{stage}` |
| `GroceryListsModule` | `/admin/grocery-lists` | `ta-grocery-lists-{stage}` |
| `ClientsModule` | `/admin/clients` | `ta-clients-{stage}` |
| `LedgerModule` | `/admin/ledger` | `ta-ledger-{stage}` |
| `SettingsModule` | `/admin/settings` | `ta-settings-{stage}` |
| `OffersModule` | `/admin/offers` | `ta-settings-{stage}` (item `settingsId = "offers"`) |
| `AuthModule` | `/admin/auth/login` | none (credentials in env) |

**DynamoDB access pattern:** every module uses a shared `DdbService` that wraps the AWS DocumentClient. All tables use a single string partition key (e.g. `ingredientId`, `recipeId`) with no sort key and pay-per-request billing.

---

## Shared Types (`packages/types`)

Contains all TypeScript interfaces and Zod validation schemas shared between frontend and backend.

> **Important:** this package compiles to `dist/`. After editing source files you **must** run `pnpm build:types` before the backend picks up the changes.

```
packages/types/src/
├── entities/          # Pure TS interfaces (Ingredient, Recipe, AppEvent, GroceryList…)
├── dto/               # Zod schemas for request validation (create/update DTOs)
└── constants/         # Shared constants (units, price mappings)
```

---

## Infrastructure (`infrastructure/`)

AWS CDK (TypeScript) with three stacks:

| Stack | Resources |
|---|---|
| `DataStack` | DynamoDB tables |
| `BackendStack` | VPC, EC2 t2.micro, IAM role, Security Group, Nginx |
| `FrontendStack` | S3 buckets (admin + landing), CloudFront distributions |

**Note:** `data-stack.ts` defines all seven tables, but the production tables were created manually and the other CDK stacks are partially out of date with that setup. The `ec2-bootstrap.sh` script is the authoritative deployment mechanism for the backend.

---

## Deployment

### How it works

1. **Frontend**: built locally (`pnpm build:frontend`) then deployed via CDK or manual S3 upload + CloudFront invalidation.
2. **Backend**: runs on a single EC2 instance. The `scripts/ec2-bootstrap.sh` User Data script runs once on first boot: pulls secrets from SSM Parameter Store, clones the repo, builds, and starts with PM2.

### Environment variables (backend)

Stored in AWS SSM Parameter Store under `/la-table-amelie/production/*` and written to `apps/backend/.env` at boot.

| Variable | Description |
|---|---|
| `PORT` | API port (default 3001) |
| `AWS_REGION` | AWS region (`eu-north-1`) |
| `INGREDIENTS_TABLE` | DynamoDB table name |
| `RECIPES_TABLE` | DynamoDB table name |
| `SETTINGS_TABLE` | DynamoDB table name |
| `EVENTS_TABLE` | DynamoDB table name |
| `GROCERY_LISTS_TABLE` | DynamoDB table name |
| `CLIENTS_TABLE` | DynamoDB table name. Optional: the API boots without it and the Clients feature returns 503 until it is set |
| `LEDGER_TABLE` | DynamoDB table name. Optional: the API boots without it and the Comptabilité feature returns 503 until it is set |
| `S3_BUCKET` | S3 bucket for recipe photos |
| `ADMIN_CREDENTIALS` | JSON array of `{email, hash}` (bcrypt) |
| `JWT_SECRET` | HS256 signing secret (32+ chars) |
| `OPENAI_API_KEY_PARAMETER` | Name of the SSM SecureString holding the OpenAI key. The deploy sets it when the parameter exists; with `NODE_ENV=production` the API defaults to `/la-table-amelie/production/OPENAI_API_KEY` anyway. See « Assistant » |
| `OPENAI_MODEL` | Optional Responses-API model id (default `gpt-5.6-terra`). Read from SSM by the deploy, empty means the default |
| `OPENAI_API_KEY` | Local only. Never set it in SSM or in `.env` on the server; see « Assistant » |

### After the deploy that merges categories and moves invoices to Odoo

Both steps are one-off and safe to re-run. `$API` is the API base URL (the `API_BASE_URL` deploy variable) and `$TOKEN` a JWT from `POST $API/api/admin/auth/login`.

1. Persist the merged recipe categories. Until this runs, every read maps the old `type` and `defaultCourse` onto `category` and each save persists one recipe at a time, so nothing depends on it.

   ```bash
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/merge-categories.mjs
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/merge-categories.mjs --apply
   ```

   The first call prints one line per recipe (`name · type · defaultCourse → category`) and the served `courses` list. The second writes `category` on every recipe that does not store it yet and writes the served list into `settings.courses`. A re-run reports nothing to do.

2. Switch Dalia's install to invoices issued in Odoo. The app then stops proposing invoices and deposits; the Journal gains « Saisir le CA du mois… » and « Importer des factures (CSV)… ». New installs stay in app mode (`invoicing` absent reads as `app`).

   ```bash
   curl -X PATCH "$API/api/admin/settings" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"invoicing":"externe"}'
   ```

   To go back: the same call with `{"invoicing":"app"}`, or Paramètres › Société › Factures.

### Assistant

The Assistant (chat sheet, [docs/redesign/08-assistant.md](docs/redesign/08-assistant.md)) needs an OpenAI key. The key never goes in the repo, the deploy template, `.env` on the server or the logs. The API reads it from one SSM SecureString through the instance role, cached and re-read every 15 minutes.

Create the parameter once. Type the value from a password manager, not from a terminal history or a chat:

```bash
read -rs KEY   # paste the key; nothing is echoed and it stays out of the shell history
aws ssm put-parameter --profile production --region eu-north-1 \
  --name /la-table-amelie/production/OPENAI_API_KEY \
  --type SecureString \
  --value "$KEY"
unset KEY
```

Rotate with the same command plus `--overwrite`; the running API picks the new key up within 15 minutes, no restart. Rotate any key that was ever pasted in a chat, a ticket, a screenshot or a commit, even if it was removed afterwards.

The instance role needs `ssm:GetParameter` on `arn:aws:ssm:eu-north-1:*:parameter/la-table-amelie/production/OPENAI_API_KEY`; `./scripts/provision-new-tables.sh` writes that statement (and the role created by `scripts/create-ec2.sh` already covers the whole prefix). No `kms:Decrypt` statement is needed when the SecureString uses the default `aws/ssm` key, which is the case for the command above. Add one on the key ARN only if you create the parameter with `--key-id`.

Optional model: `aws ssm put-parameter --name /la-table-amelie/production/OPENAI_MODEL --type String --value gpt-5.6-terra`. Absent means the default. Any Responses-API model id works.

The deploy (`.github/workflows/cd-deploy.yml`) writes `OPENAI_API_KEY_PARAMETER` into `.env` when the parameter exists and `OPENAI_MODEL` from SSM. It never reads or writes the key itself. Push main after creating the parameter so `.env` carries the parameter name, or rely on the `NODE_ENV=production` default.

Locally, export the key in the shell that starts the API:

```bash
export OPENAI_API_KEY=...   # from your password manager, not committed anywhere
pnpm dev:backend
```

`GET /health` returns `assistant: true` when a key source is configured (`OPENAI_API_KEY` locally or a parameter name in production). The frontend hides the Assistant cell and the ⌘⇧L shortcut when it is `false`. A configured parameter name whose parameter does not exist yields a 503 `ASSISTANT_DISABLED` on the first message; an `AccessDenied` is logged loudly without the value.

### Adding a new DynamoDB table

1. Create the table in AWS Console or CLI (partition key: the entity's ID field, String, on-demand billing) and declare it in `infrastructure/lib/data-stack.ts`.
2. Add the SSM parameter: `aws ssm put-parameter --name "/la-table-amelie/production/MY_TABLE" --value "ta-my-table-prod" --type String`.
3. Add the env var to `apps/backend/src/config/config.service.ts` and `scripts/ec2-bootstrap.sh`.
4. On the existing EC2: append the var to `.env` and run `pm2 restart la-table-amelie-api`.

---

## Local Development

```bash
# Install dependencies
pnpm install

# Build shared types (required before starting backend)
pnpm build:types

# Start backend (http://localhost:3001)
pnpm dev:backend

# Start frontend (http://localhost:5173)
pnpm dev:frontend
```

The backend connects to real AWS DynamoDB by default. To use DynamoDB Local instead, add `DDB_ENDPOINT=http://localhost:8000` to `apps/backend/.env`.

---

## Scripts

| Script | Description |
|---|---|
| `scripts/setup-ssm-params.sh` | Store all secrets in SSM (run once before first deploy) |
| `scripts/ec2-bootstrap.sh` | EC2 User Data, bootstraps the server on first boot |
| `scripts/create-ec2.sh` | Provision a new EC2 instance |
| `scripts/setup-s3-cloudfront.sh` | Set up frontend S3/CloudFront manually |
| `scripts/setup-route53.sh` | DNS configuration |
| `scripts/attach-cert-cloudfront.sh` | Attach ACM certificate to CloudFront |
| `scripts/seed-local.mjs` | Seed a realistic week (recipes, clients, events, ledger, two offers) into a local stack |
| `scripts/merge-categories.mjs` | Persist the merged recipe category and the category list; dry run without `--apply` |

## Provisioning the clients and ledger tables on an existing deployment

```bash
./scripts/provision-new-tables.sh production prod eu-north-1
git push origin main
```

The script creates `ta-clients-prod` and `ta-ledger-prod` with point-in-time recovery, writes the `CLIENTS_TABLE` and `LEDGER_TABLE` SSM parameters and refreshes the instance role policy (seven table ARNs plus `ssm:GetParameter` on the Assistant key parameter); it is safe to re-run. The deploy workflow then rewrites `apps/backend/.env` from SSM and restarts the API; `GET /health` reports both tables as `true`.

## Local smoke test

`scripts/smoke-local.mjs` exercises every endpoint against DynamoDB Local (Java 17, jar from AWS). Start DynamoDB Local on port 8000, create the tables with `scripts/dynamodb-local-tables.sh http://localhost:8000 local`, build the backend, then start the API from a directory with no `.env` and every variable inline (`DDB_ENDPOINT=http://localhost:8000`, the seven `*_TABLE` names with the `-local` suffix, fake AWS keys, `S3_BUCKET`, `ADMIN_CREDENTIALS` with a bcrypt hash for the smoke password, `JWT_SECRET`, `PORT=3101`). Then run `node scripts/smoke-local.mjs`. The script prints PASS or FAIL per check and exits 1 on any failure.
