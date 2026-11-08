// Uji unit perhitungan & navigasi. Jalankan: node tests/test_core.js
const assert = require("assert");
const Rekom = require("../assets/js/rekom.js");
const Nav = require("../assets/js/navigasi.js");

let lulus = 0;
function uji(nama, fn) {
  try { fn(); lulus++; console.log("  ✓", nama); }
  catch (e) { console.error("  ✗", nama, "\n   ", e.message); process.exitCode = 1; }
}
const dekat = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
const SEMUA = { senin: true, selasa: true, rabu: true, kamis: true, jumat: true, sabtu: true, minggu: true };
const P = o => Object.assign({ id: "X", kategori: "Wisata Alam", rating: 4.5, ulasan: 100, tiket: 0, makan: null,
  durasi: 60, jam_buka: "08:00", jam_tutup: "17:00", buka24: false, hari: SEMUA }, o);
const Q = o => Object.assign({ kategori: [], t0: 8 * 60, hari: 1, durasiJam: 8, kembali: true, anggaran: null, ratingMin: null, ulasanMin: null }, o);
const W = [0.41872571652994045, 0.35210495400457, 0.12448790033300441, 0.10468142913248511]; // Matriks AHP & SAW.xlsx

console.log("Bobot");
uji("Bobot default 4 kriteria berjumlah 1", () => { assert.strictEqual(W.length, 4); dekat(W.reduce((a, b) => a + b), 1, 1e-12); });
uji("Slider dinormalisasi; semua 0 ditolak", () => {
  const w = Rekom.normalisasiBobot([50, 25, 25]); dekat(w[0], 0.5);
  assert.throws(() => Rekom.normalisasiBobot([0, 0, 0]));
});

console.log("Biaya & makan");
uji("C2 = tiket + makan; makan kosong tidak dianggap angka", () => {
  assert.strictEqual(Rekom.biaya(P({ tiket: 10000, makan: 30000 })).nilai, 40000);
  const b = Rekom.biaya(P({ tiket: 5000 }));
  assert.strictEqual(b.nilai, 5000); assert.strictEqual(b.makanDiketahui, false);
  assert.strictEqual(Rekom.biaya(P({ tiket: null })).nilai, null);
});

console.log("Penyaringan");
uji("Rating, ulasan, anggaran, kategori, jadwal", () => {
  const alts = [
    { p: P({ id: "ok" }), t0i: 20, ti0: 20 },
    { p: P({ id: "kat", kategori: "Agrowisata" }), t0i: 20, ti0: 20 },
    { p: P({ id: "norat", rating: null }), t0i: 20, ti0: 20 },
    { p: P({ id: "ul0", ulasan: 0 }), t0i: 20, ti0: 20 },
    { p: P({ id: "ulnull", ulasan: null }), t0i: 20, ti0: 20 },
    { p: P({ id: "mahal", tiket: 60000 }), t0i: 20, ti0: 20 },
    { p: P({ id: "tutup", hari: { ...SEMUA, senin: false } }), t0i: 20, ti0: 20 },
    { p: P({ id: "jadwal?", hari: { ...SEMUA, senin: null } }), t0i: 20, ti0: 20 },
    { p: P({ id: "gagal" }), t0i: null, ti0: null },
  ];
  const { K } = Rekom.saring(alts, Q({ kategori: ["Wisata Alam"], anggaran: 50000, ulasanMin: 0 }));
  assert.deepStrictEqual(K.map(a => a.p.id), ["ok", "ul0"]);
});
uji("Ambang tepat lolos (R = Rmin, U = Umin)", () => {
  const { K } = Rekom.saring([{ p: P({ rating: 4, ulasan: 50 }), t0i: 10, ti0: 10 }], Q({ ratingMin: 4, ulasanMin: 50 }));
  assert.strictEqual(K.length, 1);
});
uji("Ulasan kosong tidak diperingkat (C4 wajib); ulasan 0 tetap lolos", () => {
  assert.strictEqual(Rekom.saring([{ p: P({ ulasan: null }), t0i: 10, ti0: 10 }], Q()).K.length, 0);
  assert.strictEqual(Rekom.saring([{ p: P({ ulasan: 0 }), t0i: 10, ti0: 10 }], Q()).K.length, 1);
});
uji("Kunjungan tunggal harus muat dalam durasi (pergi+kunjung+pulang)", () => {
  const a = { p: P(), t0i: 60, ti0: 70 };
  assert.strictEqual(Rekom.saring([a], Q({ durasiJam: 3 })).K.length, 0);   // 60+60+70 = 190 > 180
  assert.strictEqual(Rekom.saring([a], Q({ durasiJam: 3, kembali: false })).K.length, 1);
});

console.log("SAW");
uji("Rumus repo: cost min/x (gratis → 1), benefit x/max", () => {
  const K = [
    { p: P({ id: "A", tiket: 0, rating: 4, ulasan: 50 }), t0i: 10, ti0: 10 },
    { p: P({ id: "B", tiket: 5000, rating: 5, ulasan: 200 }), t0i: 20, ti0: 20 },
    { p: P({ id: "C", tiket: 10000, rating: 4.5, ulasan: 100 }), t0i: 40, ti0: 40 },
  ];
  const { hasil } = Rekom.saw(K, W);
  const V = Object.fromEntries(hasil.map(h => [h.p.id, h.V]));
  // C1 min = 10 → A 1, B 0,5, C 0,25 · C2 min = 0 → A (gratis) 1, B & C 0/x = 0
  dekat(V.A, W[0] * 1 + W[1] * 1 + W[2] * 0.8 + W[3] * 0.25);
  dekat(V.B, W[0] * 0.5 + W[1] * 0 + W[2] * 1 + W[3] * 1);
  dekat(V.C, W[0] * 0.25 + W[1] * 0 + W[2] * 0.9 + W[3] * 0.5);
  assert.deepStrictEqual(hasil.map(h => h.p.id), ["A", "B", "C"]);
});
uji("C1 = waktu tempuh satu arah dari titik awal (seperti repo)", () => {
  const K = [{ p: P({ id: "A" }), t0i: 10, ti0: 30 }, { p: P({ id: "B" }), t0i: 20, ti0: 10 }];
  assert.deepStrictEqual(Rekom.saw(K, W).hasil.map(h => h.x[0]), [10, 20]);
});
uji("Biaya semua > 0 → cost memakai min/x biasa", () => {
  const K = [{ p: P({ id: "A", tiket: 5000 }), t0i: 10 }, { p: P({ id: "B", tiket: 10000 }), t0i: 10 }];
  const r2 = Object.fromEntries(Rekom.saw(K, W).hasil.map(h => [h.p.id, h.r[1]]));
  dekat(r2.A, 1); dekat(r2.B, 0.5);
});

console.log("Rencana");
const tempuhDari = M => (a, b) => M[a + ">" + b] ?? M[b + ">" + a] ?? null;
uji("Batas waktu dan anggaran total ditaati (turun ke 2 tempat)", () => {
  const rank = ["1", "2", "3"].map((id, i) => ({ p: P({ id, tiket: 10000 }), V: 0.9 - i * 0.1 }));
  const M = { "O>1": 10, "O>2": 20, "O>3": 30, "1>2": 10, "2>3": 10, "1>3": 20 };
  const r = Rekom.susunRencana(rank, tempuhDari(M), () => 1, Q({ durasiJam: 3, anggaran: 20000 }));
  assert.strictEqual(r.urutan.length, 2);
  assert.strictEqual(r.jumlahDiminta, 3);
  assert.ok(r.totalMenit <= 180 && r.totalBiaya <= 20000);
});
uji("Metode repo: kombinasi 3 tempat dengan Σ skor SAW terbesar, urutan tercepat", () => {
  // 4 kandidat; kombinasi {A,B,D} punya Σ V terbesar walau D jauh
  const rank = [["A", 0.9], ["B", 0.8], ["C", 0.5], ["D", 0.7]].map(([id, V]) => ({ p: P({ id, buka24: true }), V }));
  const M = { "O>A": 10, "O>B": 10, "O>C": 5, "O>D": 40, "A>B": 5, "A>C": 5, "A>D": 30, "B>C": 5, "B>D": 30, "C>D": 30 };
  const r = Rekom.susunRencana(rank, tempuhDari(M), () => 1, Q({ durasiJam: null }));
  assert.deepStrictEqual(r.urutan.map(u => u.alt.p.id).sort(), ["A", "B", "D"]);
  dekat(r.skorTotal, 2.4, 1e-12);
  // urutan tercepat dari 6 permutasi: O→A→D→B→O = 10+30+30+10 = 80 (+180 kunjungan) = 260
  // (O→A→B→D→O = 10+5+30+40 = 85 lebih lambat)
  dekat(r.totalMenit, 260, 1e-9);
});
uji("Menunggu jam buka dihitung; biaya = Σ (tiket + makan) tiap tempat (metode repo)", () => {
  const rank = [{ p: P({ id: "1", jam_buka: "09:00", makan: 20000 }), V: 0.9 }, { p: P({ id: "2", makan: 15000 }), V: 0.8 }];
  const M = { "O>1": 30, "O>2": 30, "1>2": 10 };
  const r = Rekom.susunRencana(rank, tempuhDari(M), () => 1, Q());
  const u1 = r.urutan.find(u => u.alt.p.id === "1");
  assert.ok(u1.tunggu >= 0);
  assert.strictEqual(r.totalBiaya, 35000);
});
uji("Arah jalan berbeda (t_i0 ≠ t_0i) dipakai apa adanya", () => {
  const M = { "O>1": 10, "1>O": 50 };
  const r = Rekom.susunRencana([{ p: P({ id: "1" }), V: 1 }], (a, b) => M[a + ">" + b], () => 1, Q());
  assert.strictEqual(r.pulang.tempuh, 50);
});

console.log("Navigasi");
uji("Terjemahan petunjuk", () => {
  assert.strictEqual(Nav.teksInstruksi({ maneuver: { type: "turn", modifier: "left" }, name: "Jalan Dekso" }), "Belok kiri ke Jalan Dekso");
  assert.strictEqual(Nav.teksInstruksi({ maneuver: { type: "roundabout", exit: 2 }, name: "" }), "Masuk bundaran, ambil jalan keluar ke-2");
});
const coords = [];
for (let i = 0; i <= 10; i++) coords.push([110.2, -7.7 + i * 0.0009]);
for (let i = 9; i >= 0; i--) coords.push([110.2, -7.7 + i * 0.0009]);
const st = (t, d) => ({ maneuver: { type: t, location: [110.2, -7.7] }, name: "", distance: d, duration: d / 10 });
const model = Nav.buatModel({ distance: 2000, duration: 200, geometry: { coordinates: coords },
  legs: [{ steps: [st("depart", 1000), st("arrive", 0)] }, { steps: [st("depart", 1000), st("arrive", 0)] }] },
  [{ nama: "Puncak" }, { nama: "Awal" }]);
uji("Jalan pergi-pulang tidak melompat", () => {
  const s = Nav.statusNavigasi(model, -7.7 + 0.0045, 110.2, 1450);
  assert.ok(Math.abs(s.sepanjang - 1500) < 30); assert.strictEqual(s.leg, 1);
});
uji("Keluar jalur terdeteksi & simulasi tiba", () => {
  assert.ok(Nav.statusNavigasi(model, -7.6955, 110.202, 500).menyimpang > 150);
  const [lat, lon] = Nav.titikPada(model, model.total);
  assert.ok(Nav.statusNavigasi(model, lat, lon, model.total - 10).selesai);
});

console.log(`\n${lulus} uji lulus`);
