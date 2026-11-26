# Satu Hari

Jurnal visual harian yang sengaja dibuat sesederhana mungkin: **satu foto, satu kalimat, selesai**. Tanpa akun, tanpa server, tanpa feed. Semua data tersimpan di perangkatmu.

## Fitur

- **Hari ini** — ambil foto langsung dari kamera atau pilih dari galeri, lalu tulis satu kalimat (maks. 160 karakter).
- **Simpan otomatis** — tidak ada tombol simpan. Tekan Enter di kalimat untuk menutup keyboard.
- **7 hari terakhir** — strip thumbnail untuk melihat ritme menulis.
- **Kalender** — mosaik foto per hari, statistik bulan ini, rangkaian (streak), dan total hari. Tanggal lama bisa dibuka dan diisi.
- **Arsip** — semua catatan, dikelompokkan per bulan, bisa dicari.
- **Bagikan** — membuat kartu gambar 1080×1350 (foto + kalimat + tanggal) untuk dibagikan atau diunduh.
- **Cadangan** — ekspor/impor seluruh data (termasuk foto) sebagai satu file JSON.
- **Tema** — sistem, terang, atau gelap.
- **Kualitas foto** — biasa (hemat ruang, maks 1280 px) atau tinggi (detail tajam, maks 2400 px).
- **PWA offline** — bisa dipasang ke layar utama dan tetap terbuka tanpa internet.

## Menjalankan di Termux

```bash
cd ~/satu-hari
python3 -m http.server 8080 --bind 127.0.0.1
```

Lalu buka **http://127.0.0.1:8080** di Chrome (atau `http://localhost:8080`).

> Pilih satu alamat dan pakai konsisten. `127.0.0.1` dan `localhost` dianggap dua asal berbeda oleh browser, sehingga jurnalnya tidak akan saling terlihat.

Atau pakai skrip:

```bash
./mulai.sh          # port 8080
./mulai.sh 9000     # port lain
```

## Memasang di layar utama (Android)

1. Buka aplikasi di Chrome.
2. Menu ⋮ → **Tambahkan ke Layar Utama** / **Instal aplikasi**.
3. Aplikasi akan terbuka tanpa address bar dan tetap bisa dipakai offline.

> Service worker hanya aktif lewat `http://localhost` atau HTTPS, bukan saat file dibuka langsung dengan `file://`.

## Aplikasi Android (APK)

APK ada di halaman **Releases** repo ini (`Satu-Hari-<versi>.apk`). Berkas web dibundel di dalam APK, jadi aplikasi berjalan penuh tanpa internet dan tanpa izin jaringan.

- Paket: `id.satuhari.app` — minimal Android 6.0 (API 23), target Android 14 (API 34).
- Foto diambil lewat aplikasi kamera bawaan; galeri dan impor cadangan lewat pemilih berkas sistem.
- Ekspor cadangan dan kartu bagikan tersimpan di `Download/Satu Hari/`.

Membangun sendiri di Termux (tanpa Gradle):

```bash
./android/build-termux.sh                       # hasil: android/build/Satu-Hari-1.0.0.apk
VERSION_NAME=1.0.1 VERSION_CODE=2 ./android/build-termux.sh
```

Butuh `openjdk-17` (atau lebih baru), `aapt2`, `apksigner`, dan `dx` dari paket Termux; `android.jar` platform 34 diunduh otomatis ke `~/build/sdk`.

Build otomatis lewat GitHub Actions: `.github/workflows/android.yml` (push ke `main` atau jalankan manual), hasilnya berupa artifact `satuhari-apk`.

> Kunci rilis ada di `android/release.keystore` (alias `satuhari`, kata sandi `satuhari`, sama seperti repo `catatan`). Simpan kunci ini agar versi berikutnya bisa dipasang sebagai pembaruan.

## Privasi & data

- Tidak ada koneksi ke server mana pun. Tidak ada analitik, akun, atau iklan.
- Foto asli disimpan sebagai blob JPEG (sisi terpanjang 1600 px) di IndexedDB, plus thumbnail 720 px untuk tampilan cepat.
- Data terikat pada asal (origin) browser. Kalau membuka lewat port/IP berbeda, data akan terlihat kosong. Selalu gunakan alamat yang sama.
- Lakukan **Pengaturan → Ekspor cadangan** secara berkala. Menghapus data situs di Chrome juga akan menghapus jurnal.

## Struktur

```
satu-hari/
├── index.html          # kerangka UI
├── style.css           # tema terang/gelap, layout, animasi
├── app.js              # IndexedDB, editor, kalender, arsip, ekspor, bagikan
├── sw.js               # cache offline
├── manifest.webmanifest
├── icons/              # ikon PWA
├── mulai.sh            # server lokal
└── README.md
```

## Catatan teknis

- Tanpa framework dan tanpa build step; satu file JS biasa.
- Penyimpanan: IndexedDB `satu-hari` dengan dua object store — `entries` (tanggal, kalimat, thumbnail) dan `photos` (blob asli).
- Kamera memakai `<input type="file" accept="image/*" capture="environment">`, sehingga tetap bekerja di browser biasa maupun PWA.
- Tanggal disimpan sebagai `YYYY-MM-DD` waktu lokal, jadi tidak bergeser zona waktu.
- Kalau mengubah `index.html`, `style.css`, atau `app.js`, naikkan nilai `CACHE` di `sw.js` (mis. `satu-hari-v2`) agar service worker mengambil versi baru.
