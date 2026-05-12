## Scope
Large multi-area update covering admin payment, user billing UI, admin config, users page, dashboard stats, orders approval flow, and live chat support.

## 1. Admin → Payment page (`app.admin.payment.tsx`)
- Rename "QR image URL (optional)" → "Gateway logo URL" (used as the gateway icon shown to users); the QR image is **auto-generated** from the payment address (using `qrcode` library, client-side render).
- Binance Pay form: relabel fields to "Binance Pay ID" and "Binance Pay Email" with helper text so users understand each.
- Coupons table: split into **Active** and **Expired/Used** lists. Active rows get Activate/Disable/Delete actions. A coupon whose `used_count >= max_uses` (or past `expires_at`) shows in Expired with no actions.
- Telegram Agent rows: keep `telegram_url`; nothing else needed (logo will render automatically on user side).

## 2. User → Billing page (`app.billing.tsx`)
- New 3-column layout per gateway card: **[Gateway logo] → [QR code] → below QR show pay address as copyable text**.
- USDT, Binance Pay: same pattern. Auto-generate QR from address using `qrcode` (already pure-JS, edge-safe).
- Telegram Agent card: show **Telegram logo** + agent name/country + "Open in Telegram" button (link to telegram_url).
- Top-up minimum **$10**, no maximum. Validate on coupon and any future amount inputs (note: current flow doesn't take an amount — payments are manual; only coupon redeems credit. Enforce $10 min only on coupon `amount_usdt` server-side display + future amount inputs.) Add a visible note "Minimum top-up: $10.00".

## 3. Admin → Config page (`app.admin.config.tsx`)
- Hide "711Proxy Login" card by default behind a "Show 711Proxy login (advanced)" toggle.
- Keep "Live Usage Sync (Dashboard Token)" visible.
- Track token entry timestamp (`proxy_dashboard_token_set_at` column). Show:
  - Red alert banner when token is **>13 days old** (1 day before 14-day expiry).
  - Stronger red banner when token is **>14 days old** ("expired").
- Migration: add `proxy_dashboard_token_set_at timestamptz` to `app_config`; update `adminSaveConfig` to set it when token changes.

## 4. Admin → Users page (`app.admin.users.tsx`)
- For each user, list their approved proxy orders with **live used / remaining MB** by calling the dashboard-token sync per sub-user (reuse existing `sync-usage` logic) and read from `sub_user_pool.mb_used` / `mb_capacity`.
- 30-day expiry warning: any approved order where `now() - approved_at >= 28 days` shows a **red "Expires in N days — disable on 711proxy"** badge.

## 5. Admin → Dashboard (`app.admin.index.tsx`)
Stat cards (queried via new `adminStats` server fn):
- Total GB sold (sum `gb_amount` of approved orders)
- Total GB remaining (sum `(mb_capacity - mb_used)/1024` across assigned `sub_user_pool` rows)
- Total USDT sold (sum `cost_usdt` of approved orders)
- Total USDT topped up (sum `amount_usdt` of approved topups + redeemed coupons)
- Pending orders count
- Approved orders count
- Rejected orders count

## 6. Admin → Orders approval (`app.admin.orders.tsx`)
- Before showing "Assign sub-user / Approve" action: call dashboard token to verify the chosen sub-user actually exists on 711proxy with matching capacity. Block approval with clear error if sub-user not found or capacity insufficient. Reuse `adminTestDashboardToken` + a new `adminVerifySubUserOnRemote(suname)` server fn that hits 711proxy dashboard API.

## 7. Live Chat Support
New feature — biggest piece.

**DB:**
- `support_threads` (id, user_id, customer_name, telegram_id, status open/closed, last_message_at, unread_admin int, unread_user int, created_at)
- `support_messages` (id, thread_id, sender role admin|user, body text, attachment_url text null, created_at)
- `support-attachments` storage bucket (public read for shared media, RLS enforced).
- RLS: user sees own thread + messages; admin sees all.
- Realtime enabled on both tables.

**User-facing widget** (mounted in `__root.tsx` for public site + `app.tsx` for app):
- Floating red "Chat With Support" button bottom-right (matches screenshot).
- Click → modal "Hstock-style" panel: Full Name + Telegram ID (optional) → opens/creates thread.
- Chat panel: messages, file/image upload, sound on incoming admin reply.

**Admin side** (new `/app/admin/support` route + sidebar link "Customer Support" with unread badge):
- Thread list with unread counts and loud sound alert on new user message (HTML5 audio).
- Open thread → full conversation, can reply, send images/files.

## 8. Files
**New:**
- `src/components/support-widget.tsx`
- `src/components/qr-code.tsx` (wraps `qrcode` lib)
- `src/lib/support.functions.ts`
- `src/routes/app.admin.support.tsx`
- migration (token_set_at, support tables, storage bucket, RLS, realtime)

**Edited:**
- `src/routes/app.admin.payment.tsx` (label change, coupon split, binance labels)
- `src/routes/app.billing.tsx` (logo→arrow→QR→address layout, telegram card, $10 min note)
- `src/routes/app.admin.config.tsx` (hide 711 login, token age alert)
- `src/routes/app.admin.users.tsx` (live usage, expiry warning)
- `src/routes/app.admin.index.tsx` (stat cards)
- `src/routes/app.admin.orders.tsx` (verify before approve)
- `src/components/app-sidebar.tsx` (Customer Support entry + unread badge)
- `src/routes/__root.tsx` (mount support widget on public)
- `src/routes/app.tsx` (mount widget for app)
- `src/lib/admin.functions.ts` (adminStats, verify sub-user)
- `src/lib/payment.functions.ts` (no changes needed)

## 9. Dependencies
- `bun add qrcode @types/qrcode`

## 10. Security
- All new server fns use `requireSupabaseAuth`; admin-only ones add `assertAdmin`.
- Storage bucket policies: user can upload to own folder, read messages from threads they belong to, admin full access.
- File type/size validation on upload (image/* + pdf, max 5MB).
- Realtime channels filtered by user_id / admin role.

## Open question
This is a very large change. I'll build it in this order (resilient to partial failure): **Migration → admin payment + config + users + dashboard + orders → user billing redesign → live chat (last, since it's the biggest standalone piece).**

Reply "go" to build, or tell me to descope a section.
