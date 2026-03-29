# La Table d'Amélie — Recipe Book

Internal management tool for a catering business. Handles recipes, ingredients, event planning, cost/margin calculations, and grocery list generation.

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
    │  (6 tables, on-demand)  │       │ (photo store)│
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
| `/` | Dashboard — KPIs, recent events, saved grocery lists |
| `/recipes` | Recipe list with search/filter |
| `/recipes/:id` | Recipe detail — editable inline, cost breakdown |
| `/recipes/:id/cook` | Step-by-step cook mode (mobile-friendly) |
| `/ingredients` | Ingredient catalogue |
| `/events` | Event list — multi-select + grocery list generation |
| `/events/:id` | Event detail — cost/margin, PDF recipe export |
| `/grocery-list` | Grocery list — check items, track stock, save to DB |
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

All routes are under `/api/admin/*` and protected by a JWT `AdminGuard`. The API is stateless — secrets are injected via environment variables at boot.

**Modules:**

| Module | Routes | DynamoDB table |
|---|---|---|
| `IngredientsModule` | `/admin/ingredients` | `ta-ingredients-{stage}` |
| `RecipesModule` | `/admin/recipes` | `ta-recipes-{stage}` |
| `EventsModule` | `/admin/events` | `ta-events-{stage}` |
| `GroceryListsModule` | `/admin/grocery-lists` | `ta-grocery-lists-{stage}` |
| `SettingsModule` | `/admin/settings` | `ta-settings-{stage}` |
| `AuthModule` | `/admin/auth/login` | — (credentials in env) |

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

**Note:** the CDK stacks are partially out of date with the manual setup (the `data-stack` only defines ingredients and recipes tables; the other tables were created manually). The `ec2-bootstrap.sh` script is the authoritative deployment mechanism for the backend.

---

## Deployment

### How it works

1. **Frontend** — built locally (`pnpm build:frontend`) then deployed via CDK or manual S3 upload + CloudFront invalidation.
2. **Backend** — runs on a single EC2 instance. The `scripts/ec2-bootstrap.sh` User Data script runs once on first boot: pulls secrets from SSM Parameter Store, clones the repo, builds, and starts with PM2.

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
| `S3_BUCKET` | S3 bucket for recipe photos |
| `ADMIN_CREDENTIALS` | JSON array of `{email, hash}` (bcrypt) |
| `JWT_SECRET` | HS256 signing secret (32+ chars) |

### Adding a new DynamoDB table

1. Create the table in AWS Console or CLI (partition key: the entity's ID field, String, on-demand billing).
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
| `scripts/ec2-bootstrap.sh` | EC2 User Data — bootstraps the server on first boot |
| `scripts/create-ec2.sh` | Provision a new EC2 instance |
| `scripts/setup-s3-cloudfront.sh` | Set up frontend S3/CloudFront manually |
| `scripts/setup-route53.sh` | DNS configuration |
| `scripts/attach-cert-cloudfront.sh` | Attach ACM certificate to CloudFront |
