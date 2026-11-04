# CC SafeGuard Live — Supabase setup

This branch now contains the integrated Supabase-backed portal UI. The GitHub Pages site is **not ready for real operations yet** until a project is configured, the schema and private Storage bucket are created, the Admin Edge Function is deployed, and the role-isolation tests below pass.

## What is implemented in this branch

- Username/password login backed by Supabase Auth.
- One shared reports database instead of browser localStorage.
- Admin can view all reports and verify/edit report records.
- Each Panitia account can view only its own general/operational reports.
- Klinik/P3K can view medical reports and update only the handler name, handling notes, and handling status.
- Admin can create Panitia and Klinik accounts, list accounts, activate/deactivate accounts, and reset passwords.
- Optional private photo upload (up to 3 per report in the UI; JPG/PNG/WebP, 5 MB maximum per file).
- Admin activity history for report creation and updates.

## 1. Set up the Supabase project

1. Create a Supabase project.
2. Open SQL Editor and inspect whether the project already has the CC SafeGuard tables. If it is a new project, run the complete supabase/schema.sql from this branch once. The function delimiters in this version use valid PostgreSQL dollar quoting.
3. In Storage → New bucket, create ccsg-report-photos and set it to Private.
4. Set the bucket's file-size limit to 5 MB. The browser validates file size too, but a server-side limit is important.
5. In Authentication → Providers, enable Email sign-in. The username flow maps usernames to the internal email alias username@accounts.ccsafeguard.local; users do not need an actual mailbox for that alias.

Do not run an old copy of schema.sql from a previous branch version. If you already ran a previous SQL version, inspect its result first; do not repeatedly run SQL blindly against a database that may already contain data.

## 2. Create the first Admin account

The first Admin must be bootstrapped manually because no Admin account exists yet to use the account-management function.

1. In Authentication → Users, add a user with an email alias in this format: adminusername@accounts.ccsafeguard.local.
2. Set a strong password and mark the user as confirmed/auto-confirmed.
3. Copy that Auth user's UUID.
4. In SQL Editor, insert the matching profile. Replace the three example values:

   insert into public.profiles (id, username, display_name, role)
   values ('AUTH_USER_UUID', 'adminusername', 'Admin CC SafeGuard', 'admin');

5. Use adminusername plus that password on the portal login screen.

Keep at least one active Admin account. Do not share the Admin password.

## 3. Deploy the Admin Edge Function

The function creates and manages Auth users with the server-only service-role key. Deploy it from a terminal with the Supabase CLI:

    supabase login
    supabase link --project-ref YOUR_PROJECT_REF
    supabase functions deploy admin-manage-users

In Supabase Edge Functions → Secrets, set:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

The service-role key is highly privileged. Never put it in internal.html, supabase-client.js, any supabase-config.js file, GitHub Pages, or a chat message. It belongs only in Edge Function secrets.

## 4. Connect GitHub Pages to Supabase

1. Open supabase/supabase-config.example.js.
2. Copy its contents into a new file named supabase-config.js at the repository root, beside internal.html.
3. Fill in the Supabase Project URL and the publishable key (or legacy anon key) from Project Settings → API.
4. Do not use the service_role key in this file.
5. Commit/push that root-level config file to the feature branch when ready. The portal intentionally refuses login while the placeholder values remain.

Example shape:

    window.CCSG_SUPABASE_CONFIG = {
      url: "https://YOUR_PROJECT_REF.supabase.co",
      anonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
    };

The publishable/anon key is designed for browser use; row-level security policies are what restrict data access. Never disable RLS to make the app work.

## 5. Preserve the existing default Panitia account

The old login on the main branch is browser-side and cannot be converted automatically into a Supabase Auth identity. The old main branch remains unchanged while this feature branch is being prepared.

After the first Admin logs in, recreate the existing default Panitia account from Manajemen akun, using its existing username if you want to preserve that login name, and assign a new strong password of at least 12 characters. Do not delete the default account. The new Panitia account will have its own Auth user ID, and only reports created by that identity will appear in that account's history.

Reports that existed only in a browser's localStorage are not automatically copied into Supabase. Export or migrate them deliberately only after reviewing privacy and data quality.

## 6. Test before merging or using the site

Use fictional incidents and synthetic photos only. Do not test with real student details, medical narratives, or identifiable faces.

| Test account | Expected result |
|---|---|
| Admin | Can view all general and medical reports; can verify/edit; can manage Panitia and Klinik accounts |
| Panitia A | Can create general reports and see only reports created by Panitia A |
| Panitia B | Can create general reports and see only reports created by Panitia B; cannot see Panitia A reports |
| Klinik | Can see all medical reports; cannot see general reports; can only update medical handling fields |

Also verify that:
- A report submitted on one device appears after login on another device.
- Disabling a Panitia account prevents that account from logging in.
- Klinik cannot change the report title, description, reporter, category, priority, or owner.
- Photo URLs are signed/private and unauthorized users cannot open them.
- The browser console has no missing-config, SDK, or permission errors.

Only after these checks pass should the pull request be reviewed and merged into main.

## Access-control summary

- Admin: all reports and account administration.
- Panitia: own general/operational reports only, enforced by Supabase RLS using created_by = auth.uid().
- Klinik/P3K: all medical reports. A database trigger restricts updates to status, assignee, handling_notes, and updated_at.
- Photos: private Storage bucket; object paths start with the report UUID and Storage policies check the same report permissions.
- Audit: report changes are logged server-side; only Admin can read the audit list.
