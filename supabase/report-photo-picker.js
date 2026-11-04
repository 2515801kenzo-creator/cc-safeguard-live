/* Photo picker for the report form. Call CCSGPhotoPicker.mount(container)
   and then picker.files() when the report form is submitted. */
(() => {
  "use strict";
  const MAX_FILES = 3;
  const MAX_BYTES = 5 * 1024 * 1024;
  const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function mount(root) {
    if (!root) throw new Error("Photo picker container tidak ditemukan.");
    let files = [];
    root.innerHTML = `
      <section class="ccsg-photo-picker">
        <label class="ccsg-photo-label">Foto pendukung (opsional)
          <input data-files type="file" accept="image/jpeg,image/png,image/webp" multiple>
        </label>
        <p>JPG, PNG, atau WebP · maksimal 3 foto · 5 MB per foto. Hindari foto wajah atau informasi medis sensitif yang tidak diperlukan.</p>
        <div data-preview class="ccsg-photo-preview"></div>
        <div data-upload-status aria-live="polite"></div>
      </section>`;
    const input = root.querySelector("[data-files]");
    const preview = root.querySelector("[data-preview]");
    const status = root.querySelector("[data-upload-status]");

    function render() {
      preview.innerHTML = files.map((f, i) => `
        <figure><img src="${URL.createObjectURL(f)}" alt="Pratinjau foto ${i + 1}">
        <figcaption>${esc(f.name)} · ${(f.size / 1024 / 1024).toFixed(1)} MB
        <button type="button" data-remove="${i}" aria-label="Hapus foto ${i + 1}">Hapus</button></figcaption></figure>`).join("");
    }

    input.addEventListener("change", () => {
      const incoming = Array.from(input.files || []);
      for (const f of incoming) {
        if (!TYPES.has(f.type)) { status.textContent = f.name + ": format tidak didukung."; continue; }
        if (f.size > MAX_BYTES) { status.textContent = f.name + ": ukuran melebihi 5 MB."; continue; }
        if (files.length >= MAX_FILES) { status.textContent = "Maksimal 3 foto per laporan."; break; }
        files.push(f);
      }
      input.value = "";
      render();
    });
    preview.addEventListener("click", e => {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      files.splice(Number(btn.dataset.remove), 1);
      render();
    });

    return {
      files: () => [...files],
      clear: () => { files = []; render(); status.textContent = ""; },
      setStatus: msg => { status.textContent = msg; },
    };
  }

  window.CCSGPhotoPicker = Object.freeze({ mount });
})();
