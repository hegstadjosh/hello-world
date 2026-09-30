# Campus, captioned.

Week 2 extends the same Next.js repository used for Week 1. The homepage reads
`campus_captions` from Supabase with an anonymous read-only key and renders cards.
There are no mock rows or fallback data in the app: a database failure shows an
unavailable message, and an empty table shows an empty state.

## Setup

1. Use **Josh's dedicated course Supabase project** (`humor-course`, `xtrcxpdurxwuycbbncrl`). Do not reuse a business or
   shared classroom database. Confirm the course provisioned project before
   applying `database/setup.sql`; that script creates one table, a public SELECT
   policy, and six non-sensitive demo rows. Do not change existing class policies.
2. Copy `.env.example` to `.env.local`, preserving any existing Vercel variables,
   and fill in the project URL and **anon/publishable key**, never service role.
3. `npm ci`, then `npm run dev`.
4. Add the same two variables to the Vercel **Preview** environment. Deploy this
   branch, ensure the URL is public, and verify the six cards load without login.
5. Review the app and submit its immutable deployment URL on assignment 27.

## How it works

- `src/lib/captions.ts`: configures the Supabase client, selects four explicit
  columns, orders by ID, limits the query to 50 rows, and handles failed requests.
- `src/app/page.tsx`: dynamic server page; every visit reads current database data.
- `database/setup.sql`: table and seed data, applied to the dedicated `humor-course` project.
- Supabase RLS grants visitors read access only. Database credentials live in
  environment variables and are excluded from Git.

## Checks

`npm run lint` and `npm run build`. Live acceptance additionally requires verifying
actual rows from the dedicated course database on the public deployment.

## Deployment readiness

The dedicated Personal free-plan database has been created and seeded. A real
anonymous query returned all six records. Schema migration is tracked in
`supabase/migrations/20260923191043_campus_captions.sql`. No existing shared
classroom or business database was modified. Preview environment variables are
configured on the existing Vercel hello-world project.

## Week 3: Google sign-in and profiles

The same app now uses Google OAuth with Supabase SSR cookies. `/auth/callback`
exchanges the authorization code and directs new users to enter their names.
`/members` and `/profile` verify the signed-in user on the server. Profile actions
also verify identity and use that user's database permissions.

Apply `supabase/migrations/20260930214150_profiles_and_avatars.sql` to the linked
course project. A database trigger creates a nullable-name profile when an auth
user is created. RLS permits only the owner to read/edit it. Photos are stored in
the private `avatars` Storage bucket, limited to JPEG/PNG/WebP and 3 MB; each user
can access only their own folder. The app displays short-lived signed image URLs.

Google project: `campus-captioned-humor`. Configure a Web OAuth client with the
redirect URI `https://xtrcxpdurxwuycbbncrl.supabase.co/auth/v1/callback`, then save
its ID and secret in the course project's Google provider settings. No OAuth
secret belongs in application code or Vercel's public environment variables.
Allow each deployed app's exact `/auth/callback` URL in Supabase Auth redirect
settings. The application requests only Google's basic identity scopes.

Before submitting assignment 28, verify public caption loading, Google login,
first-login name entry, editing both names, photo upload/persistence, sign-out,
and signed-out redirects from protected pages. Submit the immutable Vercel URL.
Previous Week 2 deployment remains available for rollback.
