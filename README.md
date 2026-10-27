# Orange Telegram Mini App

Telegram Mini App for mining ORAI on TON, with tasks, referrals, wallet connection, and an admin control room at `/101`.

## Configuration

Set these server-side environment variables:

- `TELEGRAM_BOT_TOKEN` — the bot token from BotFather.
- `APP_URL` — the public HTTPS URL of the deployed app.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — the Supabase project connection.
- `SUPABASE_PROJECT_ID` — the Supabase project identifier.
- `CRON_SECRET` — secret used to authorize scheduled broadcast jobs.
- `PAYOUT_WALLET_MNEMONIC` — server-only mnemonic for signing queued ORAI withdrawals.
- `MONETAG_POSTBACK_SECRET` — server-only secret matching the Monetag postback URL.

Configure Monetag's server-side postback URL in the Monetag SDK zone settings. Point it to
`<APP_URL>/api/public/ads/monetag` and include the `secret`, `ymid`, `zone_id`, `event_type`,
and `reward_event_type` macros. Keep the secret out of client-side code and source control.

The Telegram webhook handles `/start` and `/101`. Admin access remains restricted to the usernames configured in `src/lib/config.ts`.

## Development

```sh
pnpm install
pnpm dev
```

## Production

```sh
pnpm build
```

Deploy the project to Vercel with the TanStack Start framework and configure the environment variables above in the Production environment.
