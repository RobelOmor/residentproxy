## Goal
Convert auth to modal-only, build a full multi-method payment system (USDT networks, Binance Pay, Telegram agents by country, coupon codes), expose them on the user Billing page, and lock everything down with strict RLS + server-side validation.

## 1. Auth changes
- Delete `src/routes/auth.tsx` (modal already handles login/signup).
- Update `src/routes/app.tsx` redirect: when no user, open auth modal + send to `/` instead of `/auth`.
- Redesign Google button in `src/components/auth-modal.tsx`: white background, Google "G" multi-color SVG (same as old auth.tsx), proper spacing — matches Google Identity guidelines.

## 2. Database (new migrations)

```
payment_methods
  id uuid pk, kind text ('usdt'|'binance'|'card'|'agent'),
  label text, network text null, address text null,
  qr_url text null, binance_id text null, binance_email text null,
  telegram_url text null, manager_name text null, country_code text null,
  enabled bool default true, sort int default 0,
  created_at, updated_at

coupons
  id uuid pk, code text unique citext,
  amount_usdt numeric, max_uses int default 1, used_count int default 0,
  expires_at timestamptz null, enabled bool default true, created_at

coupon_redemptions
  id uuid pk, coupon_id uuid fk, user_id uuid, amount_usdt numeric,
  redeemed_at timestamptz default now(),
  unique (coupon_id, user_id)   -- one-time per user; combined with max_uses for global cap
```

RLS:
- `payment_methods`: public SELECT only `enabled=true` rows; admin ALL.
- `coupons`: admin ALL only (users never read codes directly).
- `coupon_redemptions`: user SELECT own; INSERT only via SECURITY DEFINER function.

Server-side coupon redemption function `redeem_coupon(_code text)`:
- SECURITY DEFINER, search_path=public
- Validates: enabled, not expired, used_count < max_uses, not previously redeemed by this user
- Atomically: insert redemption, increment used_count, increment `profiles.balance_usdt`, return new balance
- Throws on failure (so client can't infer code validity beyond "invalid")

## 3. Admin "Payment" page (`src/routes/app.admin.payment.tsx`)
Move Pricing & Payment block out of `app.admin.config.tsx`. New page sections:
- **Pricing**: price per GB.
- **USDT addresses**: list rows (network=TRC20/BEP20/ERC20/SOL...), add/edit/delete, optional QR upload URL.
- **Binance Pay**: Binance ID + email + QR.
- **Card**: placeholder ("Coming soon", disabled).
- **Telegram Agents**: list (manager name, country, telegram URL, optional flag). Multiple per country allowed.
- **Coupons**: create/list/disable (code, amount, max_uses, expiry).

Sidebar: add "Payment" item between Config and Orders. Remove Pricing & Payment card from `app.admin.config.tsx`.

All writes go through new server fns in `src/lib/admin.functions.ts` guarded by `requireSupabaseAuth` + admin role check.

## 4. User Billing page (`src/routes/app.billing.tsx`)
Tabs/sections:
1. **USDT** — pick network → show address + QR + manual tx hash submit (existing flow, preserved).
2. **Binance Pay** — show Binance ID/email + QR + tx submit.
3. **Telegram Agent** — auto-detect visitor country (Cloudflare `cf-ipcountry` header via server fn `getVisitorCountry`); show matching agents first, then full list. Each row links to `t.me/...`.
4. **Coupon Code** — input field → calls `redeem_coupon` RPC → toast new balance, refresh profile.

Country detection: server fn reads `request.headers.get('cf-ipcountry')` (works on Cloudflare Workers runtime).

## 5. Sidebar
`src/components/app-sidebar.tsx`: add admin "Payment" link. User-side already has Billing.

## 6. Security hardening (the "hacker-proof" requirement)
- All admin server fns: `requireSupabaseAuth` + explicit `has_role(uid,'admin')` check inside handler (defense in depth).
- All inputs validated with `zod` (length, regex, enum) before DB writes.
- `redeem_coupon`: SECURITY DEFINER with locked `search_path=public`, FOR UPDATE row lock to prevent race-condition double-spend.
- `coupons` table never exposed to client; only RPC returns success/amount.
- `payment_methods` public read filtered to enabled rows via RLS USING clause.
- Generic error messages on coupon failures (no enumeration).
- Rate limit coupon attempts: track failed attempts in-memory per user (best-effort) and reject after 5/min.
- Keep service_role key server-only; client uses anon key (already correct).
- CSRF: TanStack server fns are POST with same-origin; safe.
- XSS: continue using React (no `dangerouslySetInnerHTML`); validate URLs (`telegram_url` must match `^https://t\.me/`).
- SQL injection: parameterized queries only (Supabase client) — no string concat.
- Run `supabase--linter` after migration, fix all warnings.

## 7. Files touched
- delete: `src/routes/auth.tsx`
- new: `src/routes/app.admin.payment.tsx`, migration file
- edit: `src/components/auth-modal.tsx`, `src/routes/app.tsx`, `src/routes/app.billing.tsx`, `src/routes/app.admin.config.tsx`, `src/components/app-sidebar.tsx`, `src/lib/admin.functions.ts`, `src/lib/proxy.functions.ts` (add coupon RPC wrapper + getVisitorCountry)

## Open questions before I build
1. For USDT, should existing `app_config.usdt_address`/`usdt_network` be migrated into `payment_methods` automatically (one row), or kept as legacy fallback? (I'll auto-migrate + keep legacy column readable.)
2. Coupon: one-time **per user** OR one-time **globally** (single use ever)? Plan supports both via `max_uses=1` (global) + unique constraint (per-user). Confirm default for admin UI.
3. Country detection on local dev (no Cloudflare header) — fall back to "show all agents" with a country dropdown. OK?

Reply "go" to build, or tell me adjustments.