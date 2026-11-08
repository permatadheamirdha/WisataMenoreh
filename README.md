# WebGIS Wisata Menoreh

Rencana wisata untuk Kapanewon Girimulyo, Kalibawang, dan Samigaluh, dibuat untuk wisatawan. Wisatawan menjawab 5 pertanyaan, lalu mendapat rekomendasi destinasi, urutan kunjungan, dan tautan navigasi ke Google Maps.

## Pertanyaan kepada pengguna
Pertanyaan diambil dari `data/sumber/Matriks AHP & SAW.xlsx`, lembar **Kriteria**:
1. Dari mana Anda akan memulai perjalanan? Pilihan: Gunakan Lokasi Saya / Pilih pada Peta / Masukkan Lokasi.
2. Apa jenis wisata yang ingin Anda kunjungi? Pilihan: 5 kategori + Bebas.
3. Berapa lama waktu yang Anda sediakan untuk perjalanan dan kunjungan? Isian durasi (jam) atau Tidak dibatasi, ditambah hari dan jam berangkat.
4. Berapa anggaran maksimum yang ingin Anda keluarkan per orang? Isian Rp/orang atau Tidak dibatasi.
5. Berapa rating minimum destinasi yang Anda inginkan? Pilihan: 3,0 / 3,5 / 4,0 / 4,5 ke atas, atau Tidak dibatasi.

Perjalanan selalu kembali ke titik awal.

## Sumber data (folder proyek)
| Data | Lokasi |
|---|---|
| Destinasi (72) | `D:\PRGG\Data\Potensi Wisata\Database Potensi Wisata.csv` |
| Batas kapanewon & kalurahan (RBI) | `D:\PRGG\Data\Batas Administrasi\<Kapanewon>\KEC_*.shp`, `KAL_*.shp` |
| Bobot AHP 4 kriteria | `D:\PRGG\Pengolahan\Website\data\sumber\Matriks AHP & SAW.xlsx` (lembar AHP, H18:H21) |
| Matriks waktu/jarak antar-destinasi | `D:\PRGG\Pengolahan\OSRM\MATRIKS_WAKTU.csv` (menit), `MATRIKS_JARAK.csv` (km) |

Bangun ulang `data/data.js` setiap kali salah satu sumber berubah:
```
"C:\Program Files\QGIS 3.44.15\bin\python-qgis-ltr.bat" pipeline\build_data.py
```

## Struktur
```
Website/
├── index.html                  halaman utama
├── README.md
├── assets/
│   ├── css/style.css           tampilan (di atas Bootstrap 5)
│   ├── img/
│   │   ├── logo.svg            logo & favicon
│   │   └── batik/              ornamen batik Yogyakarta (digambar ulang, SVG berulang)
│   │       ├── kawung.svg          Kawung berwarna (sogan-krem): sampul kartu, tab Info
│   │       ├── kawung-halus.svg    Kawung garis tipis: tekstur latar panduan
│   │       └── parang.svg          Parang: pinggiran kartu & panduan
│   └── js/
│       ├── saw.js              SALINAN UTUH js/saw.js dari repo (jangan disunting; perbarui dengan mengunduh ulang)
│       ├── rekom.js            penyaringan, adaptor ke SAW.sawRank() repo, penyusunan rencana (tanpa DOM, dapat diuji)
│       ├── navigasi.js         teks petunjuk arah bahasa Indonesia (daftar di panel)
│       └── app.js              antarmuka: peta, panduan 5 pertanyaan, hasil, tautan Google Maps
├── data/
│   ├── data.js                 dibangun pipeline — jangan disunting manual
│   └── sumber/                 data sumber (jangan disunting)
│       ├── Database Potensi Wisata.xlsx
│       └── Matriks AHP & SAW.xlsx
├── pipeline/
│   ├── build_data.py           membangun data/data.js
│   └── ekspor_saw.py           ekspor hasil perhitungan ke Excel
└── tests/test_core.js          node tests/test_core.js
```
`saw.js` sengaja diletakkan satu folder dengan `rekom.js` karena `rekom.js` memuatnya sebagai `./saw.js` saat uji unit.

## Pustaka tampilan (CDN)
| Pustaka | Versi | Kegunaan |
|---|---|---|
| Bootstrap | 5.3.3 | tata letak, tombol, formulir, tab |
| Bootstrap Icons | 1.11.3 | ikon |
| Gantari (Google Fonts) | — | huruf |
| Leaflet | 1.9.4 | peta (utamakan salinan lokal di `assets/vendor/leaflet/`, cadangan CDN) |

Peta dasar: OpenStreetMap standar. Destinasi ditampilkan dengan simbol per kategori (lingkaran berwarna berisi ikon Bootstrap Icons, diatur di `IKON_KAT` dan `WARNA` pada `assets/js/app.js`).

Tata letak: peta penuh layar dengan panel kaca melayang (kiri: menu, ringkasan, dan pilihan; kanan: rencana, rekomendasi, dan lainnya). Di layar ≤ 900 px, panel tersusun ke bawah di bawah peta.
Palet: #424242, #D5DEE3, #93B1C2, #FFFFFF, dengan aksen batik sogan #7A4A26, krem #F3EADB, dan nila #2F3B52 (token di `:root`, `assets/css/style.css`).

## Menjalankan lokal
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
- **Waktu dari/ke titik berangkat:** OSRM langsung, dua arah. Waktu antar-destinasi diambil dari matriks di `Pengolahan\OSRM`.
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
