# AI Report Summarizer — CC SafeGuard Live

Status: **design proposal**  
Target base: `feat/supabase-multidevice-sync` (Supabase foundation PR #3)  
Selected product decisions:
- Grouping: **hybrid** (category-first, then semantic similarity).
- Refresh: **both** (automatic after new/changed reports, plus an Admin-triggered manual refresh).

## 1. Product behavior

The feature creates a readable consolidated summary for multiple reports about the same incident, recurring issue, or topic. It never replaces, merges, or deletes source reports.

Every summary must show:
- a short title and AI-generated narrative;
- category, report type (medical/general), event and time range;
- count of source reports and latest refresh time;
- key facts and chronology, clearly distinguishing confirmed facts from unknown/missing details;
- links to every source report, opening its complete original detail;
- a freshness state (current, processing, needs review, or failed).

A report may remain ungrouped when no sufficiently similar report exists. Similar wording alone is not enough to merge distinct incidents.

## 2. Hybrid grouping logic

1. **Hard boundaries first:** only compare reports within the same event, report type, and normalized category. Medical and general reports must never share a cluster or summary.
2. **Candidate retrieval:** normalize text and category metadata, then retrieve candidates using category + time window + semantic embedding similarity. Use report title and narrative/chronology fields; exclude unnecessary direct identifiers.
3. **Decision:** combine semantic similarity with category match and time/context signals. A high-confidence match joins an existing cluster; an ambiguous match is held for Admin review; a low-confidence match starts a new cluster.
4. **Reconciliation:** when a report is edited, re-evaluate its membership and mark affected summaries stale. Never silently discard source links.
5. **Human correction:** Admin can move a report between clusters, split a cluster, or mark reports as unrelated. Record these actions in the audit log. Human overrides take precedence over the next automatic pass.

Thresholds and time windows are configuration, not hard-coded product truth. Calibrate them with fictional/test reports before enabling automatic grouping in production. Do not use the AI to infer diagnosis, fault, disciplinary outcome, or medical urgency.

## 3. Refresh behavior: both

### Automatic
- A database-side event records that a report was created or materially updated.
- A job is queued; a server-side worker finds candidate reports, updates cluster membership, and regenerates only affected summaries.
- UI shows processing/failure state and refreshes via Supabase Realtime or a normal reload.
- Debounce/batch bursts of submissions to avoid one model call per report.

### Manual
- Admin can select a cluster or date/category scope and choose **Perbarui rangkuman AI**.
- Manual refresh re-runs matching and summary generation, records who requested it, and reports success/failure.
- It must not alter report contents, status, priority, assignee, or evaluation.

Both paths use the same idempotent job pipeline. Repeated requests for the same event/scope and source revision should coalesce rather than create duplicate summaries.

## 4. Supabase data model proposal

Add a migration after the existing `supabase/schema.sql` foundation. Suggested tables:

### `report_clusters`
- `id uuid primary key`
- `event_id uuid not null`
- `report_type text check ('medical','general')`
- `category_key text not null`
- `title text`
- `grouping_status text` (active, review_required, archived)
- `created_at`, `updated_at`

### `report_cluster_members`
- `cluster_id uuid`, `report_id text`, `event_id uuid`
- `match_method text` (semantic, human, initial)
- `match_score real null`
- `added_by uuid null`, `created_at`
- Unique constraint on active membership per report (enforce in a transaction/RPC).

### `report_summaries`
- `id uuid primary key`, `cluster_id uuid not null`, `event_id uuid not null`
- `report_type text not null`
- `summary_markdown text not null`
- `key_facts jsonb not null`
- `source_count integer not null`
- `source_revision_hash text not null`
- `model_name text`, `prompt_version text`
- `generated_at timestamptz`, `generated_by uuid null`
- `status text` (current, stale, processing, failed, needs_review)

Keep generated summaries versioned or preserve the prior version in an append-only history table. A summary must be considered stale whenever any source report changes or membership changes.

### `report_summary_jobs`
- `id uuid primary key`, `event_id uuid`, `report_type text`
- `scope jsonb`, `trigger text` (automatic, manual)
- `requested_by uuid null`, `idempotency_key text unique`
- `status text`, `attempts integer`, `last_error text`
- `created_at`, `started_at`, `completed_at`

### Embeddings
Use a private vector column/table (for example pgvector) for report embeddings, keyed by report ID, event and report type. Embeddings are sensitive derived data: apply the same access boundary as the source report, do not expose them to browser clients, and do not include direct identifiers in embedding input unless explicitly approved.

All foreign keys must include/validate event consistency. Add indexes for event/type/category, cluster membership, job status, and vector similarity.

## 5. Authorization and privacy

The current Supabase foundation stores medical and general reports in `public.reports` and protects source rows with RLS. The summarizer must preserve that separation end-to-end:

- Admin: can view summaries and source links for both report types.
- Clinic: can view medical summaries and medical source reports only.
- Committee/Marshal: can view general summaries and general source reports only.
- No cross-event access, even if IDs are guessed.
- Summary, cluster, membership, embedding and job-read policies must derive authorization from the event membership and report type. Do not rely on hiding UI elements.
- The browser must never receive the Supabase service-role key or an AI provider secret.
- A Supabase Edge Function (or equivalent trusted server) performs model calls. Store provider credentials only in Supabase project secrets.
- The worker must validate the caller/session for manual requests and independently verify event role before processing.
- Minimize data sent to the model; redact names, contact details, student identifiers and other unnecessary personal data. Confirm the event's privacy, consent, retention and provider-processing policy before real medical reports are used.
- Log job metadata and human overrides, not copies of sensitive report text, in audit events.

**Important:** the existing PR #3 schema is a backend foundation, not yet a production-ready end-to-end deployment. Its current role policies and report storage must be reviewed and tested before adding this feature. Do not expose medical records through a shared event-state JSON payload.

## 6. AI output contract and safeguards

Ask the model for structured JSON, then validate it server-side before saving. Suggested fields:
- `title`
- `overview`
- `timeline[]` (timestamp, event, source_report_ids)
- `key_facts[]` (fact, source_report_ids, confidence)
- `unknowns[]`
- `conflicts[]` (conflicting statements with source references)
- `recommended_follow_up[]` (administrative follow-up only; no diagnosis/treatment)

Rules:
- Every factual statement must cite one or more source report IDs.
- Preserve disagreements between reports; do not manufacture a single version of disputed facts.
- Do not infer missing dates, people, causes, diagnoses or outcomes.
- Do not change the original report or its workflow status.
- Label output as AI-generated and show the generation time/model or prompt version for traceability.
- A human reviewer can flag/correct the summary; the original AI output and correction history remain auditable.

## 7. Edge Function and job flow

Proposed functions:
- `enqueue-report-summary`: called after report create/update and by the Admin manual action. Validates auth and writes/coalesces a job.
- `process-report-summary`: trusted worker. Claims a job atomically, loads only authorized same-event/same-type reports, computes embeddings/candidates, applies hybrid grouping, generates validated JSON, persists a new summary version, and marks the job complete.
- Optional `review-report-cluster`: Admin-only transactional operation to merge/split/move cluster membership and append an audit event.

Do not call an external AI API from `internal.html` or browser JavaScript. Do not make a network call from a Postgres trigger. Use a queue + Edge Function/webhook/worker so retries, rate limits and failures are observable.

## 8. UI placement

Add an **Rangkuman AI** section to the existing internal portal:
- summary cards grouped by category and report type;
- filters for date range, category and status;
- source report count and **Lihat semua laporan sumber** action;
- expand/collapse for the narrative, timeline, facts, unknowns and conflicts;
- freshness badge and last-updated timestamp;
- Admin-only manual refresh and cluster correction controls;
- a clear empty state when no related reports are found.

Opening a source report must use the existing full report-detail view and obey the same RLS access rules.

## 9. Delivery plan

1. **Foundation review:** finish/review PR #3, verify auth, event membership, RLS and report payload shape; migrate all report screens off localStorage before claiming cross-device availability.
2. **Database migration:** create cluster, membership, summary, job and private embedding structures with RLS and indexes.
3. **Worker:** implement idempotent queue processing, category-first hybrid matching, AI JSON generation, retries, rate limits and audit trail.
4. **Read API/UI:** add role-filtered summary queries, Realtime updates, source links and manual Admin refresh.
5. **Human controls:** add review queue, split/merge/move operations and override persistence.
6. **Migration/backfill:** import eligible existing reports only after explicit privacy approval; retain original report IDs and timestamps; mark generated summaries as AI-derived.
7. **Acceptance/security tests:** test with separate Admin, Clinic and Committee accounts and multiple devices.

## 10. Acceptance criteria

- [ ] Two or more fictional reports about the same incident in the same category produce one summary with all source links.
- [ ] Similar reports about separate incidents are not automatically merged; ambiguous cases enter review.
- [ ] Different categories, events, and medical/general report types never share a cluster.
- [ ] Every summary fact links to source report IDs; unknowns and contradictions remain visible.
- [ ] Opening a source link displays the complete original report, unchanged.
- [ ] Creating/updating a report marks the affected summary stale and queues an automatic refresh.
- [ ] Admin can manually refresh a cluster/scope; repeated requests are idempotent.
- [ ] A failed model call retries safely and never displays an old summary as current.
- [ ] Clinic cannot read general summaries; Committee/Marshal cannot read medical summaries; neither can access another event.
- [ ] Browser assets contain no service-role key or AI provider secret.
- [ ] Human corrections and cluster changes are audited and survive subsequent automatic processing.
- [ ] Tests cover missing data, conflicting reports, edited/deleted reports, duplicate jobs, rate limits and offline/reconnect behavior.

## 11. Open deployment dependencies

This design does not assume an existing Supabase project or AI provider key. Before enabling the worker, the project owner must create/configure the Supabase project, apply migrations, provision real Auth users and memberships, approve the AI provider/privacy policy, and add provider credentials as server-side secrets. Until then, the feature must remain disabled and the UI must not imply that AI summaries are being generated.
