# -*- coding: utf-8 -*-
"""
Pipeline data WebGIS Wisata Menoreh — hanya memakai folder "01 DATA" dan "02 PENGOLAHAN".

Sumber:
  01 DATA\\02 WISATA\\Database Potensi Wisata.csv                          -> destinasi (72)
  01 DATA\\01 BATAS ADMINISTRASI\\<NN KAPANEWON>\\ADM_KEC_*.shp, ADM_KAL_*.shp -> batas wilayah (RBI)
  02 PENGOLAHAN\\02 WEBSITE\\01 DATA\\01 TABULAR\\Matriks AHP & SAW.xlsx (lembar AHP)  -> bobot AHP 4 kriteria & CR
  02 PENGOLAHAN\\02 WEBSITE\\01 DATA\\01 TABULAR\\OSRM_MATRIKS_WAKTU.csv, OSRM_MATRIKS_JARAK.csv -> matriks antar-destinasi

Keluaran: data\\data.js (window.WISATA, KAPANEWON, KALURAHAN, MATRIKS, BOBOT_DEFAULT)

Jalankan dari folder website:
  "C:\\Program Files\\QGIS 3.44.15\\bin\\python-qgis-ltr.bat" pipeline\\build_data.py
"""
import csv
import json
import os

import openpyxl

try:
    from osgeo import ogr, osr
    ogr.UseExceptions(); osr.UseExceptions()
except ImportError:
    ogr = None

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
INDUK = os.path.dirname(WEB)                      # 02 PENGOLAHAN\02 WEBSITE
PRGG = os.path.dirname(os.path.dirname(INDUK))

SRC_WISATA = os.path.join(PRGG, "01 DATA", "02 WISATA", "Database Potensi Wisata.csv")
SRC_BATAS = os.path.join(PRGG, "01 DATA", "01 BATAS ADMINISTRASI")
TABULAR = os.path.join(INDUK, "01 DATA", "01 TABULAR")
SRC_AHP = os.path.join(TABULAR, "Matriks AHP & SAW.xlsx")
SRC_WAKTU = os.path.join(TABULAR, "OSRM_MATRIKS_WAKTU.csv")
SRC_JARAK = os.path.join(TABULAR, "OSRM_MATRIKS_JARAK.csv")
OUT = os.path.join(WEB, "data")

KAPANEWON = ["Girimulyo", "Kalibawang", "Samigaluh"]
FOLDER_BATAS = {"Girimulyo": "01 GIRIMULYO", "Kalibawang": "02 KALIBAWANG", "Samigaluh": "03 SAMIGALUH"}
KATEGORI = ["Wisata Alam", "Wisata Alam-Buatan", "Religi dan Budaya", "Agrowisata", "Akomodasi dan Rekreasi"]
HARI = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]
# Lama kunjungan per kategori (menit) — asumsi awal, ditandai "perkiraan"
DURASI_KATEGORI = {"Wisata Alam": 90, "Wisata Alam-Buatan": 60, "Religi dan Budaya": 45,
                   "Agrowisata": 60, "Akomodasi dan Rekreasi": 90}


def angka(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def jam(v):
    if v is None or str(v).strip() == "":
        return None
    p = str(v).strip().split(":")
    try:
        return f"{int(p[0]):02d}:{int(p[1]) if len(p) > 1 else 0:02d}"
    except ValueError:
        return None


def bool01(v):
    s = str(v).strip() if v is not None else ""
    if s == "":
        return None
    return s in ("1", "1.0", "true", "True")


def makan_estimasi(mn, mx):
    """Dua nilai -> rata-rata; satu nilai -> nilai itu; kosong -> None."""
    if mn is not None and mx is not None:
        return ((mn + mx) / 2, "rata-rata") if mn <= mx else (None, "konflik")
    if mn is not None:
        return mn, "satu nilai"
    if mx is not None:
        return mx, "satu nilai"
    return None, None


def baca_wisata():
    with open(SRC_WISATA, encoding="utf-8-sig", errors="replace") as fh:
        rows = list(csv.DictReader(fh))
    feats, ids = [], set()
    for d in rows:
        i = (d.get("id_wisata") or "").strip()
        if not i:
            continue
        if i in ids:
            raise SystemExit(f"ID ganda: {i}")
        ids.add(i)
        lat, lon = angka(d["latitude"]), angka(d["longitude"])
        if lat is None or lon is None:
            print("  ! koordinat tidak valid:", i); continue
        kat = " ".join(d["kategori"].split())
        if kat not in KATEGORI:
            print("  ! kategori di luar kamus:", i, kat)
        rating = angka(d.get("rating"))
        if rating is not None and not (1 <= rating <= 5):
            rating = None
        ul = angka(d.get("jumlah_ulasan"))
        tiket = angka(d.get("harga_masuk_asli_rp"))
        mn, mx = angka(d.get("makan_min_rp")), angka(d.get("makan_max_rp"))
        makan, makan_src = makan_estimasi(mn, mx)
        p = {
            "id": i,
            "nama": " ".join(d["nama_wisata"].split()),
            "kapanewon": d["kapanewon"].strip(),
            "kalurahan": d["kalurahan"].strip(),
            "kategori": kat,
            "deskripsi": " ".join((d.get("deskripsi") or "").split()),
            "rating": rating,
            "ulasan": int(ul) if ul is not None and ul >= 0 else None,
            "tiket": tiket, "tiket_masuk": tiket,
            "paket": angka(d.get("harga_paket_rp")),
            "makan_min": mn, "makan_max": mx,
            "makan": makan, "makan_sumber": makan_src,
            "jam_buka": jam(d.get("jam_buka")),
            "jam_tutup": jam(d.get("jam_tutup")),
            "buka24": bool01(d.get("buka_24jam")),
            "hari": {h: bool01(d.get(h)) for h in HARI},
            "durasi": DURASI_KATEGORI.get(kat, 60),
            "gmaps": (d.get("url_google_maps") or "").strip(),
            "lat": round(lat, 7), "lon": round(lon, 7),
        }
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                      "properties": p})
    return {"type": "FeatureCollection", "features": feats}


def baca_bobot():
    """Matriks AHP & SAW.xlsx, lembar AHP: kode A18:A21, bobot H18:H21, CR M21."""
    ws = openpyxl.load_workbook(SRC_AHP, data_only=True)["AHP"]
    kode = [ws.cell(row=18 + i, column=1).value for i in range(4)]
    assert kode == ["C1", "C2", "C3", "C4"], f"Urutan kriteria tak terduga: {kode}"
    w = [float(ws.cell(row=18 + i, column=8).value) for i in range(4)]
    cr = float(ws["M21"].value)
    assert abs(sum(w) - 1) < 1e-6 and cr <= 0.1
    return {"w": w, "CR": cr, "sumber": "AHP 4 kriteria, median 5 ahli (Matriks AHP & SAW.xlsx, lembar AHP)"}


def baca_matriks(path, ids, nama):
    with open(path, encoding="utf-8-sig") as fh:
        baris = [l for l in fh.read().splitlines()[1:] if l.strip()]
    if len(baris) != len(ids):
        raise SystemExit(f"{path}: {len(baris)} baris, diharapkan {len(ids)}")
    M = []
    for k, l in enumerate(baris):
        tok = l.split(";")
        while tok and tok[-1].strip() == "":
            tok.pop()
        label = ";".join(tok[:-len(ids)]).strip()
        if not nama[k].lower().startswith(label.lower()[:15]):
            print(f"  ! baris {k + 1} '{label}' vs {ids[k]} '{nama[k]}'")
        M.append([None if v.strip() == "" else round(float(v.replace(",", ".")), 3) for v in tok[-len(ids):]])
    return M


def baca_batas(prefix):
    if ogr is None:
        print("  ! GDAL tidak tersedia; batas", prefix, "dilewati")
        return {"type": "FeatureCollection", "features": []}
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    feats = []
    for kap in KAPANEWON:
        path = os.path.join(SRC_BATAS, FOLDER_BATAS[kap], f"ADM_{prefix}_{kap.upper()}.shp")
        if not os.path.exists(path):
            raise SystemExit(f"Batas tidak ditemukan: {path}")
        ds = ogr.Open(path); lyr = ds.GetLayer()
        src = lyr.GetSpatialRef(); tr = None
        if src is not None:
            src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            tr = osr.CoordinateTransformation(src, dst)
        kolom = [lyr.GetLayerDefn().GetFieldDefn(i).GetName() for i in range(lyr.GetLayerDefn().GetFieldCount())]
        for f in lyr:
            # Lewati poligon milik kapanewon lain yang ikut terpotong di file kalurahan
            if "WADMKC" in kolom and (f.GetField("WADMKC") or "").strip().lower() != kap.lower():
                print("   dilewati:", prefix, kap, "->", f.GetField("NAMOBJ"), f"({f.GetField('WADMKC')})")
                continue
            g = f.GetGeometryRef().Clone()
            if tr: g.Transform(tr)
            g = g.SimplifyPreserveTopology(0.00008)
            gj = json.loads(g.ExportToJson())
            r5 = lambda c: [round(c[0], 5), round(c[1], 5)]
            if gj["type"] == "Polygon":
                gj["coordinates"] = [[r5(c) for c in r] for r in gj["coordinates"]]
            elif gj["type"] == "MultiPolygon":
                gj["coordinates"] = [[[r5(c) for c in r] for r in p] for p in gj["coordinates"]]
            nama = f.GetField("NAMOBJ") if "NAMOBJ" in kolom else None
            feats.append({"type": "Feature", "geometry": gj,
                          "properties": {"kapanewon": kap, "nama": (nama or kap).strip().title()}})
    return {"type": "FeatureCollection", "features": feats}


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Destinasi :", SRC_WISATA)
    wisata = baca_wisata()
    props = [f["properties"] for f in wisata["features"]]
    ids, nama = [p["id"] for p in props], [p["nama"] for p in props]
    print("  ", len(ids), "destinasi")
    print("Bobot AHP :", SRC_AHP)
    bobot = baca_bobot(); print("  ", [round(x, 4) for x in bobot["w"]], "CR", round(bobot["CR"], 4))
    print("Matriks   :", SRC_WAKTU)
    waktu, jarak = baca_matriks(SRC_WAKTU, ids, nama), baca_matriks(SRC_JARAK, ids, nama)
    print("Batas     :", SRC_BATAS)
    kec, kal = baca_batas("KEC"), baca_batas("KAL")
    print("  ", len(kec["features"]), "kapanewon,", len(kal["features"]), "kalurahan")

    js = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("// Dibangun otomatis oleh pipeline/build_data.py — jangan disunting manual.\n")
        fh.write("window.WISATA = " + js(wisata) + ";\n")
        fh.write("window.KAPANEWON = " + js(kec) + ";\n")
        fh.write("window.KALURAHAN = " + js(kal) + ";\n")
        fh.write("window.MATRIKS = " + js({"ids": ids, "waktu_menit": waktu, "jarak_km": jarak}) + ";\n")
        fh.write("window.BOBOT_DEFAULT = " + json.dumps(bobot, ensure_ascii=False) + ";\n")
    print("Selesai ->", os.path.join(OUT, "data.js"))


if __name__ == "__main__":
    main()
