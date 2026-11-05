# CC SafeGuard Live — Supabase setup

Project reference: `vhovzyzktrzenuulznzv`

## Current project status

- The first Admin Auth user and matching `public.profiles` row have already been created and verified.
- Do not run the old first-Admin SQL insert again. It would produce a duplicate primary-key error.
- Existing schema migrations are already applied:
  - `20261104151817_existing_schema_cloud_integration`
  - `20261104152138_allow_evidence_upload_for_accessible_reports`
  - `20261104153101_admin_activity_log_expand`
  - `20261104153156_fix_private_report_photo_bucket`
  - `20261104153439_restrict_legacy_activity_rpc`
- Edge Function `admin-manage-users` is deployed, requires JWT verification, and supports username-based staff account creation, listing, activation/deactivation, password reset, and guarded permanent deletion.
- The updated frontend is on branch `cloud-backend-foundation` and in draft PR #2. It is not yet the default-branch/live-site update.

## How staff accounts work

Admin accounts continue to sign in with their school email. Panitia and Klinik/P3K accounts can be created with a username and do not need Gmail.

When Admin creates a staff account:
- `display_name` is the name shown in the profile (for example, Max).
- `username` is the staff login ID (for example, max).
- The Edge Function creates a Supabase Auth identity using the internal address `username@accounts.ccsafeguard.local`; this is not a real mailbox and is not used to receive email.
- The role is restricted to `committee` or `clinic`; the public form cannot create another Admin.
- The profile is stored in `public.profiles`; password credentials are managed by Supabase Auth and are never stored in the profile table.

Each account must have its own strong password (minimum 12 characters). Do not reuse one shared password.

## Supabase Dashboard checklist (no SQL required)

1. Open the existing Supabase project.
2. Go to **Authentication → Users** and confirm the first Admin user exists.
3. Go to **Edge Functions** and confirm `admin-manage-users` is **ACTIVE**, version 2, with JWT verification enabled.
4. Go to **Storage → Buckets** and confirm `CC-report-photo` exists and remains **private**.
5. Do not make database tables or the photo bucket public. Keep Row Level Security enabled.
6. Do not paste the service-role key into the website, GitHub, or chat. Edge Functions use server-side credentials only. If the function reports missing server configuration, check the project's Edge Function secrets in the Dashboard; do not expose secret values.

No additional SQL is needed for the first Admin or for staff account creation. Admin creates staff accounts through the website; the Edge Function writes to Supabase Auth and Profiles.

## Website rollout and test

Before merging PR #2 into `main`, test the branch build with fictional accounts only:

1. Sign in as the existing Admin (school email).
2. Open **Manajemen akun**.
3. Create a fictional Panitia account, e.g. display name `Max`, username `max`, and a unique strong password.
4. Create a fictional Klinik/P3K account with a different username and unique password.
5. Sign out, then sign in as `max` using the username and its password. Confirm the profile shows `Max` and role `Panitia`.
6. Sign in as the test Klinik account and confirm its profile/role is Klinik/P3K.
7. From a second device, sign in with the same test account and confirm the same cloud data is available.
8. Test deactivate/reactivate and password reset. Test permanent deletion only on a test account with no reports or uploaded photos.

Permanent deletion is intentionally refused when an account owns reports or uploaded evidence, so historical records keep their attribution. Deactivate such accounts instead.

## Reports and photo evidence

- Reports are stored in `public.reports`.
- Photo files are stored in private bucket `CC-report-photo`; metadata is stored in `public.report_photos`.
- JPG, PNG, or WebP files are limited to 5 MB each.
- The app creates short-lived signed URLs only for users allowed to view the associated report.
- Report, photo metadata, and activity updates use Supabase Realtime.

## Safety and privacy

Use fictional data while testing. Real event or medical use requires approval from the school/event owner and an authorized adult IT administrator, a privacy notice, limited staff access, and clear retention/deletion rules. Do not enter real student or medical information during testing.


## Photo bucket policy correction (2026-11-05)

The website uses the private bucket `CC-report-photo`. This bucket was verified to exist with:
- Public access: disabled
- Maximum file size: 5 MiB
- Allowed types: JPEG, PNG, WebP

A separate legacy bucket `ccsg-report-photos` also exists. It is not used by the current website; leave it untouched for now.

The Storage object policies for `CC-report-photo` have now been added and verified:
- Authenticated users can upload only to a report they own (Admin may upload for accessible reports).
- Users can read photos only when they can access the related report.
- Only Admin can delete objects in this bucket.

The migration is recorded as `20261105160000_fix_cc_safeguard_photo_bucket_policies` and has already been applied to the connected Supabase project. Do not run it again manually.
