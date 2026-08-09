# PADRE65 — Events

An art-directed, unlisted event invitation and RSVP microsite. One scrolling
page for guests, a private guest list for you.

- **Public invitation** — `/`
- **Administrator sign-in** — `/admin/login`
- **Guest list** — `/admin`
- **Intended production URL** — `https://events.padre65.com`

Next.js 16 (App Router) · TypeScript · CSS Modules · Supabase · Vercel.
No UI framework, no CSS framework, no analytics.

---

## Contents

1. [Local installation](#1-local-installation)
2. [Development command](#2-development-command)
3. [Production build](#3-production-build)
4. [Create the Supabase project](#4-create-the-supabase-project)
5. [Run the SQL migration](#5-run-the-sql-migration)
6. [Enable Supabase Auth](#6-enable-supabase-auth)
7. [Disable public sign-up](#7-disable-public-sign-up)
8. [Create the administrator account](#8-create-the-administrator-account)
9. [Set ADMIN_EMAILS](#9-set-admin_emails)
10. [Configure local environment variables](#10-configure-local-environment-variables)
11. [Replace the event details](#11-replace-the-event-details)
12. [Replace the hero media](#12-replace-the-hero-media)
13. [Deploy to Vercel](#13-deploy-to-vercel)
14. [Add the environment variables in Vercel](#14-add-the-environment-variables-in-vercel)
15. [Connect events.padre65.com](#15-connect-eventspadre65com)
16. [Test a public RSVP](#16-test-a-public-rsvp)
17. [Test administrator sign-in](#17-test-administrator-sign-in)
18. [Export the guest list](#18-export-the-guest-list)
19. [Post-event archival](#19-post-event-archival)

Plus: [Architecture](#architecture) · [Security model](#security-model) ·
[Accessibility & performance](#accessibility-and-performance) ·
[Troubleshooting](#troubleshooting)

---

## 1. Local installation

Requires Node.js 20 or newer.

```bash
npm install
```

Fonts are self-hosted in `app/fonts/` — nothing is fetched from Google at build
time, so installs and builds work offline and behind a proxy.

## 2. Development command

```bash
npm run dev
```

Then open <http://localhost:3000>. The invitation renders without Supabase
configured; submitting an RSVP returns a polite "not available right now"
until you complete steps 4–10.

## 3. Production build

```bash
npm run build     # production build (also runs TypeScript)
npm start         # serve the production build locally
npm run lint      # ESLint
npx tsc --noEmit  # type check on its own
```

---

## 4. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Pick the region closest to your guests — **London (eu-west-2)** for this event.
3. Save the database password somewhere safe; you will not need it for the app,
   only for direct database access.
4. Once the project has finished provisioning, open **Project Settings → API**
   and note three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

> The service-role key bypasses every access rule in the database. It belongs
> only in server environment variables. Never prefix it with `NEXT_PUBLIC_`,
> never paste it into client code, and never commit it.

## 5. Run the SQL migration

Open **SQL Editor → New query** in the Supabase dashboard, paste the entire
contents of `supabase/migrations/0001_event_rsvps.sql`, and run it.

The script is idempotent — re-running it is safe.

It creates the `event_rsvps` table, its constraints and indexes, the
`updated_at` trigger, enables Row Level Security, and revokes the default
grants from the `anon` and `authenticated` roles.

To verify, run:

```sql
select relrowsecurity, relforcerowsecurity from pg_class where relname = 'event_rsvps';
-- expect: t | t

select count(*) from pg_policies where tablename = 'event_rsvps';
-- expect: 0
```

**Zero policies is correct, not an oversight.** With RLS enabled and no
policies, the table denies everything to the anon and authenticated roles.
Only the server-side service-role client can read or write it. Do not add a
read policy — see [Security model](#security-model).

If you prefer the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

## 6. Enable Supabase Auth

Email/password sign-in is enabled by default on new projects. Confirm at
**Authentication → Sign In / Providers → Email** that **Email** is enabled.

You do not need any OAuth provider, magic links, or SMS.

## 7. Disable public sign-up

**Authentication → Sign In / Providers → Email**, then turn **Allow new users
to sign up** *off*.

This site never exposes a registration form, but turning sign-up off closes the
Supabase Auth API endpoint too, so nobody can create an account against your
project directly.

## 8. Create the administrator account

**Authentication → Users → Add user → Create new user**.

- Enter the administrator's email address and a strong password.
- Tick **Auto Confirm User** (there is no email-confirmation flow in this app).

Repeat for each person who needs the guest list. Use a password manager.

## 9. Set ADMIN_EMAILS

Being able to sign in is not enough. The email address must also appear in the
`ADMIN_EMAILS` environment variable, which is checked on the server on every
admin page load and every admin API request.

```
ADMIN_EMAILS=you@padre65.com,studio@padre65.com
```

Comma-separated, case-insensitive, whitespace tolerated. **If `ADMIN_EMAILS` is
empty or unset, all admin access is denied** — it fails closed.

To revoke someone's access immediately, remove them from `ADMIN_EMAILS` and
redeploy. (Deleting their Supabase user works too, and is the more thorough
option.)

## 10. Configure local environment variables

```bash
cp .env.example .env.local
```

Fill in the values from step 4 and step 9. `.env.local` is git-ignored;
`.env.example` contains placeholders only and is safe to commit.

| Variable | Where it runs | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Publishable key, auth only |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Reads/writes `event_rsvps` |
| `ADMIN_EMAILS` | **server only** | Guest-list allow-list |
| `NEXT_PUBLIC_SITE_URL` | client + server | Canonical URL and Open Graph |

Restart `npm run dev` after changing them.

---

## 11. Replace the event details

Everything a guest reads lives in **`config/event.ts`**, and only there. No
component contains an event date, a venue, a link or a piece of copy.

```ts
export const eventConfig: EventConfig = {
  slug: "after-hours-2026",       // groups RSVPs; change it for a new event
  name: "PADRE65 — AFTER HOURS",
  eyebrow: "PRIVATE EVENT · LONDON",
  headline: "A night with Padre65.",
  description: "…",
  dateISO: "2026-09-17T19:00:00+01:00", // machine-readable, for <time>
  dateDisplay: "Thursday, 17 September 2026",
  dateShort: "Thursday, 17 September",   // used on the confirmation screen
  doorsTime: "7:00 PM",
  finishTime: "Late",
  venue: "The Padre65 Studio",
  address: "65 Example Street, Soho, London W1",
  mapsUrl: "",                    // "" hides the "Open in Maps" link entirely
  dressCode: "Come as you are.",
  admissionText: "Complimentary with RSVP.",
  footerStatement: "Stories Woven in Motion.",
  instagramUrl: "https://www.instagram.com/_padre65/",
  shopUrl: "https://padre65.com/",
  maxAdditionalGuests: 3,
  seo: { title: "…", description: "…", image: "/media/og.png", noindex: true },
};
```

Three things worth knowing:

- **`mapsUrl`** — the "Open in Maps" link does not render at all while this is
  an empty string. Paste a real Google/Apple Maps URL to reveal it.
- **`seo.noindex`** — `true` by default. The page sends `noindex, nofollow` and
  carries no public Event structured data, because this is an unlisted
  invitation shared by link. Set it to `false` only if you want the event
  publicly discoverable.
- **`slug`** — the admin dashboard and CSV export only ever show rows matching
  this slug. Changing it starts a clean guest list without deleting the old one.

**`maxAdditionalGuests`** is enforced in three independent places: the browser,
the server route, and a database `CHECK` constraint. If you raise it above 3,
you must also widen the two constraints in
`supabase/migrations/0001_event_rsvps.sql`
(`event_rsvps_guests_max_three` and `event_rsvps_party_size_range`) with a new
migration. The database will reject anything larger until you do.

## 12. Replace the hero media

Put files in `public/media/` and point `config/event.ts` at them. Nothing is
hotlinked from `padre65.com` or the lookbook.

### Hero

```ts
hero: {
  desktop: { src: "/media/hero-desktop.jpg", kind: "image", alt: "", width: 2400, height: 1350 },
  mobile:  { src: "/media/hero-mobile.jpg",  kind: "image", alt: "", width: 1080, height: 1620 },
},
```

- The shipped files are the After Hours campaign frame: the full landscape for
  desktop, and a 3:4 crop centred on the standing figure for mobile.
- Setting both `src` to `""` falls back to the built-in near-black typographic
  composition — an oversized cropped "65" drifting behind the title — so a
  missing file never breaks the page.
- **After replacing an image, delete `.next/cache/images` and restart.** Next
  caches optimised variants by URL, so reusing a filename can otherwise serve
  the old picture.
- **Re-check contrast after replacing the hero.** The title sits on the dark
  lower half of the photograph and the veils are tuned to that specific frame.
  A brighter image needs stronger veils — see the note in `Hero.module.css`.
- Desktop and mobile take separate crops. Supply both.
- `width` and `height` must be the real intrinsic pixel dimensions; they reserve
  the box and keep layout shift at zero.
- Decorative hero art should keep `alt: ""`. If the image carries meaning, write
  a real description.

For **video**, set `kind: "video"` and supply a `poster`:

```ts
desktop: {
  src: "/media/hero.mp4", kind: "video", poster: "/media/hero-poster.jpg",
  alt: "", width: 1920, height: 1080,
},
```

Video is always muted, looped and `playsinline`; autoplay is attempted but never
assumed. Guests who prefer reduced motion see the poster frame only. Compress
before uploading — aim under 3 MB, H.264 or HEVC, no audio track.

### Open Graph image

Replace `public/media/og.png` (1200 × 630), or point `seo.image` elsewhere. The
supplied image is generated from the event copy and is safe to overwrite.

### Favicon

Replace `public/icon.svg`. The browser theme colour is set in `app/layout.tsx`
(`viewport.themeColor`).

---

## 13. Deploy to Vercel

```bash
git init && git add . && git commit -m "Padre65 events microsite"
git remote add origin git@github.com:<org>/padre65-events.git
git push -u origin main
```

Then at <https://vercel.com/new>: import the repository, leave every build
setting at its detected default (Next.js, `npm run build`, output `.next`), add
the environment variables from step 14 **before** the first deploy, and deploy.

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

## 14. Add the environment variables in Vercel

**Project → Settings → Environment Variables.** Add all five for **Production**,
**Preview** and **Development**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key — mark it **Sensitive** |
| `ADMIN_EMAILS` | `you@padre65.com,studio@padre65.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://events.padre65.com` |

Environment variables are read at build time as well as at runtime, so
**redeploy after changing any of them**.

## 15. Connect events.padre65.com

1. In Vercel: **Project → Settings → Domains → Add**, enter
   `events.padre65.com`.
2. Vercel shows a DNS record to create. At the DNS provider for `padre65.com`,
   add:

   ```
   Type   Name     Value
   CNAME  events   cname.vercel-dns.com.
   ```

   Use whatever hostname Vercel displays — it occasionally differs.
3. Wait for propagation (usually minutes) and for Vercel to issue the TLS
   certificate automatically.
4. Set `NEXT_PUBLIC_SITE_URL=https://events.padre65.com` and redeploy so the
   canonical URL and Open Graph tags point at the live domain.

`padre65.com` itself is on Shopify and is not touched by any of this. Adding a
subdomain CNAME does not affect the shop, the lookbook, or email.

## 16. Test a public RSVP

Open the site and check, in order:

- Submit **attending, no guests** → "You're on the list." with party size 1.
- Submit **attending, three guests** → party size 4, all names listed.
- Confirm there is **no option for a fourth guest**.
- Submit **declined** → "Thank you for letting us know.", no party details.
- Choose three guests, reduce to one — the discarded names must not reappear.
- Leave a name blank → an inline error appears without the layout jumping.
- Double-click **Confirm RSVP** → exactly one row in the database.

Then confirm the data landed:

```sql
select created_at, first_name, last_name, rsvp_status, additional_guests, party_size
from public.event_rsvps
order by created_at desc;
```

And confirm the public cannot read it. In the browser console on the live site:

```js
// Should return an error, never data.
await fetch("/api/admin/rsvps").then(r => r.status)   // 401
```

## 17. Test administrator sign-in

- Visit `/admin` while signed out → you are redirected to `/admin/login`.
- Sign in with an address **not** in `ADMIN_EMAILS` → refused.
- Sign in with an allow-listed administrator → the guest list loads.
- Leave the tab open and submit an RSVP from your phone → the row appears within
  ten seconds without a reload.
- Search for an additional attendee's name → the host's row is returned.
- Filter by Attending / Declined, and toggle the Submitted sort.
- Sign out → `/admin` sends you back to the login page.

## 18. Export the guest list

Press **Export CSV** on the dashboard. Columns:

```
Submitted at (UTC), First name, Last name, RSVP status, Additional guests, Party size
```

Additional guests are semicolon-separated in one cell. Every cell is quoted, and
any value starting with `=`, `+`, `-` or `@` is prefixed with an apostrophe so
spreadsheets treat it as text rather than a formula. The file opens correctly in
Excel, Numbers and Google Sheets (UTF-8 with BOM).

The export endpoint enforces exactly the same authorisation as the dashboard —
requesting `/api/admin/export` while signed out returns 401.

## 19. Post-event archival

The dashboard is deliberately read-only. When the event is over, pick one:

- **Keep it, hide it** — set `seo.noindex: true` (already the default) and stop
  sharing the link. The data stays in Supabase.
- **Archive and clear** — export the CSV, store it wherever guest data belongs,
  then delete the rows:

  ```sql
  delete from public.event_rsvps where event_slug = 'after-hours-2026';
  ```

- **Run the next event** — change `slug` in `config/event.ts` and redeploy. The
  old rows remain but are no longer shown anywhere; the new list starts empty.
- **Take the site down** — remove the domain in Vercel, or pause the project.
  Deleting the Supabase project destroys the data irreversibly.

Only collect what you need, and keep names no longer than you have a reason to.

---

## Architecture

```
app/
  layout.tsx                    root layout, metadata, fonts, noscript fallback
  page.tsx                      the invitation — hero + reply (server component)
  globals.css                   design tokens + reset
  fonts/                        self-hosted variable woff2 + next/font/local
  api/
    rsvp/route.ts               public RSVP endpoint (POST only)
    admin/rsvps/route.ts        authenticated guest list (polled)
    admin/export/route.ts       authenticated CSV export
  admin/
    page.tsx                    dashboard shell, verifies the session
    Dashboard.tsx               guest list (client): polling, search, filter, sort
    actions.ts                  sign in / sign out Server Actions
    login/page.tsx              sign-in page
    login/LoginForm.tsx         sign-in form
    admin.module.css            admin styles
components/
  Hero.tsx                      opening frame
  HeroVideo.tsx                 muted, playsinline, reduced-motion aware
  Details.tsx                   typographic detail rows (inside the reply)
  Rsvp/RsvpSection.tsx          the RSVP flow
  Rsvp/Confirmation.tsx         success states
  SiteFooter.tsx                footer
  Reveal.tsx                    the single motion primitive
  Wordmark.tsx                  typographic PADRE65 lockup
config/event.ts                 ← the only file you edit for content
lib/
  name-rules.ts                 field rules shared by browser and server
  validation.ts                 server-side Zod schemas
  admin-auth.ts                 session + ADMIN_EMAILS check
  csv.ts                        CSV with formula-injection escaping
  rsvp-types.ts                 row types and totals
  supabase/admin.ts             service-role client (server-only)
  supabase/server.ts            cookie session client (auth only)
  supabase/browser.ts           anon browser client
proxy.ts                        session refresh + first-pass /admin redirect
supabase/migrations/            the SQL migration
```

### Request flow

**Guest submits an RSVP.** The browser POSTs to `/api/rsvp`. The route rejects
non-JSON and anything over 4 KB, parses the body with Zod, ignores every field
it did not ask for (including any `party_size` the browser sent), calculates the
party size itself, inserts via the service-role client, and returns only that
submission's own fields.

**Administrator opens the dashboard.** `proxy.ts` refreshes the Supabase cookie
and bounces signed-out visitors to `/admin/login`. The page then independently
verifies the session with `getUser()` — which revalidates the token against
Supabase rather than trusting the cookie — and checks the email against
`ADMIN_EMAILS`. Guest data is fetched client-side from `/api/admin/rsvps`, which
repeats both checks, so **no guest name is ever present in server-rendered HTML**.

---

## Security model

- **The service-role key never reaches the browser.** `lib/supabase/admin.ts`
  imports `server-only`, so the build fails if it is ever pulled into a client
  component. Verified: no client chunk contains it.
- **RLS is on with zero policies.** The anon and authenticated roles are denied
  select, insert, update and delete. Only the server can touch the table.
- **Realtime was rejected on purpose.** Supabase Realtime would require a
  readable policy on `event_rsvps`, which would hand the guest list to anyone
  with the anon key — that key is public by design. The dashboard uses
  authenticated polling (10 s) plus refresh-on-focus and a manual button
  instead. Do not loosen the policies to enable Realtime.
- **Authorisation is re-checked on every admin request**, not once at sign-in.
  Middleware is a convenience, not the boundary.
- **Fails closed.** An empty `ADMIN_EMAILS` denies everyone.
- **No account enumeration.** A wrong password and a non-allow-listed address
  produce the same message.
- **CSRF.** Sign-in and sign-out are Next.js Server Actions, which validate
  Origin against Host. Session cookies are `httpOnly`, `SameSite=Lax`, and
  `Secure` in production.
- **Validated on both sides, trusted on one.** `lib/name-rules.ts` holds the
  rules so the browser and server say the same thing; the server re-parses
  everything and is the only authority. The database repeats the critical
  invariants as `CHECK` constraints.
- **Request bodies are never logged.** Only database error codes are.
- **Security headers** are set in `next.config.ts`: CSP with
  `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, HSTS. `X-Powered-By` is off.
- **Admin responses are `no-store`, `private`**, with `CDN-Cache-Control` and
  `Vercel-CDN-Cache-Control` set so no shared cache retains them.
- **Spam.** A hidden honeypot field. A submission that fills it receives a
  normal-looking success and writes nothing, so bots learn nothing. No CAPTCHA.
- **No duplicate detection by name.** Two guests can legitimately share a name.

### What is deliberately not collected

No email, phone, Instagram handle, address, notes, dietary information or
marketing consent. No analytics. No cookies on the public page at all — the only
cookie in the system is the administrator's session.

---

## Accessibility and performance

Measured on the production build.

| | Result |
|---|---|
| axe-core (9 surfaces, mobile + desktop) | **0 violations** |
| Lighthouse accessibility | **100** |
| Lighthouse best practices | **100** |
| Lighthouse performance (mobile, simulated) | **95** |
| Cumulative layout shift | **0** |
| Hero text over the photograph | **AA at 320 / 390 / 1440 / 1920** |
| Lighthouse SEO | 66 — see below |

The SEO score is 66 for exactly one reason: `Page is blocked from indexing`.
That is the intended behaviour of an unlisted invitation. Every other SEO audit
passes. Setting `seo.noindex: false` takes the score to 100.

Notes:

- The opening frame animates from CSS alone, so it paints without waiting for
  hydration and renders with JavaScript disabled.
- Below-the-fold entry animations use IntersectionObserver. A `<noscript>` rule
  reveals everything if scripts are unavailable — content is never trapped
  behind an animation.
- `prefers-reduced-motion: reduce` disables the background drift, the scroll
  hint, all entry animations and the RSVP surface transition, and shows video
  as a poster frame.
- Text over the hero photograph is measured against the actual composited
  pixels, not assumed — axe skips text on images entirely. Every hero element
  clears AA at four viewport sizes, with the tightest at 4.66:1 where 4.5 is
  required. The legibility veils are attached to the text blocks rather than to
  viewport percentages, so they follow the type as the viewport height changes
  instead of letting the title drift into the bright horizon on short screens.
- Contrast: the lookbook's taupe `#8a7f70` measures 3.48:1 on the bone
  background, below AA for small text. Small text uses `#766c60` — the same hue
  and saturation, darkened to 4.6:1. The original is kept as `--muted-soft` for
  non-text use. Oxblood on the near-black surface is lifted to `--red-on-dark`
  (`#d35e5e`, 5:1).
- Status is shown as a filled versus hollow square **and** the words "Attending"
  / "Declined" — never colour alone.
- Tested at 320, 375, 430, 768, 1024, 1440 and 1920 px: no horizontal overflow,
  no text under 10 px, no console errors.
- On mobile the admin guest list becomes structured records rather than a
  horizontally scrolling table.

---

## Troubleshooting

**"RSVPs are not available right now."** `NEXT_PUBLIC_SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY` is missing. On Vercel, redeploy after adding them.

**"Administrator access is not configured."** `ADMIN_EMAILS` is empty or unset.

**"Those details were not recognised."** Either the password is wrong or the
address is not in `ADMIN_EMAILS`. The message is intentionally identical for
both. Check the exact spelling of the address in both Supabase and the variable.

**Signed in, but the guest list is empty.** Check `event_slug` in the database
matches `slug` in `config/event.ts`.

**An RSVP returns 500.** Check the Vercel function logs for a Postgres error
code. `23514` is a check-constraint violation — most often `maxAdditionalGuests`
raised in the config without a matching migration (see step 11).

**Admin redirect loop.** Usually a cookie/domain mismatch. Confirm
`NEXT_PUBLIC_SITE_URL` matches the domain you are actually visiting.

**Fonts look wrong locally.** Confirm the four `.woff2` files exist in
`app/fonts/`. They are committed to the repository on purpose.
