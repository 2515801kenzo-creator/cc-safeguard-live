# CC SafeGuard Live — Cloud backend setup

This branch adds the shared-backend foundation and connects the internal portal's login, profile lookup, and Admin account creation to Supabase Auth.

## What this enables

- One central PostgreSQL database shared by authorized phones, tablets, and computers.
- Supabase Auth accounts instead of usernames/password verifiers embedded in browser JavaScript.
- Role-based database access: Admin can see all reports; Clinic can see medical reports; Panitia can see general/operational reports.
- Private evidence storage with access policies.
- Server-generated timestamps and database audit events.
- A server-only Edge Function for Admin to create Clinic and Panitia accounts.

## Important: not live yet

The frontend on this branch now uses Supabase Auth for login, reads the signed-in user's role from `profiles`, and calls the Admin-only Edge Function to create Clinic/Committee accounts. The SQL migration and Edge Function still must be applied/deployed in the Supabase project before those features work. Report content, activity history, and attachments in the current portal are still browser-local; cross-device report sync is a separate unfinished integration.

Do not enter real student or medical information into the current site. For testing, use fictional data only. A real event deployment needs school/event-owner approval, an approved privacy notice, limited staff access, retention/deletion rules, and an adult/authorized IT administrator to manage the backend.

## 1. Create a Supabase project

The configured project reference is `vhovzyzktrzenuulznzv` and its API URL is `https://vhovzyzktrzenuulznzv.supabase.co`. Confirm that this is the school/event-owner-approved project before proceeding. Keep the database password private. Review the provider's current plan limits and backup policy.

## 2. Apply the database migration

Open the project's SQL Editor and run:

`supabase/migrations/20261104000100_cloud_backend.sql`

The migration creates:
- `profiles`, `reports`, `report_events`, and `report_attachments`
- role-based Row Level Security (RLS) policies
- a private `report-evidence` Storage bucket (5 MB limit; JPEG, PNG, WebP, PDF)
- database-generated update timestamps and append-only report event records

RLS is essential: the browser's publishable key is not a secret. Never disable RLS on these tables.

## 3. Create the first Admin account

1. In Supabase Dashboard → Authentication → Users, create the first administrator user.
2. Copy that user's UUID.
3. In SQL Editor, insert the matching profile (replace the three example values):

```sql
insert into public.profiles (id, display_name, role, active)
values ('AUTH-USER-UUID', 'Event Administrator', 'admin', true);
```

Do not make Admin role selectable in a public sign-up form.

## 4. Deploy the account-creation function

Deploy `supabase/functions/admin-create-user/index.ts` as the Edge Function named `admin-create-user`.

Set these server-side secrets in the Supabase project:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must stay in Edge Function secrets. Never put it in `internal.html`, a public config file, GitHub, screenshots, or chat. The function checks that the caller is an active Admin before creating a Clinic or Panitia account.

## 5. Frontend connection (next implementation step)

After the project exists, the frontend needs the project's Project URL and publishable/anon key. Those two values are intended for browser use when RLS is correctly configured. Then replace localStorage authentication and data calls with:
- `supabase.auth.signInWithPassword()` / `supabase.auth.signOut()`
- read the signed-in user's role from `profiles`
- read/write `reports` through RLS
- subscribe to Postgres changes for live refresh
- upload evidence to the private Storage bucket and create `report_attachments` rows
- call `admin-create-user` from the Admin account page

The frontend must not claim “cloud synced” until the server confirms the write. If offline, clearly show that a report is pending locally and not yet delivered. Do not silently treat localStorage as the authoritative database.

## 6. Verify permissions before real use

Test with separate accounts and separate devices:
- Admin sees both general and medical test reports.
- Clinic sees medical reports only.
- Panitia sees general reports only.
- Signed-out visitors cannot read or write reports.
- A Clinic user cannot change their own role or read general reports.
- A Panitia user cannot change their own role or read medical reports.
- Only Admin can read the audit log or create staff accounts.
- Attachments are private and inaccessible without a permitted session.
- Changes from one device appear on the other after Realtime is connected.
- Sign-out revokes the local session and protected pages return to login.

Also test rejected requests directly, not only the visible interface. Keep test data fictional.

## Security notes

- Enable and test RLS for every exposed table. The SQL migration revokes broad client grants before granting only required operations.
- Never commit service-role keys, database passwords, or user passwords.
- Admin accounts are provisioned by the trusted project owner; the account-creation function cannot create another Admin.
- Medical-category reports are restricted to Clinic and Admin. Do not store unnecessary medical details or identifying student data.
- The current front-end UI still needs the cloud integration pass; this branch is a backend foundation, not a production-ready deployment.
