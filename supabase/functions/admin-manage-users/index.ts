import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://2515801kenzo-creator.github.io";
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const reply = (data: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply({ error: "Konfigurasi server belum lengkap." }, 500, origin);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "Login diperlukan." }, 401, origin);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sesi tidak valid." }, 401, origin);

  const root = createClient(url, service);
  const { data: admin, error: profileError } = await root.from("profiles")
    .select("role,is_active,display_name").eq("id", auth.user.id).maybeSingle();
  if (profileError) return reply({ error: "Profil Admin tidak dapat diverifikasi." }, 500, origin);
  if (admin?.role !== "admin" || admin.is_active !== true)
    return reply({ error: "Hanya Admin aktif yang dapat mengelola akun." }, 403, origin);

  // Log only safe metadata. Never include passwords, tokens, or secret keys.
  const logAdminAction = async (action: string, result: "success" | "failed", targetUsername: string | null, details: string | null) => {
    try {
      const { error } = await root.from("activity_log").insert({
        actor_id: auth.user.id,
        actor_name: admin.display_name ?? "Admin",
        action,
        target_username: targetUsername,
        result,
        details,
      });
      if (error) console.error("CCSG activity log failed:", error.message);
    } catch (e) {
      console.error("CCSG activity log failed:", e);
    }
  };

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch {
    await logAdminAction("Permintaan Admin", "failed", null, "Format permintaan tidak valid (JSON).");
    return reply({ error: "JSON tidak valid." }, 400, origin);
  }
  const action = String(input.action ?? "");

  if (action === "list") {
    const { data, error } = await root.from("profiles")
      .select("id,username,display_name,role,is_active,created_at")
      .in("role", ["committee", "clinic"]).order("created_at", { ascending: false });
    if (error) return reply({ error: "Daftar akun gagal dimuat." }, 500, origin);
    return reply({ users: data ?? [] }, 200, origin);
  }

  if (action === "create") {
    const username = String(input.username ?? "").trim().toLowerCase();
    const name = String(input.display_name ?? "").trim();
    const role = String(input.role ?? "");
    const password = String(input.password ?? "");
    const fail = async (message: string) => {
      await logAdminAction("Akun dibuat", "failed", username || null, message);
      return reply({ error: message }, 400, origin);
    };
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username))
      return await fail("Username harus 3–24 karakter (huruf kecil, angka, titik, _ atau -).");
    if (name.length < 2 || name.length > 80) return await fail("Nama harus 2–80 karakter.");
    if (!["committee", "clinic"].includes(role)) return await fail("Role hanya Panitia atau P3K.");
    if (password.length < 12 || password.length > 128) return await fail("Password awal minimal 12 karakter.");

    const email = username + "@accounts.ccsafeguard.local";
    const { data: created, error: createError } = await root.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username, display_name: name, role },
    });
    if (createError || !created.user) {
      await logAdminAction("Akun dibuat", "failed", username, "Pembuatan akun Auth gagal: " + (createError?.message ?? "Error tidak diketahui."));
      return reply({ error: createError?.message ?? "Gagal membuat akun." }, 400, origin);
    }

    const { error: insertError } = await root.from("profiles").insert({
      id: created.user.id, username, display_name: name, role, is_active: true, created_by: auth.user.id,
    });
    if (insertError) {
      await root.auth.admin.deleteUser(created.user.id);
      await logAdminAction("Akun dibuat", "failed", username, "Profil akun gagal disimpan: " + insertError.message);
      return reply({ error: insertError.message }, 400, origin);
    }
    await logAdminAction("Akun dibuat", "success", username, "Role: " + (role === "clinic" ? "Klinik/P3K" : "Panitia") + ".");
    return reply({ user: { id: created.user.id, username, display_name: name, role, is_active: true } }, 201, origin);
  }

  if (action === "set_active") {
    const id = String(input.user_id ?? "");
    const active = input.is_active === true;
    if (!id) {
      await logAdminAction("Status akun diubah", "failed", null, "ID akun tidak diberikan.");
      return reply({ error: "user_id diperlukan." }, 400, origin);
    }
    if (id === auth.user.id) {
      await logAdminAction("Status akun diubah", "failed", null, "Admin tidak dapat menonaktifkan dirinya sendiri.");
      return reply({ error: "Admin tidak dapat menonaktifkan dirinya sendiri." }, 400, origin);
    }
    const { data: target, error } = await root.from("profiles").select("id,role,username")
      .eq("id", id).maybeSingle();
    if (error) {
      await logAdminAction("Status akun diubah", "failed", null, "Akun target tidak dapat diverifikasi.");
      return reply({ error: "Akun target tidak dapat diverifikasi." }, 500, origin);
    }
    if (!target || target.role === "admin") {
      await logAdminAction("Status akun diubah", "failed", target?.username ?? null, "Akun target tidak ditemukan atau tidak dapat diubah.");
      return reply({ error: "Akun target tidak dapat diubah." }, 404, origin);
    }
    const { error: updateError } = await root.from("profiles").update({ is_active: active }).eq("id", id);
    if (updateError) {
      await logAdminAction("Status akun diubah", "failed", target.username, "Pembaruan status gagal: " + updateError.message);
      return reply({ error: "Status akun gagal diperbarui." }, 500, origin);
    }
    await logAdminAction("Status akun diubah", "success", target.username, "Status akun: " + (active ? "aktif" : "nonaktif") + ".");
    return reply({ success: true, is_active: active }, 200, origin);
  }

  if (action === "reset_password") {
    const id = String(input.user_id ?? "");
    const password = String(input.password ?? "");
    if (!id || password.length < 12 || password.length > 128) {
      await logAdminAction("Password akun direset", "failed", null, "ID akun tidak valid atau password tidak memenuhi kebijakan.");
      return reply({ error: "Password baru minimal 12 karakter." }, 400, origin);
    }
    const { data: target, error } = await root.from("profiles").select("id,role,username")
      .eq("id", id).maybeSingle();
    if (error) {
      await logAdminAction("Password akun direset", "failed", null, "Akun target tidak dapat diverifikasi.");
      return reply({ error: "Akun target tidak dapat diverifikasi." }, 500, origin);
    }
    if (!target || target.role === "admin") {
      await logAdminAction("Password akun direset", "failed", target?.username ?? null, "Akun target tidak ditemukan atau tidak dapat diubah.");
      return reply({ error: "Akun target tidak dapat diubah." }, 404, origin);
    }
    const { error: updateError } = await root.auth.admin.updateUserById(id, { password });
    if (updateError) {
      await logAdminAction("Password akun direset", "failed", target.username, "Reset password gagal: " + updateError.message);
      return reply({ error: updateError.message }, 400, origin);
    }
    await logAdminAction("Password akun direset", "success", target.username, "Password berhasil diperbarui (password tidak dicatat).");
    return reply({ success: true }, 200, origin);
  }

  await logAdminAction("Aksi Admin tidak dikenal", "failed", null, "Nama aksi tidak dikenali.");
  return reply({ error: "Aksi tidak dikenal." }, 400, origin);
});
