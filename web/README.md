# Paoween v1 — setup and operations

This guide covers local development, account configuration, optional imports, deployment, and validation. Run npm commands from this directory. For the product overview, see the [repository README](../README.md).

## Requirements

- **Node.js 24** and npm. Install the locked dependencies with `npm ci`.
- A **Supabase** project with Google sign-in configured.
- An **OpenAI API key** for AI chat and optional statement-crop repair. Manual recordkeeping does not require this key.
- **Python 3.12**, the pinned Python dependencies, and prepared OpenThai assets if enabling the statement PDF pilot.

The app uses Next.js App Router, React, TypeScript, Supabase Auth/Postgres, the OpenAI Responses API, and Three.js mascot assets. Dime PDFs use browser-side PDF.js; bank statement parsing uses a separate Python function.

## Local setup

### 1. Prepare Supabase

For a fresh project, apply the SQL files in [supabase/migrations](supabase/migrations) in filename order using a migration runner or the Supabase SQL editor. They define account-owned records, row-level security, pockets and balance calculations, the assistant review queue, and AI policy/usage accounting.

For an existing database, apply only unapplied migrations. Review policy-changing migrations before applying them: later migrations remove the application's daily request, daily spend, and output-token caps. Applying all migrations is not a budget-limited default.

### 2. Configure Google sign-in

1. Enable the Google provider in Supabase Auth and configure its Google OAuth client credentials.
2. In that Google OAuth client, register the app origin under Authorized JavaScript origins and `https://<project-ref>.supabase.co/auth/v1/callback` under Authorized redirect URIs.
3. In Supabase Auth, allow `http://localhost:3000/auth/callback` as a redirect URL for local development.
4. Configure the production Site URL and deployment callback allowlist separately when deploying.

The optional Dime Gmail integration uses an additional browser OAuth configuration described below.

These are two different callbacks: Google returns to Supabase, then Supabase returns to the app's `/auth/callback`. See the official [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) for provider configuration.

### 3. Set environment variables

```sh
cp .env.example .env.local
```

Fill in the file before starting the app. Public variables are included in browser code; server credentials must never use a `NEXT_PUBLIC_` prefix.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Required for account features. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key. User sessions and RLS enforce account access. |
| `NEXT_PUBLIC_SITE_URL` | App origin, such as `http://localhost:3000` locally or the HTTPS deployment origin. |
| `SUPABASE_SECRET_KEY` | Elevated server-only key used for AI policy/accounting and account deletion. Keep it out of browser code and Git. |
| `OPENAI_API_KEY` | Server-only key for chat and optional statement-crop repair. |
| `OPENAI_MODEL` | Model ID. The code defaults to `gpt-6-luna`; the account must have access and `ai_model_rates` must contain an active matching entry. Chat requests use medium reasoning effort. |
| `NEXT_PUBLIC_DIME_GMAIL_CLIENT_ID` | Optional public Google web OAuth client ID for Dime Gmail import. PDF-only Dime import works without it. |

Statement pilot variables are documented under [Statement PDF pilot](#statement-pdf-pilot); they are not included in the base `.env.example`.

### 4. Start the app

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in, and complete the new-user setup. Use a test account and synthetic records for development.

## Data handling

**Account records.** Transactions, pockets, tax records, and uncertain assistant drafts are stored in Supabase with user ownership and RLS. A review draft does not affect ledger totals until confirmation. The confirmation flow validates the fields and checks duplicates. Export from Settings downloads the account's transactions, pockets, and tax records as JSON; it is not a complete backup of every app table or browser setting.

**AI chat.** Submitted text and current receipt attachments go to OpenAI through the server. The UI supports up to five JPEG, PNG, or WebP images and compresses attachments before submission. Follow-up requests include a bounded recent history: up to four completed exchanges and 4,800 serialized characters. Previous attachment bytes are not resent through that history.

When the user chooses to share account context, the server supplies a scoped summary of up to 60 recent transactions, with details for up to 20. Tax-related prompts can also include a bounded tax-record snapshot. This context is a sample, not a complete account audit. Turning context off or changing the period excludes historical replies that were tied to a different shared scope.

Chat state lives in the current browser component; it is not a durable chat archive. Uncertain drafts can be persisted separately in `assistant_review_drafts` so they remain available in the review queue. AI usage events store token counts, status, and estimated cost. Requests set `store: false`; do not interpret that setting as a blanket provider-retention guarantee.

**Monthly salary.** The entered monthly net salary is stored in account-keyed browser local storage and can update the dashboard display. It is separate from ledger income and is not gross assessable salary evidence. Do not treat it as a cross-device account setting or an exported transaction.

**Imports.** Dime emails/PDFs and bank statement PDFs follow different paths. Dime parsing runs in the browser. Statement PDFs are uploaded to the Python parser, with optional selected crops sent to OpenAI only after consent. See the pilot sections below.

**Account deletion.** Settings provides a Google reauthentication and explicit deletion flow. Use a disposable account when testing it. Deletion of app data does not revoke external Google permissions or make a promise about third-party retention.

## AI policy and usage accounting

Chat requires an OpenAI key, the server Supabase key, an enabled `ai_policy`, and an active `ai_model_rates` row for the selected model. Settings displays readiness information. A reservation is created before the provider call and reconciled with reported input, cached-input, and output tokens. Missing or malformed reservations are rejected; uncertain provider outcomes can leave a reservation held.

The latest migration sequence uses zero as the application's sentinel for disabled caps:

| Database policy field | Meaning of `0` |
| --- | --- |
| `max_daily_requests_per_user` | No app-enforced daily request count cap. |
| `global_daily_spend_limit_usd` | No app-enforced daily spend ceiling. |
| `max_output_tokens` | Chat omits the provider's `max_output_tokens` parameter. |

Provider limits, input validation, and request timeouts still apply. The chat route allows 300 seconds on Vercel and uses a 290-second provider timeout. Monetary usage is estimated using configured database rates; check those rates against your provider account before relying on the estimate.

For an **existing deployment**, deploy chat code that accepts the zero sentinel before applying [`20261121000800_unlimited_ai_output.sql`](supabase/migrations/20261121000800_unlimited_ai_output.sql). Uncapped output requires the daily spend ceiling to be zero. Such requests reserve zero dollars and reconcile actual reported usage. To restore a finite daily ceiling, configure a positive output-token cap as part of the same policy change.

The statement-crop repair route currently passes its reservation's `max_output_tokens` directly to OpenAI. Its compatibility with the zero-output-cap policy needs verification or a code change before enabling that optional repair path. The chat route's output-limit tests do not establish compatibility for the statement route.

## Dime investment import pilot

From Investment, open **นำเข้าจาก Dime**. Choose a Dime email or a local PDF, inspect the extracted drafts, and confirm only the rows you want to save. Dates, buy/sell direction, category, and amounts must be supported in THB; the importer does not infer an exchange rate. Supported text patterns populate fields, while other layouts and scanned PDFs require manual review. Encrypted PDFs accept a password in the browser.

To enable Gmail:

1. Enable Gmail API in Google Cloud and configure the OAuth consent screen for `https://www.googleapis.com/auth/gmail.readonly`.
2. Create a web OAuth client and register the exact deployment origin under Authorized JavaScript origins.
3. Set `NEXT_PUBLIC_DIME_GMAIL_CLIENT_ID` and rebuild the app.
4. Configure allowed test users while the OAuth project is in Testing. Resolve Google's applicable scope/verification requirements before public access.

The browser calls Gmail directly. The token, fetched email content, PDF bytes, and PDF password remain in browser memory during the import. Confirming a save sends reviewed transaction fields and hashed source references to the server. Gmail's read-only scope grants mailbox read access; the app's sender query narrows its own requests to Dime. Fetching is on demand, with pagination for older messages, rather than a background mailbox sync.

Disconnecting clears the page's token. External permission can be managed in the user's Google Account. This integration does not sync local CSV records or place trades.

## Statement PDF pilot

This feature accepts **one unencrypted, single-currency THB PDF**, up to **4,000,000 bytes, 5 pages, and 120 rows**. It supports specific date/description, credit/debit or signed-amount tables with running balances. OCR benchmark results on synthetic layouts do not establish accuracy across real bank statements.

The authenticated Node route issues a short-lived proof bound to the file hash, byte count, user, and session. The browser uploads the PDF to `/api/statement-parse`; Python extracts text and falls back to CPU OCR on pages without a usable text table. Editable drafts and flagged crops return to the browser. Sending selected crops to OpenAI requires consent, accepting corrections is a separate step, and saving requires confirmation. Only selected income/expense rows are saved. Transfers between your own accounts need the transfer workflow.

| Variable | Purpose |
| --- | --- |
| `STATEMENT_IMPORT_SECRET` | Required server-only signing secret, at least 32 characters. Keep the same value available to the Node and Python functions. |
| `STATEMENT_IMPORT_PRODUCTION=1` | Additional opt-in gate for Vercel Production. |
| `STATEMENT_IMPORT_LOCAL=1` | Development gate outside Vercel. A compatible Python handler must also serve the parser route. |

Vercel Preview permits the feature when its signing secret is configured. `npm run dev` alone does not start the Python function. The recommended acceptance path is a protected Preview deployment with prepared Python/model assets. See the [statement import guide](statement_import/README.md) for asset preparation, staging, and test commands.

The pilot uses the existing transactions table and needs no dedicated schema migration. Preview may use the same Supabase environment as another deployment: test with synthetic documents and a dedicated test account.

## Deploy to Vercel

1. Resolve the checks and known issues listed under [Validation](#validation).
2. Import this repository and set **Root Directory** to `web`; use the Next.js preset and Node.js 24.
3. Configure environment variables for the intended Preview or Production environment. Set `NEXT_PUBLIC_SITE_URL` to that environment's origin.
4. Add the app's `/auth/callback` URL to the Supabase redirect allowlist. Configure the separate Gmail OAuth origin if using that pilot.
5. Apply the intended Supabase migrations, respecting the code-before-policy order for an existing output-cap upgrade.
6. If enabling statement import, package its Python dependencies/model assets and configure its secret and environment gate before testing it.
7. Verify Google sign-in, account separation, manual transactions, draft review/confirmation, export, and optional integrations in the deployed environment.

[`vercel.json`](vercel.json) selects Singapore (`sin1`) and configures the Python parser's 60-second duration. Node routes declare their own durations. Confirm that the target deployment supports the required runtimes and durations. A successful build alone does not verify OAuth, migrations, RLS, or external API access.

## Validation

Run the offline checks from this directory:

```sh
npm run typecheck -- --incremental false
npm run test:finance
npm run build
```

`test:finance` runs all `scripts/*.test.mjs` files without making OpenAI requests. `test:assistant` runs the assistant-history subset.

### Verified checks and known issues

Local verification on **21 November 2026**:

| Check | Observed result |
| --- | --- |
| `npm run test:finance` | Passed: 32 tests covering financial helpers, assistant history/routing, output policy, imports, salary events, pockets, and tax context. |
| Python statement-import suite | Passed: 4 test methods using prepared synthetic text/scan fixtures and local OCR assets. |
| `npm run typecheck -- --incremental false` | Failed: four `TS18047` errors at lines 379–382 of `app/api/ai/chat/route.ts`. The reservation-error branch reads `reservationError.message` when the error can be null. |

The TypeScript failure blocks release validation. A production build was not run in this documentation review. Live OAuth/AI flows, hosted database integration tests, and parity with the linked deployment were not verified. The optional statement-crop repair path also needs compatibility verification with the zero-output-cap policy described above.

### Database and provider checks

Database regressions require a **disposable Supabase database** with all migrations applied and a role able to create the test fixtures. Provide its connection via your local `PG*` environment variables, then run:

```sh
psql -v ON_ERROR_STOP=1 -f scripts/pocket-balances.test.sql
psql -v ON_ERROR_STOP=1 -f scripts/assistant-review-drafts.test.sql
psql -v ON_ERROR_STOP=1 -f scripts/ai-output-limit.test.sql
```

All three scripts wrap their fixtures in a transaction that rolls back. Do not point integration tests at a user's live finance account. Statement parser tests additionally require the Python environment, prepared synthetic fixtures, and model assets described in the [pilot guide](statement_import/README.md).

`npm run eval:assistant` sends synthetic Thai prompts and a demo receipt to OpenAI. It requires an authorized `OPENAI_API_KEY`, can incur charges, and is separate from the offline test suite. Run it only when you intend to make provider calls.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-in returns to the wrong host or fails | App origin, Supabase Site URL/redirect allowlist, and the Google provider callback. |
| Chat is unavailable | Server keys, selected model access, matching active model-rate entry, and the enabled database AI policy. |
| New pages report missing tables or RPCs | Unapplied migrations, especially pockets and assistant review drafts. |
| Dime Gmail button is missing or OAuth fails | Public client ID, Gmail API, exact authorized origin, and OAuth test-user access. |
| Statement import is hidden | Signing secret length and Preview/Production/local feature gates. |
| A scanned statement cannot be read | Python dependencies, packaged OpenThai assets, and supported document layout. |
| A draft is missing from income/spending totals | Review drafts remain outside the ledger until confirmed. |
| Displayed monthly salary differs across devices | That setup value is stored in this browser, separately from account transactions. |

Keep `.env.local`, server credentials, personal exports, receipt files, and generated financial data out of Git. Use the ignored local environment files and deployment environment settings for secrets.
