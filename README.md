# PADRE65 — Events

An art-directed, unlisted event invitation and RSVP microsite. One scrolling
page for guests, a private guest list for you.

- **Public invitation** — `/`
- **Administrator sign-in** — `/admin/login`
- **Guest list** — `/admin`
- **Intended production URL** — `https://events.padre65.com`

Next.js 16 (App Router) · TypeScript · CSS Modules · Google Sheets · Vercel.
No UI framework, no CSS framework, no analytics.

---

## Contents

1. [Local installation](#1-local-installation)
2. [Development command](#2-development-command)
3. [Production build](#3-production-build)
4. [Create the Google Sheet](#4-create-the-google-sheet)
5. [Create a service account](#5-create-a-service-account)
6. [Share the sheet with the service account](#6-share-the-sheet-with-the-service-account)
7. [Keep the sheet private](#7-keep-the-sheet-private)
8. [Set the administrator password](#8-set-the-administrator-password)
9. [Generate the session secret](#9-generate-the-session-secret)
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

Then open <http://localhost:3000>. The invitation renders fine with nothing
configured; submitting an RSVP returns a polite "not available right now" until
you complete steps 4–10.

## 3. Production build

```bash
npm run build     # production build (also runs TypeScript)
npm start         # serve the production build locally
npm run lint      # ESLint
npx tsc --noEmit  # type check on its own
```

---

## 4. Create the Google Sheet

1. Create a new spreadsheet at <https://sheets.new>.
2. Rename the first tab to **RSVPs** (or set `GOOGLE_SHEET_TAB` to whatever you
   call it).
3. Put this header in row 1, one value per cell across A to L:

   ```
   Submitted at (UTC) | Event | First name | Last name | Status | Party size |
   Guest 1 first | Guest 1 last | Guest 2 first | Guest 2 last |
   Guest 3 first | Guest 3 last
   ```

   Or run `npm run sheet:header` after step 5 and it writes the header for you.

4. Copy the spreadsheet ID out of the URL — it is the long string between
   `/d/` and `/edit`:

   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```

   That is `GOOGLE_SHEET_ID`.

The app only ever appends rows and reads columns A–L. It never deletes, never
reorders, and ignores rows belonging to a different `slug`, so you can keep
several events in one sheet if you want.

## 5. Create a service account

The site signs in to Google as a robot, not as you. That means no OAuth consent
screen and no token that expires when you change your password.

1. Go to <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library → Google Sheets API → Enable.**
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Give it a name like `padre65-events`. No roles are needed — the sheet itself
   grants the access.
4. Open the service account → **Keys → Add key → Create new key → JSON.**
   A file downloads.
5. Out of that file you need exactly two values:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

> The private key is a credential as powerful as a password. Put it in your
> environment variables and nowhere else. Delete the downloaded JSON once the
> two values are stored, and never commit it.

When you paste the key into an environment variable, keep it on one line with
its `\n` escapes intact and wrap the whole thing in double quotes. The app
converts those escapes back into newlines at runtime.

## 6. Share the sheet with the service account

Open the spreadsheet → **Share** → paste the service account's email
(`...iam.gserviceaccount.com`) → give it **Editor** → Send.

This is the step people forget. Without it every write fails with a 403.

## 7. Keep the sheet private

**Do not use File → Share → Publish to the web, and do not set "Anyone with the
link" on the spreadsheet.** The sheet is your database. Anyone who can open it
can read every guest's name.

Share it only with the service account and with people who should see the guest
list. That is the whole access model — there is no second layer behind it.

## 8. Set the administrator password

The guest list at `/admin` is protected by one shared password, set in
`ADMIN_PASSWORD`. There are no user accounts to create.

Use something long and random rather than memorable:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Changing the value and redeploying revokes access immediately.

## 9. Generate the session secret

`ADMIN_SESSION_SECRET` signs the admin session cookie. Any long random string
works:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing it signs everyone out. **Both** `ADMIN_PASSWORD` and
`ADMIN_SESSION_SECRET` must be set — if either is missing, `/admin` refuses
everyone rather than falling open.

## 10. Configure local environment variables

```bash
cp .env.example .env.local
```

Fill in the values from step 4 and step 9. `.env.local` is git-ignored;
`.env.example` contains placeholders only and is safe to commit.

| Variable | Where it runs | Purpose |
|---|---|---|
| `GOOGLE_SHEET_ID` | **server only** | Which spreadsheet to write to |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | **server only** | Who the app signs in as |
| `GOOGLE_PRIVATE_KEY` | **server only** | Signs the Google auth request |
| `GOOGLE_SHEET_TAB` | **server only** | Optional; defaults to `RSVPs` |
| `ADMIN_PASSWORD` | **server only** | Opens `/admin` |
| `ADMIN_SESSION_SECRET` | **server only** | Signs the admin cookie |
| `NEXT_PUBLIC_SITE_URL` | client + server | Canonical URL and Open Graph |

Only `NEXT_PUBLIC_SITE_URL` is exposed to the browser. Everything else is
server-only and is verified absent from the client bundle by the test suite.

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

**`maxAdditionalGuests`** is enforced in the browser and again on the server,
which is the authority. Raising it above 3 also means adding columns to the
sheet and widening the row builder in `lib/sheets.ts` — the sheet has fixed
columns for three guests.

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

Three files, all generated from `Logos/Main/Logo_Olives_Red.png`:

| File | Size | Used by |
|---|---|---|
| `public/favicon.ico` | 16, 32, 48, 64 | browser tabs, bookmarks |
| `public/icon.png` | 512 | Android, high-density tabs |
| `public/apple-icon.png` | 180 | iOS home screen |

Each favicon size is rendered from the source separately rather than downscaled
from one large image — at 16px that is the difference between a mark and a
smudge — and the small sizes carry almost no margin, because at 16px a single
pixel of padding costs 6% of the icon.

The mark sits on the brand's bone `#f4f1ea` rather than staying transparent.
The red measures **1.6:1** against a dark browser tab strip, which is
effectively invisible, and **6.6:1** on bone whatever theme the browser is in.
If you would rather it were transparent, that is the trade you are making.

The browser theme colour is separate, in `app/layout.tsx` (`viewport.themeColor`).

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

**Project → Settings → Environment Variables.** Add these for **Production**,
**Preview** and **Development**:

| Name | Value |
|---|---|
| `GOOGLE_SHEET_ID` | the ID from the spreadsheet's URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `...iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | the key, quoted, `\n` intact — mark **Sensitive** |
| `ADMIN_PASSWORD` | your chosen password — mark **Sensitive** |
| `ADMIN_SESSION_SECRET` | the hex string — mark **Sensitive** |
| `NEXT_PUBLIC_SITE_URL` | `https://events.padre65.com` |

Pasting `GOOGLE_PRIVATE_KEY` into Vercel: keep it on a single line, keep the
`\n` sequences as the literal two characters, and wrap it in double quotes.

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
- Enter a wrong password → refused, with no hint about what was wrong.
- Enter the real password → the guest list loads.
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

- **Keep it, hide it** — `seo.noindex: true` is already the default; stop
  sharing the link. The sheet stays where it is.
- **Archive and clear** — export the CSV, store it wherever guest data belongs,
  then delete the rows from the sheet by hand. Deleting rows in Google Sheets is
  instant and the app does not care about gaps.
- **Run the next event** — change `slug` in `config/event.ts` and redeploy. Old
  rows stay in the sheet but are filtered out everywhere; the new list starts
  empty. You can keep several events in one spreadsheet this way.
- **Take the site down** — remove the domain in Vercel, or delete the project.
  The sheet survives independently; deleting it is the irreversible step.

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
  sheets.ts                     Google Sheets read/append (server-only)
  admin-session.ts              password check + signed session cookie
  csv.ts                        CSV with formula-injection escaping
  rsvp-types.ts                 row types and totals
proxy.ts                        first-pass /admin redirect
```

### Request flow

**Guest submits an RSVP.** The browser POSTs to `/api/rsvp`. The route rejects
non-JSON and anything over 4 KB, parses the body with Zod, ignores every field
it did not ask for (including any `party_size` the browser sent), calculates the
party size itself, appends one row to the sheet, and returns only that
submission's own fields. It never reads the sheet back, so it cannot leak
another guest's response or a running total.

**Administrator opens the dashboard.** `proxy.ts` bounces visitors with no
session cookie to `/admin/login`. The page then independently verifies the
cookie's HMAC and expiry server-side. Guest data is fetched client-side from
`/api/admin/rsvps`, which verifies the session again, so **no guest name is ever
present in server-rendered HTML**.

---

## Security model

- **The Google private key never reaches the browser.** `lib/sheets.ts` imports
  `server-only`, so the build fails if it is ever pulled into a client
  component. The test suite scans every built client chunk for the key, the
  admin password, the session secret and the sheet ID, and fails if any appear.
- **The sheet is the access boundary.** Google only lets the service account in
  because you shared the sheet with it. Keep the spreadsheet private — do not
  publish it to the web or enable "anyone with the link". There is no second
  layer behind that.
- **Authorisation is re-checked on every admin request**, not once at sign-in.
  The middleware only looks for a plausible cookie; the signature and expiry are
  verified in the route handlers, where `node:crypto` is available.
- **The session cookie cannot be extended.** Its expiry is inside the signed
  payload, so editing the cookie invalidates it.
- **Fails closed.** If `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` is missing,
  `/admin` refuses everyone.
- **Brute force.** Every sign-in attempt pauses for a fixed 600 ms whether the
  password is right or wrong, and the comparison is constant-time.
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

### "It said I was on the list, but the sheet is empty"

Start here, because this one is misleading. The confirmation screen only
appears after Google returns a success. A wrong ID gives 404, an unshared sheet
gives 403, a missing tab gives 400 — all of which show the visitor an error
instead. So if you saw the confirmation, a row was written. It is in a
different place from the one you are looking at.

Two tools find it.

**`npm run sheet:check`** — reads your `.env.local` and prints the *title* of
the spreadsheet those credentials actually open, the names of all its tabs, and
every row in the RSVP tab with its row number:

```
Spreadsheet:  "Padre65 House Party RSVPs"
URL:          https://docs.google.com/spreadsheets/d/1AbC.../edit
Tabs:         "RSVPs", "Sheet2"

  3 rows in "RSVPs" (A1:L):
     1  Submitted at (UTC) | Event | First name | ...
     2  2026-08-09 14:12:03 | house-party-2026 | Ada | Lovelace | attending | 2 | ...
```

If that title is not the document you have open, you have two spreadsheets.

**`/api/admin/diagnostics`** — the same information from the *deployed* server,
so it reflects the environment variables in Vercel rather than the ones on your
laptop. Sign in at `/admin`, then visit the path in the same browser. This is
the one that matters when local and production disagree.

Third possibility, if both agree and the row genuinely is in your sheet: press
`Ctrl` + `End` (on a laptop without an End key, `Fn` + `Ctrl` + `→`) to jump to
the last used cell. `append` writes below the last row containing anything in
columns A–L, so a single stray character typed at row 400 puts new responses at
row 401 with a field of blank rows above them.

### Everything else

**"RSVPs are not available right now."** One of `GOOGLE_SHEET_ID`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL` or `GOOGLE_PRIVATE_KEY` is missing. On Vercel,
redeploy after adding them — env vars are read at build time too.

**"Administrator access is not configured."** `ADMIN_PASSWORD` or
`ADMIN_SESSION_SECRET` is missing. Both are required; it fails closed.

**An RSVP returns 500, logs show `Sheets append failed (403)`.** The sheet has
not been shared with the service account. Open the spreadsheet → Share → add
the `...iam.gserviceaccount.com` address as **Editor**. This is the single most
common setup mistake.

**`error:1E08010C:DECODER routines::unsupported`.** OpenSSL could not parse
`GOOGLE_PRIVATE_KEY`. The app now repairs the usual manglings itself — quotes
that came along for the ride, `\n` escapes, Windows line endings, lost
newlines, even the whole JSON file pasted into the box — so if you still see
this, the value is genuinely damaged rather than merely untidy.
`/api/admin/diagnostics` says which.

One rule that has not changed: **in the Vercel dashboard, do not wrap the value
in quotes.** Quotes are a `.env` file convention; a dashboard text box stores
them as part of the value.

**`Sheets append failed (404)`.** Either `GOOGLE_SHEET_ID` is wrong, or the tab
is not called `RSVPs` (set `GOOGLE_SHEET_TAB` to match).

**Signed in, but the guest list is empty.** Check the `Event` column in the
sheet matches `slug` in `config/event.ts`. Rows for other slugs are filtered
out on purpose.

**Admin redirect loop.** Usually a cookie/domain mismatch. Confirm
`NEXT_PUBLIC_SITE_URL` matches the domain you are actually visiting.

**Fonts look wrong locally.** Confirm the four `.woff2` files exist in
`app/fonts/`. They are committed to the repository on purpose.
