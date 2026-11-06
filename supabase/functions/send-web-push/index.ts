import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://vhovzyzktrzenuulznzv.supabase.co";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const VAPID_KEYS_JSON = Deno.env.get("VAPID_KEYS_JSON") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "https://2515801kenzo-creator.github.io/cc-safeguard-live/";
const encoder = new TextEncoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function tokenMatches(received: string | null) {
  if (!received || !VAPID_KEYS_JSON || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(VAPID_KEYS_JSON)));
  const supplied = new Uint8Array(received.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  let mismatch = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ (supplied[i] ?? 0);
  return mismatch === 0;
}

function notificationFor(eventType: string, category: string, reportId: string) {
  const common = { url: "./internal.html", tag: `ccsg-${eventType}-${reportId}` };
  if (eventType === "test") return { ...common, title: "Uji notifikasi CC SafeGuard", body: "Web Push CC SafeGuard Live sudah tersambung ke perangkat ini." };
  if (eventType === "new_report" && category === "medical") return { ...common, title: "Laporan medis baru", body: "Ada laporan medis baru yang perlu ditinjau. Buka portal CC SafeGuard Live." };
  if (eventType === "new_report") return { ...common, title: "Laporan umum baru", body: "Ada laporan umum baru yang perlu ditinjau. Buka portal CC SafeGuard Live." };
  if (eventType === "clinic_call") return { ...common, title: "Panggilan P3K baru", body: "Ada permintaan bantuan P3K. Silakan buka portal untuk menerima panggilan." };
  return { ...common, title: "Pembaruan penanganan P3K", body: "Status respons P3K telah diperbarui. Buka portal untuk melihat perkembangannya." };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await tokenMatches(req.headers.get("x-ccsg-push-token")))) return json({ error: "Unauthorized" }, 401);
  if (!SERVICE_KEY || !VAPID_KEYS_JSON) return json({ error: "Push server secrets are not configured." }, 503);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const eventType = String(payload.event_type ?? "");
  const category = String(payload.category ?? "");
  const authorId = String(payload.author_id ?? "");
  const reportId = String(payload.report_id ?? "test");
  let roleTargets: string[] = [];

  if (eventType === "test") {
    const targetUserId = String(payload.target_user_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return json({ error: "A valid target_user_id is required for a test." }, 400);
    }
  } else if (eventType === "new_report" && category === "medical") roleTargets = ["clinic", "admin"];
  else if (eventType === "new_report" && category === "general") {
    roleTargets = ["committee", "admin"];
    if (payload.needs_clinic === true) roleTargets.push("clinic");
  } else if (eventType === "clinic_call") roleTargets = ["clinic"];
  else if (eventType === "clinic_update") roleTargets = ["committee", "admin"];
  else return json({ error: "Unsupported notification event." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let recipientIds: string[] = [];
  if (eventType === "test") recipientIds = [String(payload.target_user_id)];
  else {
    const { data: profiles, error } = await admin.from("profiles").select("id,role").in("role", [...new Set(roleTargets)]).eq("is_active", true);
    if (error) return json({ error: "Could not load notification recipients." }, 500);
    recipientIds = (profiles ?? []).filter((p) => !authorId || p.id !== authorId).map((p) => p.id);
  }
  if (!recipientIds.length) return json({ ok: true, sent: 0, reason: "No eligible recipients." });

  const { data: subscriptions, error: subError } = await admin.from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth").in("user_id", recipientIds).eq("is_active", true);
  if (subError) return json({ error: "Could not load push subscriptions." }, 500);
  if (!subscriptions?.length) return json({ ok: true, sent: 0, reason: "Recipients have not registered a device." });

  try {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JSON) as webpush.ExportedVapidKeys);
    const appServer = await webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
    const message = JSON.stringify(notificationFor(eventType, category, reportId));
    let sent = 0, expired = 0, failed = 0;

    const settled = await Promise.allSettled(subscriptions.map(async (sub) => {
      const subscriber = appServer.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
      try {
        await subscriber.pushTextMessage(message, { urgency: webpush.Urgency.High, ttl: 86400, topic: `ccsg-${eventType}` });
        sent++;
      } catch (error) {
        const status = (error as { response?: Response })?.response?.status;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          expired++;
        } else failed++;
      }
    }));
    for (const result of settled) if (result.status === "rejected") failed++;
    return json({ ok: true, sent, expired, failed, recipients: recipientIds.length });
  } catch {
    return json({ error: "VAPID key could not be loaded or push delivery failed." }, 500);
  }
});
