# Run Paoween v1

Use Node.js 24 and npm. Run the commands below from the `web/` directory.

## Configure the app

1. Create a Supabase project and apply the SQL files in [supabase/migrations](supabase/migrations) in filename order. The migrations set up account-scoped tables and the AI quota.
2. Enable Google sign-in in Supabase Auth. Add the Supabase OAuth callback (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client. Allow `http://localhost:3000/auth/callback` in Supabase Auth for local development.
3. Copy `.env.example` to `.env.local`. Fill in the Supabase URL, publishable key, and server secret. Set `OPENAI_API_KEY` to enable chat. The configured model must be enabled in the AI model rates table and available to your OpenAI account. Keep server secrets in the environment.
4. Run `npm ci` and `npm run dev`, then open [localhost:3000](http://localhost:3000).

For Vercel, import the repository with `web` as the Root Directory, configure the environment variables there, and set `NEXT_PUBLIC_SITE_URL` to the deployed origin. Add the deployed `/auth/callback` URL to the Supabase redirect allowlist.

## Checks

- `npm run typecheck` checks TypeScript.
- `npm run test:assistant` checks conversation history and account scope offline.
- `npm run eval:assistant` sends synthetic Thai prompts and a demo receipt to OpenAI. Provide `OPENAI_API_KEY` in the environment. This command uses the API and can incur charges.

## Data handling

Transactions and tax records are stored in the signed-in account. Chat messages and submitted images go to OpenAI. The app includes a snapshot of account records only when the user chooses to attach it. A draft stays in chat until the user confirms the save.
