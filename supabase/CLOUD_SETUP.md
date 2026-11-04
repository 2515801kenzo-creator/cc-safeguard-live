# CC SafeGuard Live — Supabase cloud integration

Project reference: `vhovzyzktrzenuulznzv`

This branch is being aligned with the existing Supabase schema. The integration migration
`20261104151817_existing_schema_cloud_integration.sql` has been applied to that project.

## Current cloud features

- Supabase Auth login and role lookup through `profiles`.
- Admin-only Edge Function `admin-create-user` for creating Clinic/P3K and Committee accounts.
- Shared report reads and writes through `public.reports`.
- Private photo storage in bucket `CC-report-photo`, with metadata in `public.report_photos`.
- Admin activity history in `public.activity_log`.
- Realtime subscriptions for reports, photo metadata, and activity history.
- Role restrictions: Admin sees all reports; Clinic sees medical reports; Committee sees general reports created by that account.

## Important first step: provision the first Admin

The project currently has no Auth users and no profiles. Therefore nobody can log in or create staff accounts yet.

1. In Supabase Dashboard → Authentication → Users, create the first Admin user with an email and a strong temporary password.
2. Copy the Auth user's UUID.
3. In SQL Editor, insert the matching profile (replace the example values):

```sql
insert into public.profiles (id, username, display_name, role, is_active)
values (
  'AUTH-USER-UUID',
  'admin@example.org',
  'CC SafeGuard Administrator',
  'admin',
  true
);
```

4. Sign in to the portal with that email and password.
5. Change the temporary password through the approved account-management process before operational use.

Do not allow users to select the Admin role in the account form. The Edge Function only creates `committee` and `clinic` accounts.

## Account creation

The deployed Edge Function is `admin-create-user` and requires a valid signed-in user JWT.
It checks the caller's active Admin profile before creating an Auth user and a profile row.
The profile uses the existing schema columns `username`, `display_name`, `role`, `is_active`,
and `created_by`.

The app has no hard-coded 150-account ceiling. The actual number of accounts and active logins
is still subject to the Supabase project's Auth and subscription quotas. This organization is
currently on the Free plan; check current Dashboard usage and limits before adding many users.

## Reports and photo evidence

- Reports are stored in `public.reports`; they are no longer treated as browser-local data.
- Staff can attach JPG, PNG, or WebP photos from a device or use the camera input on supported phones.
- Each photo is limited to 5 MB and stored privately in `CC-report-photo`.
- Photo metadata is stored in `public.report_photos`.
- The app creates short-lived signed URLs only for users allowed to view the associated report.
- Changes are refreshed through Supabase Realtime.

## Activity history

Report inserts and updates are recorded by the database trigger in `public.activity_log`.
Login/logout and other user actions are recorded through the authenticated
`public.record_activity` RPC. The account-creation Edge Function records account creation.
Only Admin profiles can read the activity history.

## Security and testing

- Keep Row Level Security enabled on every exposed table.
- Never put the Supabase service-role key or database password in browser code, GitHub, or chat.
- The report-photo bucket must remain private.
- Test with fictional data and separate test accounts for Admin, Clinic/P3K, and Committee.
- Verify that Clinic cannot read general reports, Committee cannot read medical reports or other Committee users' reports, and signed-out users cannot access reports or photos.
- Verify that one device's changes appear on another authorized device.
- Review Supabase Security Advisor findings before any real deployment.
- Real event or medical use requires approval from the school/event owner and an authorized adult IT administrator, a privacy notice, limited staff access, and retention/deletion rules. Do not enter real student or medical information during testing.
