# CC SafeGuard Live — Supabase setup (Admin + Photo)

This branch contains the server-side foundation for individual accounts, role-based report access, and private photo storage. **It is not connected to the live website yet**: the app still uses its existing browser-only login/data until frontend integration and Supabase setup are completed.

## Selected account model
- Login: username + password.
- Admin creates accounts for Panitia and Klinik/P3K with an initial password.
- Login usernames are mapped internally to `username@accounts.ccsafeguard.local`; users do not need a real email address for this workflow.
- Password minimum in the Admin function: 12 characters.
- The Admin function can list accounts, create accounts, deactivate/reactivate accounts, and reset their passwords.

## 1. Create Supabase project
1. Create a Supabase project in your own account.
2. In **SQL Editor**, run all of `supabase/schema.sql`.
3. In **Storage**, create a bucket named `ccsg-report-photos` and set it to **Private**.
4. In Authentication settings, allow email/password sign-in. Email confirmation can be disabled for this username-alias flow; the Edge Function also creates users with email confirmed.
5. Copy the Project URL and publishable/anon key. These are public frontend configuration values, not admin secrets.

## 2. Bootstrap the first Super Admin
1. In Supabase **Authentication → Users**, create the first account manually using a valid email address and a strong password. This is only the initial bootstrap account.
2. Copy its Auth user UUID.
3. In SQL Editor, insert its profile row:
   ```sql
   insert into public.profiles(id, username, display_name, role)
   values ('PASTE_AUTH_USER_UUID', 'your-admin-username', 'Super Admin', 'admin');
   ```
4. Keep this account active. The Edge Function prevents Admin from deactivating itself.

## 3. Deploy the Admin function
Install the Supabase CLI and link the project, then deploy:
```bash
supabase functions deploy admin-manage-users
```
Set the function secrets in Supabase Dashboard → Edge Functions → Secrets (or via CLI):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**The service-role key is server-only. Never place it in GitHub Pages, JavaScript, HTML, or chat.** The Edge Function checks the caller's active Admin profile before performing account actions.

## 4. Frontend config and photo rules
- `supabase-config.example.js` is a template. Copy it to `supabase-config.js`, then fill in the URL and public key.
- `supabase-client.js` provides username login, role/profile lookup, report CRUD helpers, Admin account actions, and private photo upload/list helpers.
- Photo limits in the client: JPG/PNG/WebP, max 5 MB each. Bucket is private; the client generates short-lived signed URLs only for users allowed by report RLS.
- Recommended UI limit: max 3 photos per report. Enforce this in the form as well.
- Use fictional test incidents and synthetic photos only. Do not test with real student medical data or faces.

## Access model (SQL policies)
- Admin: all reports and account administration.
- Panitia: only general/operational reports created by their own account; other Panitia reports are hidden.
- Klinik/P3K: all medical reports. Klinik may update only the handling status, responsible staff name, and handling notes on medical reports.
- Admin can verify and manage all reports. A database trigger prevents Klinik from changing the reporter, description, category, priority, ownership, or other non-handling fields.
- Report photos inherit the same report visibility and ownership permissions.

## Important
Do not publish this branch or claim that account creation/photo upload is live until:
- Supabase project and schema are configured,
- Edge Function is deployed,
- frontend UI is wired to the Supabase adapter,
- role-based access and upload behavior have been tested with separate test accounts.
