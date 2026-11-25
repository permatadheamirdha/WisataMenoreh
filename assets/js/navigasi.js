/* =====================================================================
 * navigasi.js — Navigasi rute di dalam WebGIS (tanpa Google Maps).
 * Memakai respons OSRM /route (steps=true, geometries=geojson).
 * Tanpa dependensi DOM agar dapat diuji dengan Node.js.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Navigasi = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ARAH = {
    left: "kiri", right: "kanan", "slight left": "agak ke kiri", "slight right": "agak ke kanan",
    "sharp left": "tajam ke kiri", "sharp right": "tajam ke kanan", straight: "lurus", uturn: "putar balik",
  };
  const IKON = {
    left: "↰", right: "↱", "slight left": "↖", "slight right": "↗", "sharp left": "↰", "sharp right": "↱",
    straight: "↑", uturn: "↶",
  };

  function keJalan(nama) { return nama ? " ke " + nama : ""; }
  function diJalan(nama) { return nama ? " di " + nama : ""; }
  function ordinal(n) { return "ke-" + n; }

  /** Terjemahkan satu langkah OSRM ke kalimat bahasa Indonesia. */
  function teksInstruksi(step, namaTujuan) {
    const m = step.maneuver || {};
    const tipe = m.type, mod = m.modifier, jalan = step.name || "";
    const arah = ARAH[mod] || "";
    switch (tipe) {
      case "depart": return "Berangkat" + (jalan ? " melalui " + jalan : "") + (arah && mod !== "straight" ? ", arah " + arah : "");
      case "arrive": return "Tiba di " + (namaTujuan || "tujuan");
      case "turn":
        if (mod === "uturn") return "Putar balik" + diJalan(jalan);
        if (mod === "straight") return "Lurus terus" + diJalan(jalan);
        return "Belok " + arah + keJalan(jalan);
      case "new name": return "Lanjut" + (jalan ? " ke " + jalan : " lurus");
      case "continue":
        if (mod === "uturn") return "Putar balik" + diJalan(jalan);
        if (!mod || mod === "straight") return "Lurus terus" + diJalan(jalan);
        return "Tetap " + arah + diJalan(jalan);
      case "merge": return "Bergabung " + (arah ? "ke " + arah : "") + keJalan(jalan);
      case "on ramp": return "Masuk jalur " + (arah || "") + keJalan(jalan);
      case "off ramp": return "Keluar jalur " + (arah || "") + keJalan(jalan);
      case "fork": return "Di percabangan, ambil " + (arah.replace("agak ", "") || "lurus") + keJalan(jalan);
      case "end of road": return "Di ujung jalan, belok " + (arah.replace("agak ", "") || "") + keJalan(jalan);
      case "roundabout":
      case "rotary":
        return "Masuk bundaran, ambil jalan keluar " + ordinal(m.exit || 1) + keJalan(jalan);
      case "roundabout turn": return "Di bundaran, belok " + arah + keJalan(jalan);
      case "exit roundabout":
      case "exit rotary": return "Keluar bundaran" + keJalan(jalan);
      case "notification": return "Lanjut" + diJalan(jalan);
      default: return (arah ? "Arah " + arah : "Lanjut") + keJalan(jalan);
    }
  }

  function ikon(step) {
    const m = step.maneuver || {};
    if (m.type === "arrive") return "⚑";
    if (m.type === "depart") return "●";
    if (m.type === "roundabout" || m.type === "rotary") return "⟳";
    return IKON[m.modifier] || "↑";
  }

  /* --------- geometri planar lokal (meter) --------- */
  const R = 6371000;
  function keXY(lat, lon, lat0) {
    const k = Math.PI / 180;
    return [lon * k * R * Math.cos(lat0 * k), lat * k * R];
  }
  function jarakM(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /**
   * Bangun model navigasi dari route OSRM.
   * stops: [{nama}] — satu per leg (tujuan setiap leg).
   */
  function buatModel(route, stops) {
    const lat0 = route.geometry.coordinates[0][1];
    const pts = [], cum = [];
    const tambah = (lon, lat) => {
      const xy = keXY(lat, lon, lat0);
      if (pts.length) {
        const prev = pts[pts.length - 1];
        const d = jarakM(prev.xy, xy);
        if (d < 0.01) return;
        cum.push(cum[cum.length - 1] + d);
      } else cum.push(0);
      pts.push({ lat, lon, xy });
    };
    route.geometry.coordinates.forEach(c => tambah(c[0], c[1]));

    // Langkah: posisi sepanjang rute dihitung dari akumulasi jarak step OSRM
    const langkah = [], legAkhir = [];
    let s = 0;
    route.legs.forEach((leg, li) => {
      leg.steps.forEach(st => {
        const nm = st.maneuver.type === "arrive" ? (stops[li] && stops[li].nama) : null;
        langkah.push({
          leg: li, sepanjang: s, jarak: st.distance, durasi: st.duration,
          teks: teksInstruksi(st, nm), ikon: ikon(st), tipe: st.maneuver.type,
          lokasi: [st.maneuver.location[1], st.maneuver.location[0]],
        });
        s += st.distance;
      });
      legAkhir.push(s);
    });
    // Skala: panjang geometri bisa sedikit berbeda dari jumlah distance OSRM
    const total = cum[cum.length - 1];
    const skala = s > 0 ? total / s : 1;
    langkah.forEach(l => (l.sepanjang *= skala));
    const legAkhirM = legAkhir.map(v => v * skala);
    const kecepatan = route.duration > 0 ? route.distance / route.duration : 12; // m/s
    return { lat0, pts, cum, total, langkah, legAkhir: legAkhirM, stops, kecepatan };
  }

  /** Proyeksikan posisi ke rute; pilih proyeksi yang tidak mundur dari lastS (jalan pergi-pulang). */
  function proyeksi(model, lat, lon, lastS) {
    const p = keXY(lat, lon, model.lat0);
    let terbaik = null, terbaikMaju = null;
    for (let i = 0; i < model.pts.length - 1; i++) {
      const a = model.pts[i].xy, b = model.pts[i + 1].xy;
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = jarakM(p, q);
      const s = model.cum[i] + t * (model.cum[i + 1] - model.cum[i]);
      const kand = { d, s };
      if (!terbaik || d < terbaik.d) terbaik = kand;
      if (lastS != null && s >= lastS - 30 && s <= lastS + 800 && (!terbaikMaju || d < terbaikMaju.d)) terbaikMaju = kand;
    }
    // Gunakan proyeksi "maju" bila cukup dekat; hindari lompatan ke ruas balik
    if (terbaikMaju && terbaikMaju.d <= Math.max(terbaik.d + 25, 40)) return terbaikMaju;
    return terbaik;
  }

  function titikPada(model, s) {
    s = Math.max(0, Math.min(model.total, s));
    let lo = 0, hi = model.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (model.cum[mid] <= s) lo = mid; else hi = mid; }
    const a = model.pts[lo], b = model.pts[hi] || a;
    const seg = model.cum[hi] - model.cum[lo];
    const t = seg > 0 ? (s - model.cum[lo]) / seg : 0;
    return [a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon)];
  }

  /**
   * Status navigasi untuk satu posisi.
   * Mengembalikan: sepanjang, menyimpang (m), langkah berikut, keManuver (m),
   * leg, tujuan, sisaLeg, sisaTotal (m), sisaDetik, tibaLeg (bool), selesai (bool)
   */
  function statusNavigasi(model, lat, lon, lastS) {
    const pr = proyeksi(model, lat, lon, lastS);
    const s = pr.s;
    let leg = model.legAkhir.findIndex(e => s < e - 25);
    const selesai = leg === -1;
    if (selesai) leg = model.legAkhir.length - 1;
    const sisaLeg = Math.max(0, model.legAkhir[leg] - s);
    const langkah = model.langkah.find(l => l.sepanjang > s + 5 && l.tipe !== "depart") ||
      model.langkah[model.langkah.length - 1];
    const sisaTotal = Math.max(0, model.total - s);
    return {
      sepanjang: s, menyimpang: pr.d, langkah,
      keManuver: Math.max(0, langkah.sepanjang - s),
      leg, tujuan: model.stops[leg], sisaLeg, sisaTotal,
      sisaDetik: sisaTotal / model.kecepatan,
      tibaLeg: sisaLeg < 25, selesai,
    };
  }

  function fmtJarak(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + " m";
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",") + " km";
  }

  return { teksInstruksi, ikon, buatModel, proyeksi, titikPada, statusNavigasi, fmtJarak };
});
