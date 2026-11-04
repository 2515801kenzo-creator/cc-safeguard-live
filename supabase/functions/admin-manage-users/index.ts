import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "Login diperlukan." }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sesi tidak valid." }, 401);

  const root = createClient(url, service);
  const { data: admin } = await root.from("profiles").select("role,is_active")
    .eq("id", auth.user.id).maybeSingle();
  if (admin?.role !== "admin" || admin.is_active !== true)
    return reply({ error: "Hanya Admin aktif yang dapat mengelola akun." }, 403);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply({ error: "JSON tidak valid." }, 400); }
  const action = String(input.action ?? "");

  if (action === "list") {
    const { data, error } = await root.from("profiles")
      .select("id,username,display_name,role,is_active,created_at")
      .in("role", ["committee", "clinic"]).order("created_at", { ascending: false });
    if (error) return reply({ error: error.message }, 500);
    return reply({ users: data ?? [] });
  }

  if (action === "create") {
    const username = String(input.username ?? "").trim().toLowerCase();
    const name = String(input.display_name ?? "").trim();
    const role = String(input.role ?? "");
    const password = String(input.password ?? "");
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username))
      return reply({ error: "Username harus 3–24 karakter (huruf kecil, angka, titik, _ atau -)." }, 400);
    if (name.length < 2 || name.length > 80) return reply({ error: "Nama harus 2–80 karakter." }, 400);
    if (!["committee", "clinic"].includes(role)) return reply({ error: "Role hanya Panitia atau P3K." }, 400);
    if (password.length < 12 || password.length > 128) return reply({ error: "Password awal minimal 12 karakter." }, 400);

    const email = username + "@accounts.ccsafeguard.local";
    const { data: created, error: createError } = await root.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username, display_name: name, role },
    });
    if (createError || !created.user) return reply({ error: createError?.message ?? "Gagal membuat akun." }, 400);

    const { error: profileError } = await root.from("profiles").insert({
      id: created.user.id, username, display_name: name, role, is_active: true, created_by: auth.user.id,
    });
    if (profileError) {
      await root.auth.admin.deleteUser(created.user.id);
      return reply({ error: profileError.message }, 400);
    }
    return reply({ user: { id: created.user.id, username, display_name: name, role, is_active: true } }, 201);
  }

  if (action === "set_active") {
    const id = String(input.user_id ?? "");
    const active = input.is_active === true;
    if (!id) return reply({ error: "user_id diperlukan." }, 400);
    if (id === auth.user.id) return reply({ error: "Admin tidak dapat menonaktifkan dirinya sendiri." }, 400);
    const { data: target } = await root.from("profiles").select("id,role").eq("id", id).maybeSingle();
    if (!target || target.role === "admin") return reply({ error: "Akun target tidak dapat diubah." }, 404);
    const { error } = await root.from("profiles").update({ is_active: active }).eq("id", id);
    if (error) return reply({ error: error.message }, 500);
    return reply({ success: true, is_active: active });
  }

  if (action === "reset_password") {
    const id = String(input.user_id ?? "");
    const password = String(input.password ?? "");
    if (!id || password.length < 12 || password.length > 128)
      return reply({ error: "Password baru minimal 12 karakter." }, 400);
    const { data: target } = await root.from("profiles").select("id,role").eq("id", id).maybeSingle();
    if (!target || target.role === "admin") return reply({ error: "Akun target tidak dapat diubah." }, 404);
    const { error } = await root.auth.admin.updateUserById(id, { password });
    if (error) return reply({ error: error.message }, 400);
    return reply({ success: true });
  }

  return reply({ error: "Aksi tidak dikenal." }, 400);
});
