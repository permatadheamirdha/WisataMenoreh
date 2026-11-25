# -*- coding: utf-8 -*-
"""
Ekspor hasil perhitungan SAW 4 kriteria (skenario uji) ke Excel berumus.
Masukan : data/data.js (atribut destinasi & bobot) + JSON hasil logika web (waktu OSRM, V, peringkat, rencana)
Keluaran: 02 PENGOLAHAN\\02 WEBSITE\\01 DATA\\01 TABULAR\\SAW_HASIL_PERHITUNGAN.xlsx (atau argumen ke-2)
Pemakaian:
  1. buka http://localhost:8765/pipeline/skenario.html lalu unduh hasil_web.json
  2. python ekspor_saw.py <hasil_web.json> [keluaran.xlsx]
"""
import json
import os
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(WEB), "01 DATA", "01 TABULAR", "SAW_HASIL_PERHITUNGAN.xlsx")

teks = open(os.path.join(WEB, "data", "data.js"), encoding="utf-8").read()
def ambil(nama):
    a = teks.index(f"window.{nama} = ") + len(f"window.{nama} = ")
    return json.loads(teks[a:teks.index(";\n", a)])
P = {f["properties"]["id"]: f["properties"] for f in ambil("WISATA")["features"]}
B = ambil("BOBOT_DEFAULT")
BOBOT, CR = B["w"], B.get("CR")
HASIL = json.load(open(SRC, encoding="utf-8"))

# ---------- gaya ----------
F = "Arial"
f_judul = Font(name=F, size=14, bold=True, color="1D6B4F")
f_sub = Font(name=F, size=11, bold=True, color="1D6B4F")
f_head = Font(name=F, size=10, bold=True, color="FFFFFF")
f_isi = Font(name=F, size=10)
f_input = Font(name=F, size=10, color="0000FF")
f_link = Font(name=F, size=10, color="008000")
f_redup = Font(name=F, size=9, italic=True, color="666666")
f_tebal = Font(name=F, size=10, bold=True)
fill_head = PatternFill("solid", fgColor="1D6B4F")
fill_input = PatternFill("solid", fgColor="FFF2CC")
fill_rencana = PatternFill("solid", fgColor="E8F3EE")
tipis = Side(style="thin", color="D0D7D3")
kotak = Border(left=tipis, right=tipis, top=tipis, bottom=tipis)
tengah = Alignment(horizontal="center", vertical="center", wrap_text=True)

def tulis(ws, r, c, v, font=f_isi, fmt=None, fill=None, border=True, align=None):
    cell = ws.cell(row=r, column=c, value=v)
    cell.font = font
    if fmt: cell.number_format = fmt
    if fill: cell.fill = fill
    if border: cell.border = kotak
    if align: cell.alignment = align
    return cell

def header(ws, r, cols, c0=1):
    for i, h in enumerate(cols):
        tulis(ws, r, c0 + i, h, f_head, fill=fill_head, align=tengah)
    ws.row_dimensions[r].height = 42

def teks_baris(ws, r, t, font=f_isi):
    ws.cell(row=r, column=1, value=t).font = font

wb = Workbook()

# ================= Keterangan =================
K = wb.active
K.title = "Keterangan"
K["A1"] = "Hasil Perhitungan SAW 4 Kriteria — WebGIS Wisata Menoreh"; K["A1"].font = f_judul
K["A2"] = "Girimulyo · Kalibawang · Samigaluh — rumus SAW sama dengan website (assets/js/saw.js dan rekom.js)"; K["A2"].font = f_redup
K["A4"] = "Kriteria dan bobot AHP"; K["A4"].font = f_sub
header(K, 5, ["Kode", "Kriteria", "Bobot (w)", "Sifat", "Nilai yang dipakai"])
kriteria = [("C1", "Waktu tempuh", "cost", "Waktu dari titik awal ke destinasi, satu arah (menit, OSRM)"),
            ("C2", "Biaya kunjungan", "cost", "Tiket masuk + estimasi makan (Rp/orang)"),
            ("C3", "Rating destinasi", "benefit", "Rating (skala 1–5)"),
            ("C4", "Jumlah ulasan", "benefit", "Jumlah ulasan (bilangan bulat ≥ 0)")]
for i, (kd, nm, sf, ket) in enumerate(kriteria):
    r = 6 + i
    tulis(K, r, 1, kd, f_tebal); tulis(K, r, 2, nm)
    tulis(K, r, 3, BOBOT[i], f_input, "0.0000", fill_input)
    tulis(K, r, 4, sf); tulis(K, r, 5, ket)
K["C6"].comment = Comment(f"Sumber: Matriks AHP & SAW.xlsx, lembar AHP, H18:H21 (median penilaian 5 ahli, CR = {CR:.4f}). Ubah sel kuning untuk mencoba bobot lain; semua lembar skenario ikut dihitung ulang.", "Tim")
tulis(K, 10, 2, "Jumlah bobot", f_tebal); tulis(K, 10, 3, "=SUM(C6:C9)", f_tebal, "0.0000")
tulis(K, 11, 2, "CR (konsistensi)", f_tebal); tulis(K, 11, 3, CR, f_input, "0.0000")

K["G4"] = "Pemeriksaan terhadap website"; K["G4"].font = f_sub
header(K, 5, ["Skenario", "Selisih V maks.", "Peringkat beda"], 7)
for i, s in enumerate(HASIL["skenario"]):
    a, z = 13, 12 + len(s["K"]); k = s["kode"]
    tulis(K, 6 + i, 7, k, f_tebal)
    tulis(K, 6 + i, 8, f"=MAX('{k}'!V{a}:V{z})", f_link, "0.0E+00")
    tulis(K, 6 + i, 9, f"=SUMPRODUCT(--('{k}'!S{a}:S{z}<>'{k}'!T{a}:T{z}))", f_link, "0")

K["A13"] = "Rumus"; K["A13"].font = f_sub
rumus = [
    "Normalisasi cost (C1, C2):     r = min / x;  bila x = 0 (gratis) maka r = 1.",
    "Normalisasi benefit (C3, C4):  r = x / max;  bila max = 0 maka r = 0.",
    "Catatan: bila ada destinasi gratis, min C2 = 0 sehingga semua destinasi berbayar mendapat r2 = 0 (sifat rumus min/x).",
    "Nilai preferensi:              V = w1·r1 + w2·r2 + w3·r3 + w4·r4   (urut menurun = peringkat).",
    "Min dan max dihitung hanya dari destinasi yang LOLOS penyaringan pada skenario tersebut.",
    "Nilai V yang sama: urutan mengikuti urutan data destinasi (kolom Peringkat web).",
    "Rencana: dari 10 teratas, coba semua kombinasi 3 tempat × semua urutan; pilih Σ V terbesar yang muat (waktu, anggaran, jam buka), seri → waktu tersingkat; bila tak ada, 2 lalu 1 tempat.",
]
for i, t in enumerate(rumus):
    teks_baris(K, 14 + i, t)
K["A21"] = "Penyaringan sebelum SAW"; K["A21"].font = f_sub
saring = [
    "Jenis wisata sesuai pilihan; rating (1–5) dan jumlah ulasan tersedia; rating ≥ rating minimum; tiket diketahui; C2 ≤ anggaran.",
    "Hari & jam buka diketahui dan buka pada hari kunjungan; kunjungan selesai sebelum tutup.",
    "Pergi + lama kunjungan + pulang ≤ waktu yang disediakan (jika dibatasi).",
    "Estimasi makan: rata-rata makan_min & makan_max; satu nilai bila hanya satu terisi; kosong = belum diketahui (dihitung 0, ditandai).",
    "Lama kunjungan (asumsi per kategori): Alam 90, Alam-Buatan 60, Religi 45, Agro 60, Akomodasi 90 menit.",
]
for i, t in enumerate(saring):
    teks_baris(K, 22 + i, t)
K["A28"] = "Skenario uji"; K["A28"].font = f_sub
header(K, 29, ["Kode", "Titik awal", "Jenis wisata", "Waktu (jam)", "Anggaran (Rp/orang)", "Rating min.", "Lolos", "Di rencana"])
for i, s in enumerate(HASIL["skenario"]):
    vals = [s["kode"], s["lokasi"]["label"], ", ".join(s["kategori"]) or "Bebas",
            s["durasiJam"] if s["durasiJam"] is not None else "Tidak dibatasi",
            s["anggaran"] if s["anggaran"] is not None else "Tidak dibatasi",
            s["ratingMin"] if s["ratingMin"] is not None else "Tidak dibatasi", len(s["K"]), len(s["R"])]
    for j, v in enumerate(vals):
        tulis(K, 30 + i, j + 1, v, f_isi, "#,##0" if j == 4 and isinstance(v, int) else None)
teks_baris(K, 35, f"Semua skenario: hari Sabtu, berangkat 08.00, kembali ke titik awal. Waktu tempuh OSRM publik (mobil), {HASIL['waktu'][:10]}; antar-destinasi dari 01 TABULAR\\OSRM_MATRIKS_WAKTU.csv.", f_redup)
teks_baris(K, 36, "Warna: biru/kuning = input yang boleh diubah · hitam = rumus · hijau = rujukan ke lembar lain.", f_redup)
for c, wdt in zip("ABCDEFGHI", [8, 34, 28, 14, 54, 12, 18, 15, 14]):
    K.column_dimensions[c].width = wdt

# ================= Lembar skenario =================
# Kolom: A No, B ID, C Nama, D Kategori, E Kapanewon, F pergi, G pulang, H C1, I tiket, J makan, K C2,
#        L C3, M C4, N r1, O r2, P r3, Q r4, R V, S RANK, T peringkat web, U V web, V selisih
COLS = ["No", "ID", "Nama destinasi", "Kategori", "Kapanewon", "Waktu pergi (menit)", "Waktu pulang (menit)",
        "C1 Waktu tempuh (menit)", "Tiket (Rp)", "Makan estimasi (Rp)", "C2 Biaya (Rp)", "C3 Rating", "C4 Jumlah ulasan",
        "r1 Waktu", "r2 Biaya", "r3 Rating", "r4 Ulasan", "V (nilai preferensi)", "Peringkat (RANK)", "Peringkat web", "V web", "Selisih |V − V web|"]
cek = []
for s in HASIL["skenario"]:
    ws = wb.create_sheet(s["kode"])
    ws["A1"] = f"Skenario {s['kode']} — {s['lokasi']['label']}"; ws["A1"].font = f_judul
    info = [("Titik awal", f"{s['lokasi']['label']} ({s['lokasi']['lat']}, {s['lokasi']['lon']})"),
            ("Jenis wisata", ", ".join(s["kategori"]) or "Bebas"),
            ("Waktu tersedia", f"{s['durasiJam']} jam" if s["durasiJam"] is not None else "Tidak dibatasi"),
            ("Anggaran", f"Rp{s['anggaran']:,.0f}/orang".replace(",", ".") if s["anggaran"] is not None else "Tidak dibatasi"),
            ("Rating minimum", f"{s['ratingMin']} ke atas" if s["ratingMin"] is not None else "Tidak dibatasi"),
            ("Hari / jam berangkat", "Sabtu, 08.00 · kembali ke titik awal")]
    for i, (k, v) in enumerate(info):
        ws.cell(row=2 + i, column=1, value=k).font = f_redup
        ws.cell(row=2 + i, column=3, value=v).font = f_isi

    n = len(s["K"]); r0 = 13; r1 = r0 + n - 1
    for lbl, rr in (("min", 9), ("max", 10)):
        c = ws.cell(row=rr, column=7, value=lbl); c.font = f_tebal; c.alignment = Alignment(horizontal="right")
    for col in "HKLM":
        ci = ord(col) - 64
        tulis(ws, 9, ci, f"=MIN({col}{r0}:{col}{r1})", f_isi, "#,##0.00")
        tulis(ws, 10, ci, f"=MAX({col}{r0}:{col}{r1})", f_isi, "#,##0.00")
    ws["N9"] = "Bobot w →"; ws["N9"].font = f_tebal
    for j, col in enumerate("NOPQ"):
        tulis(ws, 10, ord(col) - 64, f"=Keterangan!$C${6 + j}", f_link, "0.0000")
    ws["N11"] = "(dari lembar Keterangan)"; ws["N11"].font = f_redup

    header(ws, 12, COLS)
    renc = {x[0] for x in s["R"]}
    for i, (wid, t0i, ti0, Vweb, rank) in enumerate(s["K"]):
        r = r0 + i; p = P[wid]; fl = fill_rencana if wid in renc else None
        for j, v in enumerate([i + 1, wid, p["nama"], p["kategori"], p["kapanewon"]]):
            tulis(ws, r, j + 1, v, fill=fl)
        tulis(ws, r, 6, t0i, f_input, "0.00", fl)
        tulis(ws, r, 7, ti0, f_input, "0.00", fl)
        tulis(ws, r, 8, f"=F{r}", f_isi, "0.00", fl)
        tulis(ws, r, 9, p["tiket"], f_input, "#,##0", fl)
        tulis(ws, r, 10, p["makan"], f_input, "#,##0", fl)
        tulis(ws, r, 11, f"=I{r}+N(J{r})", f_isi, "#,##0", fl)
        tulis(ws, r, 12, p["rating"], f_input, "0.0", fl)
        tulis(ws, r, 13, p["ulasan"], f_input, "#,##0", fl)
        tulis(ws, r, 14, f"=IF(H{r}=0,1,$H$9/H{r})", f_isi, "0.000000", fl)
        tulis(ws, r, 15, f"=IF(K{r}=0,1,$K$9/K{r})", f_isi, "0.000000", fl)
        tulis(ws, r, 16, f"=IF($L$10=0,0,L{r}/$L$10)", f_isi, "0.000000", fl)
        tulis(ws, r, 17, f"=IF($M$10=0,0,M{r}/$M$10)", f_isi, "0.000000", fl)
        tulis(ws, r, 18, f"=N{r}*$N$10+O{r}*$O$10+P{r}*$P$10+Q{r}*$Q$10", f_tebal, "0.000000", fl)
        tulis(ws, r, 19, f"=RANK(R{r},$R${r0}:$R${r1},0)", f_isi, "0", fl)
        tulis(ws, r, 20, rank, f_input, "0", fl)
        tulis(ws, r, 21, Vweb, f_input, "0.000000", fl)
        tulis(ws, r, 22, f"=ABS(R{r}-U{r})", f_isi, "0.0E+00", fl)

    # verifikasi Python (meniru rumus Excel)
    C1 = [k[1] for k in s["K"]]
    C2 = [P[k[0]]["tiket"] + (P[k[0]]["makan"] or 0) for k in s["K"]]
    C3 = [P[k[0]]["rating"] for k in s["K"]]
    C4 = [P[k[0]]["ulasan"] for k in s["K"]]
    for i, k in enumerate(s["K"]):
        rr_ = [1 if C1[i] == 0 else min(C1) / C1[i], 1 if C2[i] == 0 else min(C2) / C2[i],
               C3[i] / max(C3) if max(C3) else 0, C4[i] / max(C4) if max(C4) else 0]
        V = sum(w * x for w, x in zip(BOBOT, rr_))
        cek.append(abs(V - k[3]))

    rr = r1 + 2
    tulis(ws, rr, 1, "Baris hijau = destinasi yang masuk rencana perjalanan. Kolom biru = data masukan; kolom hitam = rumus.", f_redup, border=False)
    tulis(ws, rr + 1, 1, "Makan kosong = harga makan belum diketahui (dihitung 0 pada C2). Waktu pulang tidak masuk C1; dipakai untuk penyaringan dan rencana.", f_redup, border=False)

    rr += 3
    ws.cell(row=rr, column=1, value="Rencana perjalanan — kombinasi 3 tempat dari 10 teratas dengan Σ V terbesar, urutan tercepat (metode repo)").font = f_sub
    if s.get("skor") is not None:
        ws.cell(row=rr, column=11, value=f"Σ V rencana = {s['skor']:.6f}").font = f_tebal
    header(ws, rr + 1, ["Urutan", "ID", "Nama destinasi", "Tiba", "Mulai", "Selesai", "Tempuh dari sebelumnya (menit)", "Jarak (km)", "Tiket (Rp)", "Makan (Rp)"])
    for i, (wid, tmp, jr, tiba, mulai, sel, mk) in enumerate(s["R"]):
        r = rr + 2 + i
        for j, v in enumerate([i + 1, wid, P[wid]["nama"], tiba, mulai, sel, round(tmp, 2), round(jr, 2) if jr is not None else None, P[wid]["tiket"], mk]):
            tulis(ws, r, j + 1, v, f_isi, "#,##0" if j in (8, 9) else ("0.00" if j in (6, 7) else None))
    r = rr + 2 + len(s["R"])
    if s["P"]:
        for j, v in enumerate(["Pulang", "", "Kembali ke titik awal", "", "", s["js"], round(s["P"][0], 2), round(s["P"][1], 2), "", ""]):
            tulis(ws, r, j + 1, v, f_isi, "0.00" if j in (6, 7) else None)
        r += 1
    tulis(ws, r, 3, "Total", f_tebal)
    tulis(ws, r, 6, f"{round(s['tm']) // 60} j {round(s['tm']) % 60} mnt", f_tebal)
    for ci, fmt in ((7, "0.00"), (8, "0.00"), (9, "#,##0"), (10, "#,##0")):
        L = get_column_letter(ci)
        tulis(ws, r, ci, f"=SUM({L}{rr + 2}:{L}{r - 1})", f_tebal, fmt)

    rr = r + 2
    ws.cell(row=rr, column=1, value=f"Destinasi tidak lolos penyaringan ({len(s['T'])})").font = f_sub
    header(ws, rr + 1, ["No", "ID", "Nama destinasi", "Kategori", "Alasan"])
    for i, (wid, alasan) in enumerate(s["T"]):
        for j, v in enumerate([i + 1, wid, P[wid]["nama"], P[wid]["kategori"], alasan]):
            tulis(ws, rr + 2 + i, j + 1, v)

    for i, wdt in enumerate([8, 7, 52, 24, 12, 10, 10, 11, 10, 11, 11, 8, 10, 10, 10, 10, 10, 12, 10, 10, 10, 11]):
        ws.column_dimensions[get_column_letter(i + 1)].width = wdt
    ws.freeze_panes = "D13"

# ================= Ringkasan =================
R = wb.create_sheet("Ringkasan", 1)
R["A1"] = "Ringkasan: 10 destinasi teratas per skenario (SAW 4 kriteria)"; R["A1"].font = f_judul
col = 1
for s in HASIL["skenario"]:
    R.cell(row=3, column=col, value=f"{s['kode']} — {s['lokasi']['label']}").font = f_sub
    header(R, 4, ["#", "Nama destinasi", "V"], col)
    renc = {x[0] for x in s["R"]}
    for i in range(min(10, len(s["K"]))):
        fl = fill_rencana if s["K"][i][0] in renc else None
        tulis(R, 5 + i, col, i + 1, fill=fl)
        tulis(R, 5 + i, col + 1, f"='{s['kode']}'!C{13 + i}", f_link, fill=fl)
        tulis(R, 5 + i, col + 2, f"='{s['kode']}'!R{13 + i}", f_link, "0.0000", fl)
    for k, wdt in enumerate([4, 52, 9, 3]):
        R.column_dimensions[get_column_letter(col + k)].width = wdt
    col += 4

R["A16"] = "Baris hijau = masuk rencana perjalanan."; R["A16"].font = f_redup
wb.calculation.fullCalcOnLoad = True
wb.save(OUT)
print("Tersimpan:", OUT)
print(f"Verifikasi rumus vs web: {len(cek)} baris, selisih maksimum V = {max(cek):.2e}")
