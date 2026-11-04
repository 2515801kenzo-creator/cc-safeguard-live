# CC SafeGuard Live — implementation status

## Development branch
feature/admin-accounts-photo-storage

## Completed in this branch
- Replaced the browser-only portal login/report workflow with a Supabase-backed frontend.
- Added per-account Panitia ownership filtering in the UI; database RLS is the authoritative access control.
- Added Admin report management, account creation/listing, activate/deactivate, and password reset UI.
- Added Klinik medical-report handling UI with the handler name, notes, and status.
- Connected private report photo upload and signed-URL display.
- Corrected PostgreSQL function dollar-quoting and tightened role policies in supabase/schema.sql.
- Updated setup and test instructions in supabase/README.md.

## Not yet completed / requires project-owner action
- Supabase project schema has not been executed or verified from this repository tool.
- Private Storage bucket has not been created or tested.
- First Admin Auth user/profile has not been bootstrapped.
- admin-manage-users Edge Function has not been deployed.
- Root-level supabase-config.js has not been populated with the Project URL and public publishable/anon key.
- Cross-device and role-isolation tests have not been run against a live Supabase project.
- Changes are only on the feature branch; main and the public GitHub Pages site have not been changed.

## Safety gate
Do not use real student or medical data until the owner has configured Supabase, deployed the function, verified RLS with separate accounts, tested cross-device synchronization, and received appropriate school/event approval. Never expose a service-role key in frontend code.
