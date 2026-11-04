# Supabase setup — CC SafeGuard Live

This directory is the backend foundation for authenticated multi-device sync.

## What is included

- \`schema.sql\`: event membership, role-aware report storage, operational state, audit events, notification preferences and idempotent offline queue.
- \`supabase-client.js\`: browser client bootstrap, password sign-in, membership validation, report/state CRUD and realtime subscriptions.
- \`supabase-config.example.js\`: safe browser configuration template.

## Important status

The current GitHub Pages app still uses local browser storage and demo/local role controls in its existing screens. These files establish the secured backend schema and client API, but **do not yet switch every existing screen to Supabase**. Do not announce that records are synced until the UI integration, offline queue acknowledgement and cross-device acceptance tests are completed.

Medical and general reports are deliberately stored in a separate row-level secured table. Do not move the full \`ccsg_internal_reports_v2\` object into a shared JSON state row: that would expose medical report data to roles that should not see it.

## 1. Create the Supabase project

1. Create a Supabase project in the organization that will own the event data.
2. Open SQL Editor and run \`schema.sql\`.
3. Copy Project URL and the publishable (or legacy anon) key into a local \`supabase-config.js\` copied from \`supabase-config.example.js\`.
4. Add \`supabase-config.js\` to the site deployment only after confirming it contains no service-role/secret key. The publishable key is public by design; RLS is the security boundary.

## 2. Create the event and users

Run this SQL in Supabase SQL Editor, replacing the event name/slug:

\`\`\`sql
insert into public.events (slug, name)
values ('cc-cup-xli', 'CC Cup XLI')
on conflict (slug) do nothing;
\`\`\`

Create users from Supabase Dashboard > Authentication > Users (invite users or set passwords securely). Then add memberships. Obtain the event UUID with:

\`\`\`sql
select id, slug, name from public.events;
\`\`\`

Add each real auth user UUID with one of the roles \`admin\`, \`committee\`, \`clinic\`, or \`marshal\`:

\`\`\`sql
insert into public.event_members (event_id, user_id, role)
values ('EVENT_UUID', 'AUTH_USER_UUID', 'admin');
\`\`\`

Do not reuse the existing demo usernames/password hashes as production credentials. Remove demo login paths before going live.

## 3. Load the client library

Load Supabase JS v2 before \`supabase-client.js\`, and load \`supabase-config.js\` before the client bootstrap:

\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="supabase-config.js"></script>
<script src="supabase/supabase-client.js"></script>
\`\`\`

Then call \`await CCSafeSupabase.init()\` before using \`signIn\`, \`saveReport\`, \`saveState\`, or subscriptions.

## 4. Role model

- \`admin\`: all reports and operational state.
- \`clinic\`: medical reports and match context only.
- \`committee\` / \`marshal\`: general reports and operational state.
- audit events: administrators can review all; other users can read their own events.
- notification preferences and offline queue: each user can access only their own rows.

The policies are enforced by Postgres Row Level Security. Hiding a button in JavaScript is not authorization.

## 5. Remaining integration before production

Wire existing modules to these tables:
- internal incident portal: \`reports\` and \`report_evaluations\`, including separate medical/general rows;
- match control: \`event_state\` key \`match\`;
- schedule: \`event_state\` key \`schedule\`;
- team lobby and QR: \`event_state\` key \`teams\` initially; production QR redemption should move to a server-side RPC/Edge Function that hashes and consumes tokens atomically;
- cards: \`event_state\` key \`cards\`;
- audit: append-only \`audit_events\`, not a client-editable array;
- offline mode: enqueue UUID idempotency keys in \`sync_queue\`, retry on reconnect, and mark delivered only after server acknowledgement.

Before release, implement conflict handling/version checks for concurrent edits, secure account provisioning, data migration from localStorage, backup/restore, and tests with separate admin/clinic/committee accounts on separate devices.

## Security notes

- Never expose a Supabase service-role key in GitHub Pages or browser JavaScript.
- Restrict the Supabase project's allowed origins and enable email confirmation/password policy as appropriate.
- Avoid storing identifiable or sensitive medical details unless the event has approved the privacy, retention and access policy.
- Realtime delivery is not a substitute for server authorization; RLS remains mandatory.
