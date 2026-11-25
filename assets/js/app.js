/* =====================================================================
 * app.js — Antarmuka WebGIS Wisata Menoreh (untuk wisatawan)
 * Peta · Panduan 5 pertanyaan · Rencana perjalanan · Navigasi via Google Maps
 * ===================================================================== */
(function () {
  "use strict";

  const OSRM = "https://router.project-osrm.org";
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const BATAS_WAKTU_MS = 15000;

  const WARNA = {
    "Wisata Alam": "#1F8A4C", "Wisata Alam-Buatan": "#2479C9", "Religi dan Budaya": "#7457C8",
    "Agrowisata": "#D18A0F", "Akomodasi dan Rekreasi": "#C93C7B",
  };
  /** Ikon Bootstrap Icons, mis. ik("geo-alt") → <i class="bi bi-geo-alt"></i> */
  const ik = n => `<i class="bi bi-${n}" aria-hidden="true"></i>`;
  const IKON_KAT = {
    "Wisata Alam": ik("tree"), "Wisata Alam-Buatan": ik("water"), "Religi dan Budaya": ik("bank"),
    "Agrowisata": ik("flower2"), "Akomodasi dan Rekreasi": ik("house-door"),
  };
  const KATEGORI = Object.keys(WARNA);
  const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  const W = window.WISATA.features.map(f => f.properties);
  const BY_ID = Object.fromEntries(W.map(p => [p.id, p]));
  const MX = window.MATRIKS, IDX = Object.fromEntries(MX.ids.map((id, i) => [id, i]));
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rp = v => (v == null ? "–" : v === 0 ? "Gratis" : "Rp" + Rekom.fmtRp(v));
  const mnt = v => {
    if (v == null) return "–";
    const m = Math.round(v);
    return m < 60 ? m + " mnt" : Math.floor(m / 60) + " j" + (m % 60 ? " " + (m % 60) + " mnt" : "");
  };
  const km = v => (v == null ? "–" : v.toFixed(1).replace(".", ",") + " km");
  const jamTxt = m => Rekom.keJam(m);

  /* ================= State ================= */
  function sekarangWIB() {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    const o = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
    return { hari: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday), menit: (+o.hour % 24) * 60 + +o.minute };
  }
  const now = sekarangWIB();
  const jamAwal = Math.min(Math.max(8 * 60, Math.ceil((now.menit + 30) / 60) * 60), 17 * 60);
  const S = {
    bobot: window.BOBOT_DEFAULT.w.slice(),
    q: { lokasi: null, kategori: [], waktuJam: null, waktuDipilih: false, anggaran: null, anggaranDipilih: false,
      ratingMin: null, ratingDipilih: false, hari: now.hari, jam: Rekom.keJam(jamAwal).replace(".", ":") },
    hasil: null,
  };

  /* ================= Peta ================= */
  const map = L.map("map", { zoomControl: false }).setView([-7.705, 110.185], 12);
  L.control.zoom({ position: "topright" }).addTo(map);
  const ATR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: ATR_OSM }).addTo(map);
  map.attributionControl.addAttribution('Rute: <a href="https://project-osrm.org">OSRM</a>');
  const lyrKec = L.geoJSON(window.KAPANEWON, {
    style: { color: "#0d3b36", weight: 1.8, fillColor: "#3c9a8b", fillOpacity: 0.12 },
    onEachFeature: (f, l) => l.bindTooltip("Kapanewon " + f.properties.kapanewon, { sticky: true }),
  }).addTo(map);
  const lyrWisata = L.layerGroup().addTo(map);
  const lyrRekom = L.layerGroup().addTo(map);
  const lyrRute = L.layerGroup().addTo(map);
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
  /** Ruang peta yang tertutup panel melayang (desktop), agar fitBounds tidak tersembunyi di balik panel. */
  const lapang = () => {
    if (window.innerWidth <= 900) return { padding: [20, 20] };
    const kanan = document.body.classList.contains("ada-kanan") ? 410 : 40;
    return { paddingTopLeft: [400, 40], paddingBottomRight: [kanan, 60] };
  };
  if (lyrKec.getLayers().length) map.fitBounds(lyrKec.getBounds(), lapang());

  function jadwalTeks(p) {
    const hari = Rekom.HARI.map((h, i) => (p.hari[h] ? NAMA_HARI[i].slice(0, 3) : null)).filter(Boolean);
    const hariTxt = Object.values(p.hari).every(v => v == null) ? "Hari buka belum diketahui"
      : hari.length === 7 ? "Setiap hari" : hari.length ? hari.join(", ") : "Tutup";
    const jamTx = p.buka24 ? "24 jam" : p.jam_buka ? `${p.jam_buka.replace(":", ".")}–${p.jam_tutup.replace(":", ".")}` : "";
    return jamTx ? `${hariTxt}, ${jamTx}` : hariTxt;
  }
  function popupHTML(p) {
    const a = S.hasil && S.hasil.alts.find(x => x.p.id === p.id);
    return `<div class="popup">
      <span class="pil" style="--w:${WARNA[p.kategori]}">${IKON_KAT[p.kategori]} ${esc(p.kategori)}</span>
      <h4>${esc(p.nama)}</h4>
      <div class="popup-lokasi">${esc(p.kalurahan)}, ${esc(p.kapanewon)}</div>
      <div class="popup-fakta">
        <div><b>${p.rating != null ? ik("star-fill") + " " + String(p.rating).replace(".", ",") : "–"}</b><span>${p.ulasan != null ? p.ulasan.toLocaleString("id-ID") + " ulasan" : "rating"}</span></div>
        <div><b>${rp(p.tiket)}</b><span>${p.paket != null && p.tiket === p.paket && p.tiket !== p.tiket_masuk ? "paket" : "tiket"}</span></div>
        <div><b>${a && a.t0i != null ? mnt(a.t0i) : "± " + mnt(p.durasi)}</b><span>${a && a.t0i != null ? "dari Anda" : "kunjungan"}</span></div>
      </div>
      <p>${esc(p.deskripsi)}</p>
      <div class="popup-baris">${ik("clock")}${jadwalTeks(p)}</div>
      ${p.makan != null ? `<div class="popup-baris">${ik("cup-hot")}Estimasi makan ± ${rp(p.makan)}/orang</div>` : ""}
      ${p.gmaps ? `<a class="popup-link" href="${esc(p.gmaps)}" target="_blank" rel="noopener">Lihat foto dan ulasan ${ik("box-arrow-up-right")}</a>` : ""}</div>`;
  }
  /** Simbol kategori: lingkaran berwarna kategori berisi ikon (sama dengan ikon di daftar & legenda). */
  const simbolKat = k => `<span class="simbol-kat" style="--w:${WARNA[k] || "#555"}">${IKON_KAT[k] || ik("geo-alt-fill")}</span>`;
  const IKON_PETA = Object.fromEntries(KATEGORI.map(k => [k, L.divIcon({
    className: "", html: simbolKat(k), iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12], tooltipAnchor: [0, -12],
  })]));
  const markers = {};
  W.forEach(p => {
    markers[p.id] = L.marker([p.lat, p.lon], { icon: IKON_PETA[p.kategori] || IKON_PETA[KATEGORI[0]], riseOnHover: true })
      .bindPopup(() => popupHTML(p), { maxWidth: 290, minWidth: 250 })
      .bindTooltip(p.nama, { direction: "top" }).addTo(lyrWisata);
  });
  $("#legenda").innerHTML = `<button class="legenda-judul" aria-expanded="true" title="Perkecil legenda">Kategori Wisata ${ik("chevron-down")}</button>`
    + KATEGORI.map(k => `<div>${simbolKat(k)}${k}</div>`).join("");

  /* ================= Perkecil / perbesar panel ================= */
  const simpan = (k, v) => { try { localStorage.setItem(k, v ? "1" : ""); } catch (e) { /* abaikan */ } };
  const ingat = k => { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } };
  function aturKiri(min) {
    document.body.classList.toggle("kiri-min", min);
    const b = $("#btnMinKiri");
    b.setAttribute("aria-expanded", String(!min));
    b.title = min ? "Perbesar panel" : "Perkecil panel";
    simpan("min-kiri", min);
  }
  function aturKanan(min) {
    document.body.classList.toggle("kanan-min", min);
    const b = $("#btnMinKanan");
    b.setAttribute("aria-expanded", String(!min));
    b.innerHTML = min ? `${ik("layout-sidebar-reverse")} <span>Tampilkan Rencana</span>` : `${ik("layout-sidebar-inset-reverse")} <span>Sembunyikan</span>`;
    simpan("min-kanan", min);
  }
  function aturLegenda(min) {
    $("#legenda").classList.toggle("ciut", min);
    const b = $("#legenda .legenda-judul");
    b.setAttribute("aria-expanded", String(!min));
    b.title = min ? "Tampilkan legenda" : "Perkecil legenda";
    simpan("min-legenda", min);
  }
  $("#btnMinKiri").onclick = () => aturKiri(!document.body.classList.contains("kiri-min"));
  $("#btnMinKanan").onclick = () => aturKanan(!document.body.classList.contains("kanan-min"));
  $("#legenda .legenda-judul").onclick = () => aturLegenda(!$("#legenda").classList.contains("ciut"));
  aturKiri(ingat("min-kiri")); aturKanan(ingat("min-kanan")); aturLegenda(ingat("min-legenda"));

  function status(teks, ms) {
    const el = $("#status");
    if (!teks) { el.hidden = true; return; }
    el.textContent = teks; el.hidden = false;
    clearTimeout(status._t);
    if (ms) status._t = setTimeout(() => (el.hidden = true), ms);
  }

  /* ================= Tab ================= */
  $$(".tab").forEach(b => b.addEventListener("click", () => bukaTab(b.dataset.tab)));
  function bukaTab(t) {
    aturKiri(false);   // memilih menu selalu membuka kembali panel kiri
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    $$(".isi-tab").forEach(d => d.classList.toggle("aktif", d.id === "tab-" + t));
    aturPanelKanan();
  }
  /** Panel kanan (rencana/rekomendasi/lainnya) tampil hanya di tab Rencana setelah ada hasil. */
  function aturPanelKanan() {
    const aktif = $(".tab.active");
    const tampil = !$("#rekomHasil").hidden && aktif && aktif.dataset.tab === "rekom";
    $("#panelKanan").hidden = !tampil;
    $("#btnMinKanan").hidden = !tampil;
    document.body.classList.toggle("ada-kanan", !!tampil);
  }
  $$(".subtab").forEach(b => b.addEventListener("click", () => bukaSub(b.dataset.sub)));
  function bukaSub(t) {
    $$(".subtab").forEach(b => b.classList.toggle("active", b.dataset.sub === t));
    $$(".isi-sub").forEach(d => d.classList.toggle("aktif", d.id === "sub-" + t));
  }

  /* ================= Jaringan jalan ================= */
  async function ambilJSON(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), BATAS_WAKTU_MS);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.code && j.code !== "Ok") throw new Error(j.code);
      return j;
    } finally { clearTimeout(t); }
  }
  const lonlat = pts => pts.map(p => p.lon.toFixed(6) + "," + p.lat.toFixed(6)).join(";");
  const kor = d => (d == null ? null : (d / 60) * Rekom.PARAM.koreksiWaktu);

  async function waktuAsal(awal) {
    const pts = lonlat([awal, ...W]);
    try {
      const [a, b] = await Promise.all([
        ambilJSON(`${OSRM}/table/v1/driving/${pts}?sources=0&annotations=duration,distance`),
        ambilJSON(`${OSRM}/table/v1/driving/${pts}?destinations=0&annotations=duration,distance`),
      ]);
      return W.map((p, i) => ({
        p, t0i: kor(a.durations[0][i + 1]), km0i: a.distances[0][i + 1] == null ? null : a.distances[0][i + 1] / 1000,
        ti0: kor(b.durations[i + 1][0]), ki0: b.distances[i + 1][0] == null ? null : b.distances[i + 1][0] / 1000,
        estimasi: false,
      }));
    } catch (e) {
      console.warn("OSRM tidak menjawab, memakai perkiraan:", e);
      return W.map(p => {
        const e2 = Rekom.estimasiTempuh(awal.lat, awal.lon, p.lat, p.lon);
        return { p, t0i: e2.menit, km0i: e2.km, ti0: e2.menit, ki0: e2.km, estimasi: true };
      });
    }
  }
  async function ruteOSRM(pts) {
    const j = await ambilJSON(`${OSRM}/route/v1/driving/${lonlat(pts)}?overview=full&geometries=geojson&steps=true`);
    return j.routes[0];
  }

  /* ================= Perhitungan ================= */
  async function hitung() {
    const q = S.q;
    bukaTab("rekom");
    $("#rekomKosong").hidden = true;
    $("#rekomHasil").hidden = false;
    aturKanan(false);   // rencana baru selalu ditampilkan
    aturPanelKanan();
    renderRingkasJawaban();
    const memuat = `<div class="memuat"><span class="spinner-border spinner-border-sm"></span>Menyusun rencana perjalanan…</div>`;
    $("#kartuRingkas").innerHTML = `<div class="kartu-label">Ringkasan Perjalanan</div>${memuat}`;
    $("#sub-rute").innerHTML = memuat;
    $("#sub-peringkat").innerHTML = $("#sub-tersaring").innerHTML = "";
    bukaSub("rute");

    const Q = { kategori: q.kategori, t0: Rekom.keMenit(q.jam), hari: q.hari, durasiJam: q.waktuJam,
      kembali: true, anggaran: q.anggaran, ratingMin: q.ratingMin, ulasanMin: null };
    const alts = await waktuAsal(q.lokasi);
    const byId = Object.fromEntries(alts.map(a => [a.p.id, a]));
    const tempuh = (a, b) => {
      if (a === "O") return byId[b].t0i;
      if (b === "O") return byId[a].ti0;
      const v = MX.waktu_menit[IDX[a]][IDX[b]];
      return v == null ? null : v * Rekom.PARAM.koreksiWaktu;
    };
    const jarak = (a, b) => (a === "O" ? byId[b].km0i : b === "O" ? byId[a].ki0 : MX.jarak_km[IDX[a]][IDX[b]]);

    const { K, tidak } = Rekom.saring(alts, Q);
    const saw = Rekom.saw(K, S.bobot);
    const rencana = Rekom.susunRencana(saw.hasil, tempuh, jarak, Q);
    S.hasil = { Q, alts, K, tidak, saw, rencana, estimasi: alts.some(a => a.estimasi) };

    renderPeringkat();
    renderTidak();
    tandaiPeta();
    await gambarRute();
    renderRencana();
    if (S.hasil.estimasi) status("Koneksi ke server rute terputus — waktu tempuh berupa perkiraan.", 5000);
  }

  /* ================= Teks jawaban ================= */
  const T = {
    lokasi: () => (S.q.lokasi ? S.q.lokasi.label : "Belum dipilih"),
    kategori: () => (S.q.kategori.length ? S.q.kategori.join(", ") : "Bebas"),
    waktu: () => (S.q.waktuJam != null ? String(S.q.waktuJam).replace(".", ",") + " jam" : "Tidak dibatasi"),
    berangkat: () => `${NAMA_HARI[S.q.hari]}, ${S.q.jam.replace(":", ".")}`,
    anggaran: () => (S.q.anggaran != null ? (S.q.anggaran === 0 ? "Gratis saja" : "Maks. Rp" + Rekom.fmtRp(S.q.anggaran) + "/orang") : "Tidak dibatasi"),
    rating: () => (S.q.ratingMin != null ? "Rating " + S.q.ratingMin.toFixed(1).replace(".", ",") + " ke atas" : "Tidak dibatasi"),
  };

  /* ================= Render hasil ================= */
  function renderRingkasJawaban() {
    const chip = (ikon, t, ke) => `<button class="chip" data-ke="${ke}" title="Ubah kriteria">${ik(ikon)}<span>${esc(t)}</span></button>`;
    $("#kartuKriteria").innerHTML = `
        <div class="kriteria-kepala">Pilihan Perjalanan Anda <button data-ubah-semua>${ik("pencil-square")} Ubah</button></div>
        <div class="chips">
          ${chip("geo-alt", T.lokasi(), 0)}${chip("tag", T.kategori(), 1)}${chip("clock", T.waktu() + " · " + T.berangkat(), 2)}
          ${chip("wallet2", T.anggaran(), 3)}${chip("star", T.rating(), 4)}
        </div>`;
    $$("#kartuKriteria .chip").forEach(b => (b.onclick = () => bukaWizard(+b.dataset.ke)));
    $("#kartuKriteria [data-ubah-semua]").onclick = () => bukaWizard(RINGKAS);
  }

  function renderPeringkat() {
    const { saw, rencana } = S.hasil, el = $("#sub-peringkat");
    if (!saw.hasil.length) { el.innerHTML = kosongHTML("Belum ada destinasi yang sesuai dengan pilihan Anda."); pasangUbah(el); return; }
    const diRencana = new Set(rencana.urutan.map(u => u.alt.p.id));
    el.innerHTML = `<p class="petunjuk-kecil">${saw.hasil.length} destinasi sesuai dengan pilihan Anda, diurutkan dari yang paling sesuai.</p>
      <ul class="daftar">${saw.hasil.map(h => {
        const p = h.p;
        return `<li class="item" data-id="${p.id}">
          <div class="no">${h.peringkat}</div>
          <div class="badan">
            <h4>${esc(p.nama)}</h4>
            <div class="meta">${IKON_KAT[p.kategori]} ${esc(p.kategori)}${diRencana.has(p.id) ? ` · <span class="tanda-rencana">${ik("check-circle-fill")} dalam rencana</span>` : ""}</div>
            <div class="meta">${ik("star-fill")} ${String(p.rating).replace(".", ",")} · ${ik("car-front")} ${mnt(h.t0i)} · ${rp(Rekom.biaya(p).nilai)}${Rekom.biaya(p).nilai > 0 ? "/orang" : ""}</div>
          </div>
          <div class="skor"><b>${Math.round(h.V * 100)}%</b><small>Sesuai</small></div>
        </li>`;
      }).join("")}</ul>`;
    el.querySelectorAll(".item").forEach(li => li.addEventListener("click", () => fokus(li.dataset.id)));
  }

  function renderTidak() {
    const lain = S.hasil.tidak.filter(t => !t.alasan.includes("Jenis wisata tidak dipilih"));
    const el = $("#sub-tersaring");
    el.innerHTML = lain.length ? `<p class="petunjuk-kecil">Destinasi berikut belum sesuai dengan pilihan Anda, tetapi tetap dapat dilihat di peta. Alasannya tercantum di bawah nama destinasi.</p>
      <ul class="daftar ringkas-daftar">${lain.map(t => `<li class="item" data-id="${t.alt.p.id}"><div class="badan">
        <h4>${esc(t.alt.p.nama)}</h4><div class="meta">${t.alasan.map(esc).join(" · ")}</div></div></li>`).join("")}</ul>`
      : `<p class="petunjuk-kecil">Seluruh destinasi pada jenis wisata pilihan Anda sudah sesuai.</p>`;
    $$("#sub-tersaring .item").forEach(li => li.addEventListener("click", () => fokus(li.dataset.id)));
  }

  function kosongHTML(judul) {
    return `<div class="kosong-kecil">${ik("compass")}<b>${judul}</b>
      <p>Pertimbangkan untuk menambah waktu atau anggaran, atau menurunkan rating minimum.</p>
      <button class="btn btn-gelap btn-sm" data-ubah>${ik("sliders")}Ubah Pilihan</button></div>`;
  }
  const pasangUbah = el => el.querySelectorAll("[data-ubah]").forEach(b => (b.onclick = () => bukaWizard(RINGKAS)));

  function fokus(id) {
    const p = BY_ID[id];
    if (window.innerWidth <= 900) $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 14));
    if (!lyrWisata.hasLayer(markers[id])) lyrWisata.addLayer(markers[id]);
    markers[id].openPopup();
  }

  function tandaiPeta() {
    lyrRekom.clearLayers();
    const cocok = new Set(S.hasil.K.map(a => a.p.id));
    W.forEach(p => markers[p.id].setOpacity(cocok.has(p.id) ? 1 : 0.35));
    const awal = S.q.lokasi;
    L.marker([awal.lat, awal.lon], {
      icon: L.divIcon({ className: "", html: '<div class="penanda-awal"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
      zIndexOffset: 1000,
    }).bindTooltip("Titik berangkat").addTo(lyrRekom);
    const titik = [[awal.lat, awal.lon], ...S.hasil.rencana.urutan.map(u => [u.alt.p.lat, u.alt.p.lon])];
    if (titik.length < 2) S.hasil.saw.hasil.slice(0, 5).forEach(h => titik.push([h.p.lat, h.p.lon]));
    if (titik.length > 1) map.fitBounds(L.latLngBounds(titik).pad(0.1), lapang());
  }

  async function gambarRute() {
    lyrRute.clearLayers();
    const r = S.hasil.rencana;
    r.model = null; r.osrm = null;
    if (!r.urutan.length) return;
    const stops = r.urutan.map(u => u.alt.p);
    const pts = [S.q.lokasi, ...stops, S.q.lokasi];
    const namaStop = [...stops.map(p => ({ nama: p.nama, id: p.id })), { nama: "titik berangkat" }];
    try {
      const route = await ruteOSRM(pts);
      r.osrm = route;
      r.model = Navigasi.buatModel(route, namaStop);
      L.geoJSON(route.geometry, { style: { color: "#fff", weight: 8, opacity: 0.95 } }).addTo(lyrRute);
      L.geoJSON(route.geometry, { style: { color: "#d9472a", weight: 4.5 } }).addTo(lyrRute);
    } catch (e) {
      console.warn("Rute jalan gagal:", e);
      L.polyline(pts.map(p => [p.lat, p.lon]), { color: "#d9472a", weight: 3, dashArray: "6 6" }).addTo(lyrRute);
    }
    r.urutan.forEach((u, i) => {
      L.marker([u.alt.p.lat, u.alt.p.lon], {
        icon: L.divIcon({ className: "", html: `<div class="penanda-no">${i + 1}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
        zIndexOffset: 800,
      }).bindPopup(() => popupHTML(u.alt.p), { maxWidth: 290, minWidth: 250 }).bindTooltip(`${i + 1}. ${u.alt.p.nama}`).addTo(lyrRute);
    });
  }

  function renderRencana() {
    const r = S.hasil.rencana, el = $("#sub-rute"), kartu = $("#kartuRingkas");
    if (!r.urutan.length) {
      kartu.innerHTML = `<div class="kartu-label">Ringkasan Perjalanan</div>
        <p class="redup mb-0">Belum ada rencana yang dapat disusun. Lihat keterangan di panel kanan.</p>`;
      el.innerHTML = kosongHTML(S.hasil.K.length ? "Destinasi yang sesuai belum dapat dikunjungi dalam waktu atau anggaran Anda." : "Belum ada destinasi yang sesuai dengan pilihan Anda.");
      pasangUbah(el); return;
    }
    const kmTotal = r.osrm ? r.osrm.distance / 1000 : r.totalKm;
    // Komposisi waktu: perjalanan, kunjungan, menunggu buka (dari rencana yang sudah dihitung)
    const jalan = r.urutan.reduce((s, u) => s + (u.tempuh || 0), 0) + (r.pulang ? r.pulang.tempuh || 0 : 0);
    const kunjung = r.urutan.reduce((s, u) => s + Math.max(0, (u.selesai || 0) - (u.mulai || 0)), 0);
    const tunggu = r.urutan.reduce((s, u) => s + Math.max(0, u.tunggu || 0), 0);
    const jml = jalan + kunjung + tunggu || 1;
    const KOMP = [["Perjalanan", jalan, "#8fc9bd"], ["Berkunjung", kunjung, "#0d3b36"], ["Menunggu", tunggu, "#ffc24b"]].filter(k => k[1] > 0.5);
    kartu.innerHTML = `
      <div class="kartu-label">Ringkasan Perjalanan <span class="lencana">${NAMA_HARI[S.q.hari]}, ${jamTxt(S.hasil.Q.t0)}–${jamTxt(r.jamSelesai)}</span></div>
      <div class="angka-besar">${mnt(r.totalMenit)}</div>
      <div class="sub-angka">
        <span>${ik("geo-alt")}${r.urutan.length} destinasi</span>
        <span>${ik("wallet2")}${r.totalBiaya === 0 ? "Gratis" : "Rp" + Rekom.fmtRp(r.totalBiaya) + "/orang"}</span>
        <span>${ik("signpost")}± ${km(kmTotal)}</span>
      </div>
      <div class="komposisi">${KOMP.map(([, v, c]) => `<i style="flex:${v};background:${c}"></i>`).join("")}</div>
      <div class="komposisi-ket">${KOMP.map(([n, v, c]) => `<div style="--c:${c}">${n}<b>${mnt(v)} · ${Math.round(v / jml * 100)}%</b></div>`).join("")}</div>
      <a class="btn btn-gelap btn-lg w-100" href="${urlGoogleMaps(r)}" target="_blank" rel="noopener">${ik("sign-turn-right")}Mulai Navigasi</a>
      <p class="petunjuk-kecil">Navigasi dibuka di Google Maps dengan urutan kunjungan yang sama.</p>`;
    el.innerHTML = `
      ${r.urutan.length < r.jumlahDiminta ? `<p class="catatan">${ik("info-circle")}<span>Hanya ${r.urutan.length} destinasi yang muat dalam waktu dan anggaran Anda (rencana ideal ${r.jumlahDiminta} destinasi).</span></p>` : ""}
      <ol class="lini">
        <li class="titik-awal"><div class="lini-jam">${jamTxt(S.hasil.Q.t0)}</div><div class="lini-isi"><b>Berangkat</b><span>${esc(S.q.lokasi.label)}</span></div></li>
        ${r.urutan.map((u, i) => `
        <li class="lini-jalan"><span>${ik("car-front")} ${mnt(u.tempuh)}${u.jarak != null ? " · " + km(u.jarak) : ""}</span></li>
        <li class="lini-stop" data-id="${u.alt.p.id}">
          <div class="lini-jam">${jamTxt(u.mulai)}</div>
          <div class="lini-isi">
            <div class="lini-no">${i + 1}</div>
            <b>${esc(u.alt.p.nama)}</b>
            <span>${IKON_KAT[u.alt.p.kategori]} ${esc(u.alt.p.kategori)} · ${rp(u.biaya)}${u.alt.p.makan != null ? " (termasuk makan)" : ""}</span>
            <span class="redup">Berkunjung sampai ${jamTxt(u.selesai)}${u.tunggu > 0.5 ? ` · tiba ${jamTxt(u.tiba)}, menunggu buka` : ""}</span>
          </div>
        </li>`).join("")}
        ${r.pulang ? `<li class="lini-jalan"><span>${ik("car-front")} ${mnt(r.pulang.tempuh)}${r.pulang.jarak != null ? " · " + km(r.pulang.jarak) : ""}</span></li>` : ""}
        <li class="titik-awal"><div class="lini-jam">${jamTxt(r.jamSelesai)}</div><div class="lini-isi"><b>Tiba kembali</b><span>${esc(S.q.lokasi.label)}</span></div></li>
      </ol>
      <p class="catatan">${ik("info-circle")}<span>Biaya mencakup tiket/paket dan estimasi makan di setiap destinasi (apabila datanya tersedia), belum termasuk bahan bakar dan parkir. Seluruh waktu merupakan perkiraan.</span></p>
      ${r.model ? `<details class="petunjuk-wadah"><summary>Petunjuk arah langkah demi langkah</summary><ul class="petunjuk">${daftarPetunjuk(r.model)}</ul></details>` : ""}`;
    $$("#sub-rute .lini-stop").forEach(li => (li.onclick = () => fokus(li.dataset.id)));
    $$(".petunjuk li[data-lat]").forEach(li => li.addEventListener("click", () => map.setView([+li.dataset.lat, +li.dataset.lon], 17)));
  }

  /** Tautan Google Maps: titik berangkat → destinasi (berurutan) → kembali ke titik berangkat. */
  function urlGoogleMaps(r) {
    const ll = p => `${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}`;
    const stops = r.urutan.map(u => u.alt.p);
    const awal = S.q.lokasi;
    const tujuan = r.pulang ? awal : stops[stops.length - 1];
    const singgah = r.pulang ? stops : stops.slice(0, -1);
    const prm = new URLSearchParams({ api: "1", origin: ll(awal), destination: ll(tujuan), travelmode: "driving" });
    if (singgah.length) prm.set("waypoints", singgah.map(ll).join("|"));
    return "https://www.google.com/maps/dir/?" + prm.toString();
  }

  function daftarPetunjuk(model) {
    let html = "", leg = -1;
    model.langkah.forEach(l => {
      if (l.leg !== leg) { leg = l.leg; html += `<li class="kepala-leg">Menuju ${esc(model.stops[leg].nama)}</li>`; }
      html += `<li data-lat="${l.lokasi[0]}" data-lon="${l.lokasi[1]}"><span class="ik">${l.ikon}</span><span>${esc(l.teks)}</span><span class="jr">${l.jarak > 0 ? Navigasi.fmtJarak(l.jarak) : ""}</span></li>`;
    });
    return html;
  }

  /* ================= Panduan 5 pertanyaan (Matriks AHP & SAW.xlsx, lembar Kriteria) ================= */
  const JUDUL = ["Lokasi", "Wisata", "Waktu", "Anggaran", "Rating"];
  const RINGKAS = 5;
  let langkah = 0, petaMini = null, penandaMini = null, modeLokasi = null, galat = "";

  function bukaWizard(i) { langkah = i || 0; galat = ""; $("#wizard").hidden = false; renderWizard(); }
  function tutupWizard() { $("#wizard").hidden = true; }
  $("#wizTutup").onclick = tutupWizard;
  $("#btnUbah").onclick = () => bukaWizard(S.q.lokasi ? RINGKAS : 0);
  $("#btnMulai").onclick = () => bukaWizard(0);
  $("#wizKembali").onclick = () => { if (langkah > 0) { langkah--; galat = ""; renderWizard(); } };
  $("#wizLanjut").onclick = () => {
    const g = validasi(langkah);
    if (g) { galat = g; return renderWizard(); }
    galat = "";
    if (langkah < RINGKAS) { langkah++; renderWizard(); }
    else {
      for (let i = 0; i < RINGKAS; i++) { const e = validasi(i); if (e) { langkah = i; galat = e; return renderWizard(); } }
      tutupWizard(); hitung();
    }
  };

  function validasi(i) {
    const q = S.q;
    if (i === 0 && !q.lokasi) return "Pilih lokasi awal perjalanan terlebih dahulu.";
    if (i === 2) {
      if (!q.waktuDipilih) return "Masukkan durasi atau pilih “Tidak dibatasi”.";
      if (q.waktuJam != null && !(q.waktuJam > 0 && q.waktuJam <= 24)) return "Durasi harus antara 0,5 dan 24 jam.";
      if (!/^\d{2}:\d{2}$/.test(q.jam)) return "Isi jam berangkat.";
    }
    if (i === 3) {
      if (!q.anggaranDipilih) return "Masukkan anggaran atau pilih “Tidak dibatasi”.";
      if (q.anggaran != null && !(q.anggaran >= 0)) return "Anggaran tidak boleh negatif.";
    }
    if (i === 4 && !q.ratingDipilih) return "Pilih rating minimum.";
    return "";
  }

  function setLokasi(lat, lon, label) {
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return;
    S.q.lokasi = { lat, lon, label };
    if (petaMini) {
      if (penandaMini) penandaMini.setLatLng([lat, lon]); else penandaMini = L.marker([lat, lon]).addTo(petaMini);
    }
    const el = $("#lokTerpilih");
    if (el) { el.hidden = false; el.innerHTML = `${ik("check-circle-fill")}${esc(label)}`; }
    galat = ""; const g = $("#wizGalat"); if (g) g.textContent = "";
    $("#wizLanjut").disabled = false;
  }

  const kartu = (nilai, ikon, judul, sub, dipilih) =>
    `<button class="opsi${dipilih ? " dipilih" : ""}" data-v="${esc(nilai)}">${ikon ? `<span class="opsi-ikon">${ikon.startsWith("<") ? ikon : ik(ikon)}</span>` : ""}<span><b>${esc(judul)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
  const pasang = fn => $$("#wizIsi .opsi").forEach(b => (b.onclick = () => { fn(b.dataset.v); galat = ""; renderWizard(); }));

  function renderWizard() {
    const q = S.q, isi = $("#wizIsi");
    $("#wizard").style.setProperty("--langkah", langkah);   // posisi matahari pada panorama
    $("#wizBar").innerHTML = JUDUL.map((j, i) => `<span class="${i < langkah ? "selesai" : i === langkah ? "kini" : ""}">${j}</span>`).join("");
    $("#wizLangkah").textContent = langkah < RINGKAS ? `${langkah + 1} / ${RINGKAS}` : "Ringkasan";
    $("#wizKembali").style.visibility = langkah === 0 ? "hidden" : "visible";
    $("#wizLanjut").innerHTML = langkah === RINGKAS ? `${ik("check2-circle")} Tampilkan Rekomendasi` : `Lanjut ${ik("arrow-right")}`;
    if (petaMini) { petaMini.remove(); petaMini = null; penandaMini = null; }
    const G = `<p class="galat" id="wizGalat">${esc(galat)}</p>`;

    if (langkah === 0) {
      isi.innerHTML = `<h2>Dari mana Anda akan memulai perjalanan?</h2>
        <div class="pilihan pilihan-3">
          ${kartu("gps", "crosshair", "Gunakan Lokasi Saya", "", modeLokasi === "gps")}
          ${kartu("peta", "map", "Pilih pada Peta", "", modeLokasi === "peta")}
          ${kartu("cari", "search", "Masukkan Lokasi", "", modeLokasi === "cari")}
        </div>
        <div id="panelLokasi"></div>
        <div class="lokasi-terpilih" id="lokTerpilih" ${q.lokasi ? "" : "hidden"}>${ik("check-circle-fill")}${esc(q.lokasi ? q.lokasi.label : "")}</div>${G}`;
      const panel = $("#panelLokasi");
      if (modeLokasi === "peta") {
        panel.innerHTML = `<p class="petunjuk-kecil">Ketuk peta pada titik awal perjalanan Anda.</p><div id="petaMini"></div>`;
        setTimeout(() => {
          petaMini = L.map("petaMini").setView(q.lokasi ? [q.lokasi.lat, q.lokasi.lon] : [-7.75, 110.25], q.lokasi ? 13 : 10);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: ATR_OSM }).addTo(petaMini);
          L.geoJSON(window.KAPANEWON, { style: { color: "#0d3b36", weight: 1.5, fillOpacity: 0.05 }, interactive: false }).addTo(petaMini);
          if (q.lokasi) penandaMini = L.marker([q.lokasi.lat, q.lokasi.lon]).addTo(petaMini);
          petaMini.on("click", e => setLokasi(e.latlng.lat, e.latlng.lng, "Titik yang dipilih di peta"));
        }, 30);
      } else if (modeLokasi === "cari") {
        panel.innerHTML = `<div class="input-group"><input id="cariLok" class="form-control" placeholder="Nama tempat atau alamat, mis. Stasiun Wates" autofocus><button class="btn btn-gelap" id="btnCariLok">${ik("search")}Cari</button></div>
          <ul class="hasil-cari" id="hasilCari" hidden></ul>`;
        const cari = async () => {
          const t = $("#cariLok").value.trim();
          if (!t) return;
          const ul = $("#hasilCari");
          ul.hidden = false; ul.innerHTML = "<li class='redup'>Mencari…</li>";
          try {
            const j = await ambilJSON(`${NOMINATIM}?format=json&limit=5&countrycodes=id&accept-language=id&viewbox=109.9,-7.4,110.7,-8.1&q=${encodeURIComponent(t)}`);
            ul.innerHTML = j.length ? j.map(r => `<li data-lat="${r.lat}" data-lon="${r.lon}"><b>${esc(r.display_name.split(",")[0])}</b><small>${esc(r.display_name.split(",").slice(1, 4).join(","))}</small></li>`).join("")
              : "<li class='redup'>Tidak ditemukan. Coba kata kunci lain.</li>";
            ul.querySelectorAll("li[data-lat]").forEach(li => (li.onclick = () => {
              setLokasi(+li.dataset.lat, +li.dataset.lon, li.querySelector("b").textContent);
              ul.hidden = true;
            }));
          } catch (e) { ul.innerHTML = "<li class='redup'>Pencarian gagal, periksa koneksi internet.</li>"; }
        };
        $("#btnCariLok").onclick = cari;
        $("#cariLok").onkeydown = e => { if (e.key === "Enter") cari(); };
      }
      pasangLokasi();
    } else if (langkah === 1) {
      isi.innerHTML = `<h2>Apa jenis wisata yang ingin Anda kunjungi?</h2>
        <p class="petunjuk-kecil">Boleh pilih lebih dari satu.</p>
        <div class="pilihan">${KATEGORI.map(k => kartu(k, IKON_KAT[k], k, W.filter(p => p.kategori === k).length + " tempat", q.kategori.includes(k))).join("")}
        ${kartu("", "grid", "Bebas", "Semua jenis", !q.kategori.length)}</div>${G}`;
      pasang(v => {
        if (!v) q.kategori = [];
        else q.kategori = q.kategori.includes(v) ? q.kategori.filter(x => x !== v) : [...q.kategori, v];
      });
    } else if (langkah === 2) {
      const pil = [2, 4, 6, 8];
      isi.innerHTML = `<h2>Berapa lama waktu yang Anda sediakan untuk perjalanan dan kunjungan?</h2>
        <div class="pilihan pilihan-5">${pil.map(j => kartu(j, "", j + " jam", "", q.waktuDipilih && q.waktuJam === j)).join("")}
          ${kartu("x", "", "Tidak dibatasi", "", q.waktuDipilih && q.waktuJam == null)}</div>
        <label class="label-input">Masukkan durasi (jam)
          <input type="number" min="0.5" max="24" step="0.5" id="inWaktu" class="form-control" value="${q.waktuJam != null && !pil.includes(q.waktuJam) ? q.waktuJam : ""}" placeholder="mis. 5"></label>
        <div class="berangkat">
          <span>${ik("calendar3")} Berangkat</span>
          <select id="inHari" class="form-select">${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}" ${i === q.hari ? "selected" : ""}>${NAMA_HARI[i]}</option>`).join("")}</select>
          <input type="time" id="inJam" class="form-control" value="${q.jam}">
        </div>${G}`;
      pasang(v => { q.waktuJam = v === "x" ? null : +v; q.waktuDipilih = true; });
      $("#inWaktu").oninput = e => {
        const v = parseFloat(e.target.value);
        q.waktuJam = v > 0 ? v : null; q.waktuDipilih = v > 0;
        $$("#wizIsi .opsi").forEach(o => o.classList.toggle("dipilih", +o.dataset.v === v));
      };
      $("#inHari").onchange = e => (q.hari = +e.target.value);
      $("#inJam").onchange = e => (q.jam = e.target.value);
    } else if (langkah === 3) {
      const pil = [[0, "Gratis saja"], [25000, "Rp25.000"], [50000, "Rp50.000"], [100000, "Rp100.000"]];
      isi.innerHTML = `<h2>Berapa anggaran maksimum yang ingin Anda keluarkan per orang?</h2>
        <p class="petunjuk-kecil">Untuk tiket masuk dan makan selama perjalanan.</p>
        <div class="pilihan pilihan-5">${pil.map(([v, t]) => kartu(v, "", t, "", q.anggaranDipilih && q.anggaran === v)).join("")}
          ${kartu("x", "", "Tidak dibatasi", "", q.anggaranDipilih && q.anggaran == null)}</div>
        <label class="label-input">Masukkan anggaran tiket masuk dan makan (Rp/orang)
          <input type="number" min="0" step="5000" id="inAng" class="form-control" value="${q.anggaran != null && !pil.some(p => p[0] === q.anggaran) ? q.anggaran : ""}" placeholder="mis. 75000"></label>${G}`;
      pasang(v => { q.anggaran = v === "x" ? null : +v; q.anggaranDipilih = true; });
      $("#inAng").oninput = e => {
        const v = e.target.value === "" ? NaN : Number(e.target.value);
        q.anggaran = v >= 0 ? v : null; q.anggaranDipilih = v >= 0;
        $$("#wizIsi .opsi").forEach(o => o.classList.toggle("dipilih", o.dataset.v !== "x" && +o.dataset.v === v));
      };
    } else if (langkah === 4) {
      isi.innerHTML = `<h2>Berapa rating minimum destinasi yang Anda inginkan?</h2>
        <div class="pilihan pilihan-rating">${[3.0, 3.5, 4.0, 4.5].map(r => kartu(r, "star-fill", r.toFixed(1).replace(".", ","), "ke atas", q.ratingDipilih && q.ratingMin === r)).join("")}
        ${kartu("x", "infinity", "Semua", "tidak dibatasi", q.ratingDipilih && q.ratingMin == null)}</div>${G}`;
      pasang(v => { q.ratingMin = v === "x" ? null : +v; q.ratingDipilih = true; });
    } else {
      const baris = [["geo-alt", "Lokasi awal", T.lokasi()], ["tag", "Jenis wisata", T.kategori()],
        ["clock", "Waktu", `${T.waktu()} · berangkat ${T.berangkat()}`], ["wallet2", "Anggaran", T.anggaran()], ["star", "Rating minimum", T.rating()]];
      isi.innerHTML = `<h2>Ringkasan Kriteria Perjalanan</h2>
        <p class="petunjuk-kecil">Periksa kembali kriteria berikut sebelum rekomendasi disusun.</p>
        <ul class="ringkasan-jwb">${baris.map(([ikon, k, v], i) => `<li data-ke="${i}"><span class="rj-ikon">${ik(ikon)}</span><div><small>${k}</small>${esc(v)}</div><span class="rj-ubah">Ubah</span></li>`).join("")}</ul>${G}`;
      $$("[data-ke]").forEach(b => (b.onclick = () => { langkah = +b.dataset.ke; galat = ""; renderWizard(); }));
    }
    $("#wizLanjut").disabled = langkah === 0 && !q.lokasi;
  }

  function pasangLokasi() {
    $$("#wizIsi .opsi").forEach(b => (b.onclick = () => {
      modeLokasi = b.dataset.v; galat = "";
      renderWizard();
      if (modeLokasi === "gps") ambilGPS();
    }));
  }
  function ambilGPS() {
    const el = $("#panelLokasi");
    if (!("geolocation" in navigator)) { el.innerHTML = `<p class="galat">Perangkat tidak mendukung GPS. Pilih pada peta atau masukkan lokasi.</p>`; return; }
    el.innerHTML = `<div class="memuat"><span class="spinner-border spinner-border-sm"></span>Mencari lokasi Anda…</div>`;
    navigator.geolocation.getCurrentPosition(
      p => { el.innerHTML = ""; setLokasi(p.coords.latitude, p.coords.longitude, "Lokasi saya saat ini"); },
      () => { el.innerHTML = `<p class="galat">Lokasi tidak dapat diambil. Izinkan akses lokasi, atau pilih pada peta / masukkan lokasi.</p>`; },
      { enableHighAccuracy: true, timeout: 15000 });
  }

  /* ================= Jelajah ================= */
  KATEGORI.forEach(k => $("#fKategori").insertAdjacentHTML("beforeend", `<option>${k}</option>`));
  ["Girimulyo", "Kalibawang", "Samigaluh"].forEach(k => $("#fKapanewon").insertAdjacentHTML("beforeend", `<option>${k}</option>`));
  function renderJelajah() {
    const t = $("#cari").value.toLowerCase().trim(), fk = $("#fKategori").value, fp = $("#fKapanewon").value;
    const hasil = W.filter(p => (!t || p.nama.toLowerCase().includes(t) || p.kalurahan.toLowerCase().includes(t)) &&
      (!fk || p.kategori === fk) && (!fp || p.kapanewon === fp))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.ulasan || 0) - (a.ulasan || 0));
    $("#jumlahJelajah").textContent = `Menampilkan ${hasil.length} dari ${W.length} destinasi`;
    $("#daftarJelajah").innerHTML = hasil.map(p => `<li class="item" data-id="${p.id}">
      <div class="no no-kat" style="background:${WARNA[p.kategori]}">${IKON_KAT[p.kategori]}</div>
      <div class="badan"><h4>${esc(p.nama)}</h4>
        <div class="meta">${esc(p.kategori)} · ${esc(p.kapanewon)}</div>
        <div class="meta">${p.rating != null ? ik("star-fill") + " " + String(p.rating).replace(".", ",") : "Belum ada rating"} · ${rp(p.tiket)}${p.tiket === p.paket && p.tiket !== p.tiket_masuk ? " (paket)" : ""}</div></div></li>`).join("");
    $$("#daftarJelajah .item").forEach(li => (li.onclick = () => fokus(li.dataset.id)));
    W.forEach(p => {
      const tampil = hasil.includes(p);
      if (tampil && !lyrWisata.hasLayer(markers[p.id])) lyrWisata.addLayer(markers[p.id]);
      if (!tampil && lyrWisata.hasLayer(markers[p.id])) lyrWisata.removeLayer(markers[p.id]);
    });
  }
  ["#cari", "#fKategori", "#fKapanewon"].forEach(s => $(s).addEventListener("input", renderJelajah));
  renderJelajah();

  /* ================= Info ================= */
  $("#isiTentang").innerHTML = `
    <div class="panorama info-sampul" aria-hidden="true"><i class="matahari"></i></div>
    <h2>Tentang Wisata Menoreh</h2>
    <p>Teman merencanakan liburan ke Perbukitan Menoreh — Girimulyo, Kalibawang, dan Samigaluh, Kulon Progo. Ada ${W.length} destinasi wisata yang bisa Anda jelajahi.</p>
    <h3>Cara Memakai</h3>
    <div class="langkah-info">
      <div><span>1</span>Jawab lima pertanyaan: dari mana berangkat, jenis wisata, waktu, anggaran, dan rating minimum.</div>
      <div><span>2</span>Lihat destinasi yang cocok beserta urutan kunjungan dan perkiraan jamnya.</div>
      <div><span>3</span>Tekan “Mulai Navigasi” untuk membuka rutenya di Google Maps.</div>
    </div>
    <h3>Bagaimana Destinasi Dipilih?</h3>
    <p class="kecil">Destinasi yang <b>lebih dekat</b> dan <b>lebih hemat</b> diutamakan, lalu yang <b>rating</b>-nya tinggi dan <b>banyak diulas</b> pengunjung lain. Kami hanya menyusun tempat yang buka pada hari Anda berangkat dan muat dalam waktu serta anggaran Anda.</p>
    <h3>Perlu Diketahui</h3>
    <ul class="info-daftar">
      <li>Waktu tempuh adalah perkiraan. Jalan di Menoreh menanjak dan berkelok, jadi sisihkan waktu lebih.</li>
      <li>Harga tiket, jam buka, dan rating bisa berubah sewaktu-waktu.</li>
      <li>Biaya belum termasuk bahan bakar dan parkir.</li>
      <li>Navigasi Google Maps memerlukan koneksi internet.</li>
    </ul>
    <h3>Sentuhan Yogyakarta</h3>
    <div class="catatan-diy"><div class="panorama tugu" aria-hidden="true"></div><span><b>Tugu Yogyakarta</b><br>Penanda kota yang berada pada satu garis dengan Keraton dan Gunung Merapi.</span></div>
    <div class="catatan-diy"><div class="panorama bukit" aria-hidden="true"><i class="matahari"></i></div><span><b>Joglo di Menoreh</b><br>Rumah tradisional Jawa dan matahari terbit di perbukitan.</span></div>
    <div class="catatan-diy"><div class="plang" aria-hidden="true"><b>Menoreh</b><span lang="jv-Java">ꦩꦼꦤꦺꦴꦫꦺꦃ</span></div><span><b>Plang aksara Jawa</b><br>Mengikuti papan nama jalan di Yogyakarta.</span></div>
    <p class="kecil redup mt-3">Data peta © kontributor OpenStreetMap · Batas wilayah: RBI, Badan Informasi Geospasial.</p>
    <p class="kecil redup">Kelompok 21 PRGG · Teknik Geodesi Universitas Gadjah Mada · 2026</p>`;

  /* ================= Mulai ================= */
  if (new URLSearchParams(location.search).has("tanpa-panduan")) {
    Object.assign(S.q, { lokasi: { lat: -7.7829, lon: 110.3671, label: "Tugu Yogyakarta" }, waktuJam: 8, waktuDipilih: true,
      anggaranDipilih: true, ratingMin: 4.0, ratingDipilih: true, jam: "08:00" });
    hitung();
  } else {
    bukaWizard(0);
  }
})();
