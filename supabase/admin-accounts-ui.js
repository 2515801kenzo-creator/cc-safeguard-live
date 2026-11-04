/* Admin account panel. Call CCSGAdminAccounts.mount(document.getElementById("adminAccountsPanel"))
   from the Admin-only page after supabase-client.js is loaded. */
(() => {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const roleName = role => role === "clinic" ? "Klinik / P3K" : "Panitia";
  const notice = (el, msg, error = false) => {
    const n = el.querySelector("[data-notice]");
    if (n) { n.textContent = msg; n.className = "ccsg-notice" + (error ? " error" : ""); }
  };

  async function mount(root) {
    if (!root || !window.CCSG) throw new Error("CCSG client belum dimuat.");
    root.innerHTML = `
      <section class="ccsg-admin">
        <div class="ccsg-admin-head"><div><h2>Manajemen akun</h2><p>Buat dan kelola akun Panitia serta Klinik/P3K.</p></div><button type="button" data-refresh>Refresh</button></div>
        <div data-notice class="ccsg-notice" aria-live="polite"></div>
        <form data-create class="ccsg-create-user">
          <label>Nama tampilan<input name="display_name" required maxlength="80" placeholder="Nama panitia / petugas"></label>
          <label>Username<input name="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9._-]+" placeholder="username" autocomplete="off"></label>
          <label>Peran<select name="role"><option value="committee">Panitia</option><option value="clinic">Klinik / P3K</option></select></label>
          <label>Password awal<input name="password" required minlength="12" maxlength="128" type="password" autocomplete="new-password" placeholder="Minimal 12 karakter"></label>
          <button type="submit">＋ Buat akun</button>
        </form>
        <p class="ccsg-small">Password awal disampaikan secara pribadi kepada pemilik akun. Jangan kirim password melalui grup umum.</p>
        <div data-users><p>Memuat daftar akun…</p></div>
      </section>
    `;

    const list = root.querySelector("[data-users]");
    async function refresh() {
      notice(root, "Memuat daftar akun…");
      try {
        const result = await CCSG.adminUserAction({ action: "list" });
        const users = result.users || [];
        list.innerHTML = users.length ? `
          <div class="ccsg-table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${users.map(u => `
            <tr>
              <td>${esc(u.display_name)}</td><td><code>${esc(u.username)}</code></td><td>${esc(roleName(u.role))}</td>
              <td><span class="ccsg-status ${u.is_active ? "active" : "inactive"}">${u.is_active ? "Aktif" : "Nonaktif"}</span></td>
              <td class="ccsg-actions">
                <button type="button" data-toggle="${esc(u.id)}" data-active="${!u.is_active}">${u.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                <button type="button" data-reset="${esc(u.id)}" data-username="${esc(u.username)}">Reset password</button>
              </td>
            </tr>`).join("")}</tbody></table></div>` : "<p>Belum ada akun Panitia atau Klinik/P3K.</p>";
        notice(root, "Daftar akun diperbarui.");
      } catch (e) {
        notice(root, e.message || "Tidak dapat memuat akun.", true);
        list.innerHTML = "<p>Pastikan kamu login sebagai Admin dan Edge Function sudah aktif.</p>";
      }
    }

    root.querySelector("[data-refresh]").addEventListener("click", refresh);
    root.querySelector("[data-create]").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const d = new FormData(form);
      const username = String(d.get("username") || "").trim().toLowerCase();
      const password = String(d.get("password") || "");
      if (password.length < 12) return notice(root, "Password awal minimal 12 karakter.", true);
      if (!confirm("Buat akun " + username + " dengan peran " + roleName(d.get("role")) + "?")) return;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await CCSG.adminUserAction({
          action: "create", username, display_name: d.get("display_name"),
          role: d.get("role"), password,
        });
        form.reset();
        notice(root, "Akun berhasil dibuat. Catat username dan sampaikan password awal secara aman.");
        await refresh();
      } catch (err) {
        notice(root, err.message || "Gagal membuat akun.", true);
      } finally { submit.disabled = false; }
    });

    root.addEventListener("click", async e => {
      const toggle = e.target.closest("[data-toggle]");
      const reset = e.target.closest("[data-reset]");
      if (toggle) {
        const active = toggle.dataset.active === "true";
        if (!confirm((active ? "Aktifkan" : "Nonaktifkan") + " akun ini?")) return;
        try {
          await CCSG.adminUserAction({ action: "set_active", user_id: toggle.dataset.toggle, is_active: active });
          notice(root, "Status akun diperbarui.");
          await refresh();
        } catch (err) { notice(root, err.message || "Gagal mengubah status.", true); }
      }
      if (reset) {
        const password = prompt("Password baru untuk " + reset.dataset.username + " (minimal 12 karakter):");
        if (password === null) return;
        if (password.length < 12) return notice(root, "Password baru minimal 12 karakter.", true);
        try {
          await CCSG.adminUserAction({ action: "reset_password", user_id: reset.dataset.reset, password });
          notice(root, "Password berhasil direset. Sampaikan secara pribadi.");
        } catch (err) { notice(root, err.message || "Reset password gagal.", true); }
      }
    });
    await refresh();
  }

  window.CCSGAdminAccounts = Object.freeze({ mount });
})();
