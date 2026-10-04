# Padre events — events.padre65.com

Next.js app. Brand-wide rules live in `../CLAUDE.md` and load automatically.

Serves the Padre65 × Kiez page (the site root since 4 Oct 2026), the archived
pop-up page, the model search competition page, and the APIs behind them.

```
public/kiez/                Padre65 × Kiez (17 Oct 2026) — served at / and /kiez
app/api/kiez/               Kiez RSVP endpoint (+ calendar/, photo-drop/)
lib/kiez-sheets.ts          Kiez tabs in the pop-up spreadsheet
app/admin/KiezDashboard.tsx /admin lands on Kiez
app/api/popup/              pop-up signup endpoint
app/api/model-search/       model search signup endpoint
app/api/model-search/calendar/
app/admin/PopupDashboard.tsx
public/popup/               the pop-up page + its fonts, images, media
public/model-search/        the model search page + its fonts and images
lib/popup-types.ts
```

## The Kiez page

`public/kiez/index.html` — same pattern as model search: one file, `CONFIG` at
the top of the script. Everything still unconfirmed lives there and renders
nothing until filled: `event.end` (null → start-only calendar entry),
`phase.cutoff` (null → never flips to the after-the-night layout on its own),
`audio.src` (empty → music module hidden), `faq[].a` (empty → question
omitted), `photos.published/url`.

Rows go to the pop-up spreadsheet (`GOOGLE_POPUP_SHEET_ID`), tabs
"Kiez RSVPs" and "Kiez photo drop", each row stamped
`padre65-kiez-2026-10-17`. Visiting with `?test=kiez` writes to the
"(test)" twins of those tabs instead, which the admin never counts — use that
for any test against production. Duplicates (same request ID, same email in
any case, same mobile by its last nine digits) return the existing row.

Vercel does not release sensitive env values to `vercel env pull`, so local
runs cannot reach the real sheet. Point `GOOGLE_SHEETS_API_URL` and
`GOOGLE_TOKEN_URL` at a local stub instead, and delete that `.env.local`
before any deploy.

Deploys are by `vercel deploy --prod` from this folder, not by git push.

## The model search page

`public/model-search/index.html` — one self-contained file, all CSS and JS
inline, with a `CONFIG` object at the top of the `<script>` holding dates,
hours, address, image paths and links. The markup is written from it at
runtime, so a date exists in one place only.

It resolves three things against this origin, which is why it cannot be lifted
elsewhere without work:

- `/popup/fonts/…` — Sanchez and Cormorant Garamond, shared with the pop-up
  page rather than duplicated
- `/popup/images/collection-0*.jpg` — the pop-up's own six frames
- `/api/model-search` — the form posts same-origin, so no CORS

There is an older copy of this page archived at
`../website/model-search/` (152,386 bytes, 19 Sept 17:25). **This folder holds
the newer one** (154,483 bytes, 18:30). This is the source of truth.

## Before it goes behind paid traffic

- **`CONFIG.rsvp.mode`** — in `"preview"` the flow runs end to end but
  **every registration is thrown away**. Never run paid traffic at it in
  preview.
- **The newsletter is opt-in.** Registering is not consent to be marketed at.
  The payload carries `newsletter: true|false`. Import only those who ticked.
- **Five `[CHECK]` markers in CONFIG** — public promises only Padre can
  confirm: Sunday's hours, the 18+ minimum, **what the prize covers** (flights
  and accommodation, or not — the single biggest reason someone decides the
  trip is real), when the winner is announced, and the promoter's registered
  name and address.

## Open Graph

Absolute URLs are hard-coded in the head, because a link scraper has no page to
resolve a relative path against. Every `https://events.padre65.com` has to
change if the page moves. The OG image is 1200×630 — the poster cropped to
landscape, because the poster is 4:5 and platforms would crop the type off.

The page is deliberately indexable; the pop-up page is `noindex, nofollow`.
