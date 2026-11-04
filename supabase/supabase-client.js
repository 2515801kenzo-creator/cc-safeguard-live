/* CC SafeGuard Live Supabase adapter.
 * Fill in the project URL and publishable/anon key in supabase-config.js.
 * Never put SUPABASE_SERVICE_ROLE_KEY in browser code.
 */
(() => {
  "use strict";
  const cfg = window.CCSG_SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    console.warn("CC SafeGuard: Supabase config belum diisi.");
    return;
  }
  if (!window.supabase?.createClient) {
    console.error("Supabase JS SDK belum dimuat.");
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.anonKey);
  const BUCKET = "ccsg-report-photos";
  const EMAIL_DOMAIN = "@accounts.ccsafeguard.local";
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  async function currentProfile() {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return null;
    const { data, error } = await client.from("profiles")
      .select("id,username,display_name,role,is_active")
      .eq("id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (!data || !data.is_active) {
      await client.auth.signOut();
      throw new Error("Akun dinonaktifkan. Hubungi Admin.");
    }
    return { ...data, authUser: auth.user };
  }

  async function login(username, password) {
    const clean = String(username || "").trim().toLowerCase();
    if (!clean || !password) throw new Error("Username dan password wajib diisi.");
    const { data, error } = await client.auth.signInWithPassword({
      email: clean + EMAIL_DOMAIN, password,
    });
    if (error) throw new Error("Username atau password tidak cocok.");
    const profile = await currentProfile();
    return { session: data.session, profile };
  }

  async function logout() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function adminUserAction(payload) {
    const { data, error } = await client.functions.invoke("admin-manage-users", { body: payload });
    if (error) throw new Error(error.message || "Aksi Admin gagal.");
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function createReport(fields) {
    const profile = await currentProfile();
    if (!profile) throw new Error("Silakan login kembali.");
    const category = fields.category;
    if ((profile.role === "committee" && category !== "general") ||
        (profile.role === "clinic" && category !== "medical")) {
      throw new Error("Kategori laporan tidak sesuai hak akses akun.");
    }
    const code = fields.report_code || ("CC-" + new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
    const { data, error } = await client.from("reports").insert({
      report_code: code,
      category,
      title: String(fields.title || "").trim(),
      reporter_name: String(fields.reporter_name || "").trim(),
      location: String(fields.location || "").trim() || null,
      priority: fields.priority || "Sedang",
      status: "Perlu verifikasi",
      description: String(fields.description || "").trim(),
      created_by: profile.id,
    }).select("*").single();
    if (error) throw error;
    return data;
  }

  async function uploadReportPhoto(reportId, file) {
    const profile = await currentProfile();
    if (!profile) throw new Error("Silakan login kembali.");
    if (!file || !allowedTypes.has(file.type)) throw new Error("Foto harus JPG, PNG, atau WebP.");
    if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error("Ukuran foto maksimal 5 MB.");
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = reportId + "/" + crypto.randomUUID() + "." + ext;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data, error: metaError } = await client.from("report_photos").insert({
      report_id: reportId, storage_path: path, file_name: file.name,
      content_type: file.type, size_bytes: file.size, uploaded_by: profile.id,
    }).select("*").single();
    if (metaError) {
      await client.storage.from(BUCKET).remove([path]);
      throw metaError;
    }
    return data;
  }

  async function listReportPhotos(reportId) {
    const { data, error } = await client.from("report_photos")
      .select("id,storage_path,file_name,content_type,size_bytes,created_at")
      .eq("report_id", reportId).order("created_at", { ascending: true });
    if (error) throw error;
    return Promise.all((data || []).map(async photo => {
      const { data: signed, error: signedError } = await client.storage.from(BUCKET)
        .createSignedUrl(photo.storage_path, 60);
      if (signedError) throw signedError;
      return { ...photo, url: signed.signedUrl };
    }));
  }

  async function listReports() {
    const { data, error } = await client.from("reports").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function updateReport(reportId, changes) {
    const { data, error } = await client.from("reports").update({
      ...changes, updated_at: new Date().toISOString(),
    }).eq("id", reportId).select("*").single();
    if (error) throw error;
    return data;
  }

  window.CCSG = Object.freeze({
    client, currentProfile, login, logout, adminUserAction,
    createReport, uploadReportPhoto, listReportPhotos, listReports, updateReport,
  });
})();
