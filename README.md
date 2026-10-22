# Sakuin
Aplikasi web statis (HTML + JS), tanpa backend. Data tersimpan di localStorage perangkat pengguna.

## Deploy
Unggah seluruh isi folder ini ke hosting statis (Netlify, Cloudflare Pages, Vercel, GitHub Pages, atau Nginx/Apache). Wajib HTTPS agar PWA, service worker, dan salin-clipboard berfungsi. `_headers` (Netlify/Cloudflare) dan `vercel.json` sudah berisi header keamanan.

## Catatan
- Setelah mengubah file, naikkan `CACHE` di `sw.js` (mis. `sakuin-v3`) agar pengguna mendapat versi baru.
- Tailwind & Lucide dimuat dari CDN (versi dipin) dan di-cache service worker. Untuk produksi besar, ganti dengan CSS hasil build Tailwind CLI.
- Pengguna sebaiknya rutin klik ikon Backup, karena data hanya ada di browser mereka.
