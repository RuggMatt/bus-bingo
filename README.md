# Bus Bingo

Mark off which buses you've seen around Edmonton. Installable as a PWA and works offline.
Signing in is optional and saves your progress to Supabase so it follows you across devices.

## How data is stored

- **On the device (always):** IndexedDB (`busBingoDB`, see `src/lib/db.js`) holds the route list
  and your sightings. This is what the app reads and writes, so it works offline and signed out.
  Older installs that used the v1 `buses` store are migrated automatically.
- **In Supabase (when signed in):** the `seen_buses` table. `src/lib/sync.js` syncs both ways
  (last write wins) on sign-in, after each change, when the app regains focus, and when the
  device comes back online.
- **First sign-in:** anything marked while signed out is uploaded to the account. Signing out
  clears the device copy (it's saved in your account) and leaves a fresh card.
- **Multiple cities:** routes and sightings are keyed by `agency_id`. Edmonton (`ets`) is the
  only agency today; add one to `src/lib/agencies.js` and the `agencies` table to support more.

## Supabase setup

1. Create a Supabase project.
2. Apply the schema in `supabase/migrations/` (with the Supabase CLI: `supabase link` then
   `supabase db push`, or paste the SQL into the SQL editor).
3. Under **Authentication → URL Configuration**
   (`https://supabase.com/dashboard/project/<ref>/auth/url-configuration`), set the **Site URL**
   to where the app is deployed (e.g. `https://busbingo.example.com`) and add it plus
   `http://localhost:5173/**` under **Redirect URLs**.
4. Put the one-time code in the sign-in email. The installed iOS app can't receive magic links
   (they open in Safari), so users type the code instead.
   - Supabase only lets you edit email templates once custom SMTP is set up: **Authentication →
     Emails → SMTP Settings**, enable custom SMTP and enter your provider's details (Resend,
     Postmark, Brevo, SES…). The built-in sender is also limited to a few emails an hour and
     to your own team's addresses, so you need this for real users anyway.
   - Then **Authentication → Emails → Templates → Magic Link**
     (`https://supabase.com/dashboard/project/<ref>/auth/templates`) and add the code, e.g.
     `<p>Your code: <strong>{{ .Token }}</strong></p>`. Keep the existing
     `{{ .ConfirmationURL }}` link too. Do the same in the **Confirm signup** template, which is
     what first-time users receive.
   - Code length (6–10 digits) is set under **Authentication → Sign In / Providers → Email**.
5. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Without those variables the app runs local-only and the sign-in panel is hidden.

## Developing

```sh
npm install
npm run dev
```

The service worker (`src/service-worker.js`) is only registered in production builds; use
`npm run build && npm run preview` to test offline behaviour and installation.

## Building

```sh
npm run build
```

Outputs a static site to `build/` (SPA fallback `index.html`).
