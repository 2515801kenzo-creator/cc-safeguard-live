# CC SafeGuard Live — ITG CC Cup XLI 2026

**Prototipe pendidikan independen** untuk menguji alur penanganan insiden pertandingan mini soccer. Belum merupakan aplikasi resmi Kolese Kanisius atau panitia CC Cup.

## Cara membuka
Website ada dalam satu file `index.html` tanpa instalasi. Setelah GitHub Pages diaktifkan: Settings → Pages → Source: Deploy from a branch → main → /(root) → Save.

## Fitur demo
- Match dashboard & ringkasan insiden
- Form laporan cepat untuk petugas
- Alur: laporan baru → ditugaskan → sedang ditangani → selesai
- Riwayat tindak lanjut per kasus
- CardSync untuk mendokumentasikan keputusan wasit (bukan mengambil keputusan otomatis)
- Analisis kategori dan ekspor CSV
- Materi integrasi PJOK, PPKn, Bahasa Indonesia dan Informatika
- Tampilan responsif untuk laptop dan ponsel

## Cara menguji
1. Buka **Pengaturan**, klik **Muat skenario fiktif**.
2. Masuk **Pusat penanganan**, tekan **Tugaskan petugas**, **Sedang ditangani**, lalu **Konfirmasi selesai**.
3. Kembali ke Dashboard untuk melihat status.
4. Pilih **Laporkan insiden** untuk menulis laporan demonstrasi tanpa informasi pribadi.
5. Coba **CardSync** dan **Analisis**.

## Keamanan dan batasan
- Data hanya tersimpan di **localStorage** browser. **Belum sinkron langsung antar-HP** dan tidak mengirim pemberitahuan ke panitia.
- Pergantian peran di **Pengaturan** hanya simulasi, bukan autentikasi aman.
- Gunakan data fiktif. Jangan masukkan nama siswa, nomor telepon, foto sensitif, atau tuduhan pribadi.
- Jangan mengandalkan website sebagai saluran darurat atau pengganti tindakan petugas di lapangan.
- Verifikasi hasil observasi kelompok sebelum membuat klaim publik tentang insiden.
- Keputusan wasit tidak boleh digantikan algoritma.
- Logo resmi sekolah dan CC Cup belum dibenamkan pada **versi satu-file** ini; tampilan memakai monogram teks **CC**. Penggunaan logo asli untuk publikasi membutuhkan izin yang sesuai.

## Landasan pembelajaran
- **PJOK:** aturan dan sportivitas mini soccer, keselamatan
- **PPKn:** kepatuhan, kewenangan, dan tanggung jawab, dengan hierarki peraturan negara dibahas secara tersendiri
- **Bahasa Indonesia:** kronologi dan laporan objektif
- **Informatika:** logika status, formulir, validasi dan penyimpanan browser

Sumber: SOP Mini Soccer CC Cup XLI yang disediakan kelompok; Konsep ITG Kelas 8; Rubrik PJOK Kelas 8; https://www.theifab.com/laws/latest/

## Kolaborasi
Owner repo mengundang teman melalui **Settings → Collaborators → Add people**. Kerjakan perubahan pada branch terpisah lalu ajukan Pull Request untuk review sebelum merge.

## Pengembangan lanjutan
Integrasi Firebase Authentication + Firestore dengan aturan akses aman, sinkronisasi antar perangkat, logo berizin, dan validasi panitia diperlukan untuk versi operasional.
