# WebGIS Wisata Menoreh

Rencana wisata untuk Kapanewon Girimulyo, Kalibawang, dan Samigaluh, dibuat untuk wisatawan. Wisatawan menjawab 5 pertanyaan, lalu mendapat rekomendasi destinasi, urutan kunjungan, dan tautan navigasi ke Google Maps.

## Pertanyaan kepada pengguna
Pertanyaan berasal dari `Matriks AHP & SAW.xlsx`, lembar **Kriteria**:
1. Dari mana Anda akan memulai perjalanan? Pilihan: Gunakan Lokasi Saya / Pilih pada Peta / Masukkan Lokasi.
2. Apa jenis wisata yang ingin Anda kunjungi? Pilihan: 5 kategori + Bebas.
3. Berapa lama waktu yang Anda sediakan untuk perjalanan dan kunjungan? Isian durasi (jam) atau Tidak dibatasi, ditambah hari dan jam berangkat.
4. Berapa anggaran maksimum yang ingin Anda keluarkan per orang? Isian Rp/orang atau Tidak dibatasi.
5. Berapa rating minimum destinasi yang Anda inginkan? Pilihan: 3,0 / 3,5 / 4,0 / 4,5 ke atas, atau Tidak dibatasi.

Perjalanan selalu kembali ke titik awal.

## Sumber data (hanya `01 DATA` dan `02 PENGOLAHAN`)
| Data | Lokasi (di dalam `D:\PRGG`) |
|---|---|
| Destinasi (72) | `01 DATA\02 WISATA\Database Potensi Wisata.csv` |
| Batas kapanewon & kalurahan (RBI) | `01 DATA\01 BATAS ADMINISTRASI\<01 GIRIMULYO / 02 KALIBAWANG / 03 SAMIGALUH>\ADM_KEC_*.shp`, `ADM_KAL_*.shp` |
| Bobot AHP 4 kriteria & CR | `02 PENGOLAHAN\02 WEBSITE\01 DATA\01 TABULAR\Matriks AHP & SAW.xlsx` (lembar AHP, H18:H21 dan M21) |
| Matriks waktu antar-destinasi (menit) | `02 PENGOLAHAN\02 WEBSITE\01 DATA\01 TABULAR\OSRM_MATRIKS_WAKTU.csv` |
| Matriks jarak antar-destinasi (km) | `02 PENGOLAHAN\02 WEBSITE\01 DATA\01 TABULAR\OSRM_MATRIKS_JARAK.csv` |

Peringkat dihitung langsung di browser dari jawaban pengguna. `SAW_HASIL_PERHITUNGAN.xlsx` tidak dibaca website; file itu adalah keluaran untuk laporan. Lembar S1–S4 berisi hasil 4 skenario uji dengan rumus yang sama dengan website. Cara memperbaruinya:
1. Buka http://localhost:8765/pipeline/skenario.html, lalu unduh `hasil_web.json`.
2. Tutup Excel-nya, lalu jalankan:
```
"C:\Program Files\QGIS 3.44.15\bin\python-qgis-ltr.bat" pipeline\ekspor_saw.py <lokasi hasil_web.json>
```

Poligon kalurahan di luar tiga kapanewon (Sendangagung/Minggir dan Ngargoretno/Salaman) dilewati.

Bangun ulang `data/data.js` setiap kali salah satu sumber berubah:
```
"C:\Program Files\QGIS 3.44.15\bin\python-qgis-ltr.bat" pipeline\build_data.py
```

## Struktur
```
02 PENGOLAHAN/02 WEBSITE/02 WEBSITE/
├── .claude/launch.json         pengaturan server lokal (tidak perlu diunggah ke GitHub)
├── index.html                  halaman utama
├── README.md
├── assets/
│   ├── css/style.css           tampilan (di atas Bootstrap 5)
│   ├── img/
│   │   ├── logo.svg            logo & favicon
│   │   ├── diy/                ilustrasi bernuansa DIY (dipakai kelas .panorama di style.css)
│   │   │   ├── bukit.svg           Perbukitan Menoreh, boleh diregangkan
│   │   │   └── tengara.svg         joglo & Tugu Yogyakarta
│   │   └── batik/              ornamen lama, tidak lagi dipakai
│   └── js/
│       ├── saw.js              SALINAN UTUH js/saw.js dari repo (jangan disunting; perbarui dengan mengunduh ulang)
│       ├── rekom.js            penyaringan, adaptor ke SAW.sawRank() repo, penyusunan rencana (tanpa DOM, dapat diuji)
│       ├── navigasi.js         teks petunjuk arah bahasa Indonesia (daftar di panel)
│       └── app.js              antarmuka: peta, panduan 5 pertanyaan, hasil, tautan Google Maps
├── data/
│   └── data.js                 dibangun pipeline — jangan disunting manual
├── pipeline/
│   ├── build_data.py           membangun data/data.js
│   ├── skenario.html           menghitung 4 skenario uji dengan logika website (hasil_web.json)
│   └── ekspor_saw.py           hasil_web.json → SAW_HASIL_PERHITUNGAN.xlsx
└── tests/test_core.js          node tests/test_core.js
```
`saw.js` sengaja diletakkan satu folder dengan `rekom.js` karena `rekom.js` memuatnya sebagai `./saw.js` saat uji unit.

## Pustaka tampilan (CDN)
| Pustaka | Versi | Kegunaan |
|---|---|---|
| Bootstrap | 5.3.3 | tata letak, tombol, formulir, tab |
| Bootstrap Icons | 1.11.3 | ikon |
| Gantari, Noto Sans Javanese (Google Fonts) | — | huruf; aksara Jawa pada plang |
| Leaflet | 1.9.4 | peta (utamakan salinan lokal di `assets/vendor/leaflet/`, cadangan CDN) |

Peta dasar: OpenStreetMap standar. Destinasi ditampilkan dengan simbol per kategori (lingkaran berwarna berisi ikon Bootstrap Icons, diatur di `IKON_KAT` dan `WARNA` pada `assets/js/app.js`).

Tata letak: peta penuh layar dengan panel putih melayang (kiri: menu, ringkasan, dan pilihan; kanan: rencana, rekomendasi, dan lainnya). Di layar ≤ 900 px, panel tersusun ke bawah di bawah peta.
Palet: pinus #0D3B36, telaga #14766A, langit #D3ECE7, kabut #EEF5F3, putih #FFFFFF, aksen fajar #D9472A dan mentari #FFC24B (token di `:root`, `assets/css/style.css`). Warna ubin OSM dikalemkan dengan filter CSS, sumbernya tetap sama.
Unsur DIY: panorama Menoreh, joglo, Tugu Yogyakarta, dan plang jalan beraksara Jawa. Pada panduan, matahari naik setiap kali satu pertanyaan terjawab.

## Menjalankan lokal
Jalankan dari folder website ini:
```
"C:\Program Files\QGIS 3.44.15\apps\Python312\python.exe" -m http.server 8765
```
Buka http://localhost:8765. Untuk cadangan demo, gunakan `?tanpa-panduan` (berangkat dari Tugu Yogyakarta, 8 jam).

## SAW — rumus mengikuti repo
SAW memakai file `assets/js/saw.js` (asal: `js/saw.js` di repo [kharismaaw/webgis-wisata-kulonprogo](https://github.com/kharismaaw/webgis-wisata-kulonprogo)). File itu disalin **tanpa perubahan**, lalu `rekom.js` memanggil `SAW.sawRank()`. Untuk memperbarui dari GitHub:
```
powershell -Command "Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/kharismaaw/webgis-wisata-kulonprogo/main/js/saw.js -OutFile assets\js\saw.js"
```
Kriteria dan rumus di dalam `saw.js`:

| Kode | Kriteria | Sifat | Bobot | Nilai x |
|---|---|---|---|---|
| C1 | Waktu tempuh | cost | 0,4187 | menit dari titik awal ke destinasi (satu arah, OSRM) |
| C2 | Biaya kunjungan | cost | 0,3521 | tiket masuk + estimasi makan (Rp/orang) |
| C3 | Rating destinasi | benefit | 0,1245 | rating 1–5 |
| C4 | Jumlah ulasan | benefit | 0,1047 | jumlah ulasan |

- **Cost:** r = min/x; jika x = 0 (gratis), r = 1.
- **Benefit:** r = x/max.
- **Nilai preferensi:** V = Σ w·r, diurutkan dari yang terbesar.
- **Catatan:** jika ada destinasi gratis di antara kandidat, min C2 = 0, sehingga semua destinasi berbayar mendapat r2 = 0. Ini perilaku rumus repo.

## Aturan lain (versi lokal)
- **Penyaringan:** jenis wisata, rating minimum, biaya ≤ anggaran, hari & jam buka diketahui dan buka, serta kunjungan tunggal (pergi + kunjungan + pulang) muat dalam waktu tersedia. Destinasi tanpa rating atau jumlah ulasan tidak diperingkat. Alasannya ditampilkan di tab "Destinasi Lain".
- **Waktu dari/ke titik berangkat:** OSRM langsung, dua arah. Waktu antar-destinasi diambil dari matriks di `02 PENGOLAHAN\02 WEBSITE\01 DATA\01 TABULAR`.
- **Lama kunjungan:** per kategori (Alam 90, Alam-Buatan 60, Religi 45, Agro 60, Akomodasi 90 menit), ditandai sebagai perkiraan.
- **Makan:** rata-rata `makan_min` dan `makan_max`; jika hanya satu terisi, dipakai nilai itu; jika kosong, dihitung 0. Anggaran dibandingkan dengan Σ biaya seluruh tempat.
- **Rencana:**
  1. Ambil 10 teratas SAW.
  2. Coba semua kombinasi 3 tempat (120) dan semua urutannya (6 per kombinasi).
  3. Pilih kombinasi dengan Σ V terbesar yang muat dalam waktu, anggaran, dan jam buka. Bila skornya sama, pilih yang tercepat.
  4. Bila tidak ada yang muat, ulangi untuk 2 tempat, lalu 1 tempat.
  - Parameternya `PARAM.jumlahStop` dan `PARAM.kandidatPool` di `assets/js/rekom.js`.
- **Navigasi:** tombol "Mulai Navigasi" membuka Google Maps dari titik berangkat ke destinasi sesuai urutan, lalu kembali.

## Keputusan yang masih perlu ditetapkan tim
- **Faktor koreksi waktu tempuh:** `PARAM.koreksiWaktu`, menunggu hasil kalibrasi lapangan.
