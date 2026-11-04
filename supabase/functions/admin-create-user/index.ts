// Deploy as Supabase Edge Function: admin-create-user
// Required server secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Never put the service-role key in browser code or GitHub.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!url || !anonKey || !serviceKey || !authHeader) {
    return response({ error: "Server configuration or authorization is missing." }, 500);
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return response({ error: "Unauthorized." }, 401);

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role,active")
    .eq("id", callerData.user.id)
    .maybeSingle();

  if (profileError || callerProfile?.role !== "admin" || callerProfile.active !== true) {
    return response({ error: "Only an active administrator can create accounts." }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return response({ error: "Invalid JSON body." }, 400);
  }

  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const displayName = String(input.display_name ?? "").trim();
  const role = String(input.role ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "A valid email address is required." }, 400);
  }
  if (password.length < 12 || password.length > 128) {
    return response({ error: "Password must contain 12–128 characters." }, 400);
  }
  if (displayName.length < 2 || displayName.length > 80) {
    return response({ error: "Display name must contain 2–80 characters." }, 400);
  }
  if (!["clinic", "committee"].includes(role)) {
    return response({ error: "Only Clinic and Committee accounts can be created here." }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (createError || !created.user) {
    return response({ error: createError?.message ?? "Could not create user." }, 400);
  }

  const { error: insertError } = await adminClient.from("profiles").insert({
    id: created.user.id,
    display_name: displayName,
    role,
    active: true,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return response({ error: "Account profile could not be saved; the new auth account was rolled back." }, 500);
  }

  return response({ user_id: created.user.id, display_name: displayName, role }, 201);
});
