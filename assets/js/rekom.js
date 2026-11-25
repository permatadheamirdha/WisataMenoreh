/* =====================================================================
 * rekom.js — Penyaringan, SAW 4 kriteria (C1 waktu, C2 biaya, C3 rating, C4 jumlah ulasan),
 *            dan penyusunan rencana.
 * Mengikuti "WebGIS_Pertanyaan_dan_Aturan_Pengolahan_Lengkap.xlsx".
 * Tanpa DOM agar dapat diuji dengan Node.js (tests/test_core.js).
 * Waktu dalam MENIT sejak 00:00 tanggal perjalanan.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Rekom = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PARAM = {
    rasioJalan: 1.74,       // cadangan bila OSRM gagal: jarak garis lurus × rasio
    kecepatanKmJam: 43,     // kecepatan model cadangan
    koreksiWaktu: 1.0,      // pengali waktu OSRM (kalibrasi lapangan)
    makanDefault: null,     // M_default Rp/orang (Aturan 09) — null = belum ditetapkan tim
    jumlahStop: 3,          // jumlah tempat dalam satu rencana (metode repo)
    kandidatPool: 10,       // N teratas SAW yang dicoba dikombinasikan
  };

  const KRITERIA = [
    { kode: "C1", nama: "Waktu tempuh", sifat: "cost" },
    { kode: "C2", nama: "Biaya tiket + makan", sifat: "cost" },
    { kode: "C3", nama: "Rating destinasi", sifat: "benefit" },
    { kode: "C4", nama: "Jumlah ulasan", sifat: "benefit" },
  ];
  const HARI = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"]; // indeks = Date.getDay()

  /* ---------------- Utilitas ---------------- */
  function haversineKm(lat1, lon1, lat2, lon2) {
    const k = Math.PI / 180, dLat = (lat2 - lat1) * k, dLon = (lon2 - lon1) * k;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * k) * Math.cos(lat2 * k) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  function estimasiTempuh(lat1, lon1, lat2, lon2) {
    const km = haversineKm(lat1, lon1, lat2, lon2) * PARAM.rasioJalan;
    return { menit: (km / PARAM.kecepatanKmJam) * 60, km };
  }
  function keMenit(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  }
  function keJam(menit) {
    const m = Math.round(menit), h = Math.floor(m / 60), mm = ((m % 60) + 60) % 60;
    return String(h % 24).padStart(2, "0") + "." + String(mm).padStart(2, "0") + (h >= 24 ? " (+1 hari)" : "");
  }
  function fmtRp(v) { return Math.round(v).toLocaleString("id-ID"); }

  /** Normalisasi bobot slider: w_j = p_j / Σp (Aturan 25). */
  function normalisasiBobot(p) {
    if (p.some(x => !(x >= 0))) throw new Error("Prioritas harus bernilai ≥ 0");
    const s = p.reduce((a, b) => a + b, 0);
    if (!(s > 0)) throw new Error("Naikkan minimal satu prioritas");
    return p.map(x => x / s);
  }

  /** Estimasi makan per orang (Aturan 08–09). */
  function makan(p) {
    if (p.makan != null) return { nilai: p.makan, sumber: p.makan_sumber };
    if (PARAM.makanDefault != null) return { nilai: PARAM.makanDefault, sumber: "default" };
    return { nilai: null, sumber: null };
  }
  /** C2 = biaya dasar (p.tiket = biaya_rp repo: tiket, atau paket untuk akomodasi) + estimasi makan
   *  (rata-rata makan_min..makan_max; satu nilai bila hanya satu terisi; kosong = 0, ditandai). */
  function biaya(p) {
    if (p.tiket == null) return { nilai: null, makanDiketahui: false };
    const m = makan(p);
    return { nilai: p.tiket + (m.nilai ?? 0), makanDiketahui: m.nilai != null, makan: m.nilai };
  }

  /** Jendela buka pada hari perjalanan (Aturan 18, 20). */
  function jendela(p, hari) {
    const st = p.hari ? p.hari[HARI[hari]] : null;
    if (st === false) return { status: "tutup" };
    if (st == null) return { status: "unknown" };
    if (p.buka24) return { status: "valid", buka: 0, tutup: 2 * 1440 };
    const b = keMenit(p.jam_buka), t = keMenit(p.jam_tutup);
    if (b == null || t == null) return { status: "unknown" };
    if (b === 0 && t === 23 * 60 + 59) return { status: "valid", buka: 0, tutup: 2 * 1440 };
    return { status: "valid", buka: b, tutup: t <= b ? t + 1440 : t };
  }

  /* ---------------- Penyaringan (Aturan 05–22, 26) ----------------
   * alts: [{ p, t0i, ti0, km0i, ki0 }]  (t = menit; null = rute gagal)
   * q: { kategori: [], t0: menit berangkat, hari: 0..6, durasiJam, kembali: bool,
   *      anggaran: Rp|null, ratingMin: num|null, ulasanMin: int|null }
   */
  const batasMenit = q => (q.durasiJam == null ? Infinity : q.durasiJam * 60); // "Tidak dibatasi" = tanpa batas

  function saring(alts, q) {
    const H = batasMenit(q);
    const K = [], tidak = [];
    for (const a of alts) {
      const p = a.p, alasan = [];
      if (q.kategori && q.kategori.length && !q.kategori.includes(p.kategori)) alasan.push("Jenis wisata tidak dipilih");
      if (p.rating == null) alasan.push("Belum ada rating");
      else if (q.ratingMin != null && p.rating < q.ratingMin) alasan.push(`Rating ${p.rating} di bawah ${q.ratingMin}`);
      if (p.ulasan == null) alasan.push("Jumlah ulasan belum diketahui");   // C4 wajib ada
      else if (q.ulasanMin != null && p.ulasan < q.ulasanMin) alasan.push(`Hanya ${p.ulasan} ulasan`);
      if (a.t0i == null || (q.kembali && a.ti0 == null)) alasan.push("Rute jalan tidak ditemukan");
      const c2 = biaya(p);
      if (c2.nilai == null) alasan.push("Harga tiket belum diketahui");
      else if (q.anggaran != null && c2.nilai > q.anggaran) alasan.push(`Biaya Rp${fmtRp(c2.nilai)} melebihi anggaran`);
      const j = jendela(p, q.hari);
      if (j.status === "tutup") alasan.push("Tutup pada hari tersebut");
      else if (j.status === "unknown") alasan.push("Jadwal buka belum diketahui");
      if (!alasan.length) {
        // Kelayakan kunjungan tunggal (Aturan 19, 22, 26)
        const A = q.t0 + a.t0i, S = Math.max(A, j.buka), F = S + p.durasi;
        const selesai = F + (q.kembali ? a.ti0 : 0);
        if (F > j.tutup) alasan.push(`Tidak sempat sebelum tutup (${p.jam_tutup})`);
        else if (selesai - q.t0 > H) alasan.push("Tidak cukup waktu untuk berkunjung" + (q.kembali ? " dan kembali" : ""));
      }
      if (alasan.length) tidak.push({ alt: a, alasan });
      else K.push(a);
    }
    return { K, tidak };
  }

  /* ---------------- SAW 4 kriteria — memakai js/saw.js dari repo apa adanya ----------------
   * Sumber: github.com/kharismaaw/webgis-wisata-kulonprogo, js/saw.js (fungsi SAW.sawRank & SAW.normalize).
   * Di sini hanya adaptor: data lokal diubah ke bentuk alternatif repo
   *   { waktu_tempuh (menit, satu arah dari titik awal), biaya (Rp), rating, ulasan }
   * lalu hasil sawRank() dipetakan kembali ke struktur rekom.js.
   */
  function libSAW() {
    if (typeof SAW !== "undefined") return SAW;                       // browser: <script src="js/saw.js">
    if (typeof require === "function") return require("./saw.js");   // Node (uji unit)
    throw new Error("js/saw.js belum dimuat");
  }

  function saw(K, w) {
    if (!K.length) return { hasil: [], ext: [] };
    const lib = libSAW();
    const alts = K.map((a, i) => ({ _i: i, waktu_tempuh: a.t0i, biaya: biaya(a.p).nilai, rating: a.p.rating, ulasan: a.p.ulasan }));
    const kunci = lib.CRITERIA.map(c => c.key);                      // ["waktu_tempuh","biaya","rating","ulasan"]
    const ranked = lib.sawRank(alts, w, lib.CRITERIA);
    const hasil = ranked.map(h => ({
      ...K[h._i],
      x: kunci.map(k => h[k] ?? 0),
      r: kunci.map(k => h.normalisasi[k]),
      V: h.skor,
      peringkat: h.peringkat,
    }));
    const ext = kunci.map(k => {
      const col = alts.map(a => a[k] ?? 0);
      return { min: Math.min(...col), max: Math.max(...col) };
    });
    return { hasil, ext };
  }

  /* ---------------- Rencana perjalanan (Aturan 10, 11, 19, 23, 29) ----------------
   * tempuh(a, b), jarak(a, b): a/b = "O" (titik awal) atau id destinasi; null bila gagal.
   */
  function evaluasi(seq, tempuh, jarak, q) {
    const H = batasMenit(q);
    let pos = "O", t = q.t0, km = 0, total = 0;
    const urutan = [];
    for (const a of seq) {
      const p = a.p, ruas = tempuh(pos, p.id);
      if (ruas == null) return null;
      const j = jendela(p, q.hari);
      if (j.status !== "valid") return null;
      const A = t + ruas, S = Math.max(A, j.buka), F = S + p.durasi;
      if (F > j.tutup) return null;
      km += jarak(pos, p.id) || 0;
      const b = biaya(p).nilai;               // metode repo: biaya_rp + estimasi makan di tiap tempat
      total += b;
      urutan.push({ alt: a, tempuh: ruas, jarak: jarak(pos, p.id), tiba: A, mulai: S, selesai: F, tunggu: S - A, biaya: b });
      t = F; pos = p.id;
    }
    let pulang = null;
    if (q.kembali && seq.length) {
      const r = tempuh(pos, "O");
      if (r == null) return null;
      pulang = { tempuh: r, jarak: jarak(pos, "O") };
      t += r; km += pulang.jarak || 0;
    }
    if (t - q.t0 > H) return null;
    // Metode repo: anggaran dibandingkan dengan Σ biaya seluruh tempat (tiket/paket + makan per tempat)
    if (q.anggaran != null && total > q.anggaran) return null;
    return { urutan, pulang, totalMenit: t - q.t0, jamSelesai: t, totalKm: km, totalBiaya: total };
  }

  function* kombinasi(arr, k, mulai = 0, kini = []) {
    if (kini.length === k) { yield kini.slice(); return; }
    for (let i = mulai; i < arr.length; i++) { kini.push(arr[i]); yield* kombinasi(arr, k, i + 1, kini); kini.pop(); }
  }
  function* permutasi(arr) {
    if (arr.length <= 1) { yield arr.slice(); return; }
    for (let i = 0; i < arr.length; i++) {
      const sisa = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutasi(sisa)) yield [arr[i], ...p];
    }
  }

  /**
   * Pengambilan keputusan rencana (metode repo kharismaaw/webgis-wisata-kulonprogo, js/saw.js):
   * 1. Ambil kandidatPool (10) teratas hasil SAW.
   * 2. Coba semua kombinasi jumlahStop (3) tempat; untuk tiap kombinasi coba semua urutan kunjungan.
   * 3. Urutan sah bila lolos evaluasi() (waktu total, anggaran total, jam buka).
   * 4. Pilih kombinasi dengan Σ skor SAW terbesar; bila sama, total waktu tersingkat.
   * 5. Bila tak ada yang muat, ulangi untuk 2 tempat, lalu 1 tempat.
   */
  function susunRencana(peringkat, tempuh, jarak, q, opsi = {}) {
    const n0 = opsi.jumlahStop ?? PARAM.jumlahStop;
    const kandidat = peringkat.slice(0, opsi.kandidatPool ?? PARAM.kandidatPool);
    for (let n = Math.min(n0, kandidat.length); n >= 1; n--) {
      let best = null;
      for (const kombo of kombinasi(kandidat, n)) {
        // pangkas cepat: total biaya kombinasi melebihi anggaran
        if (q.anggaran != null && kombo.reduce((s, k) => s + biaya(k.p).nilai, 0) > q.anggaran) continue;
        const skor = kombo.reduce((s, k) => s + k.V, 0);
        if (best && skor < best.skor - 1e-12) continue;
        for (const perm of permutasi(kombo)) {
          const ev = evaluasi(perm, tempuh, jarak, q);
          if (!ev) continue;
          if (!best || skor > best.skor + 1e-12 || (Math.abs(skor - best.skor) <= 1e-12 && ev.totalMenit < best.ev.totalMenit))
            best = { skor, ev };
        }
      }
      if (best) return { ...best.ev, skorTotal: best.skor, jumlahDiminta: n0 };
    }
    return { urutan: [], pulang: null, totalMenit: 0, totalBiaya: 0, totalKm: 0, skorTotal: 0, jumlahDiminta: n0 };
  }

  return { PARAM, KRITERIA, HARI, haversineKm, estimasiTempuh, keMenit, keJam, fmtRp,
    normalisasiBobot, makan, biaya, jendela, saring, saw, evaluasi, susunRencana };
});
