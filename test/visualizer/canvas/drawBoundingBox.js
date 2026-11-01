function drawBox(
  ctx,
  item,
  idx,
  { showIdx = false, showDegree = false, showLabel = false },
) {
  const [v1, v2, v3, v4] = item.vertices;

  // Pengaturan ketebalan garis global untuk fungsi ini
  ctx.lineWidth = 2;

  // ==========================================
  // LALUAN 1: ISI WARNA LATAR (FILL) TERLEBIH DAHULU
  // ==========================================
  ctx.beginPath();
  ctx.moveTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.lineTo(v3.x, v3.y);
  ctx.lineTo(v4.x, v4.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 71, 87, 0.15)"; // Warna latar transparan
  ctx.fill();

  // ==========================================
  // LALUAN 2: GAMBAR TIAP GARIS DENGAN WARNA BERBEDA
  // ==========================================

  // 1. Garis atas: v1 -> v2 (Warna Merah)
  ctx.beginPath();
  ctx.moveTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.strokeStyle = "#ff4757"; // Merah
  ctx.stroke();

  // 2. Garis kanan: v2 -> v3 (Warna Kuning)
  ctx.beginPath();
  ctx.moveTo(v2.x, v2.y);
  ctx.lineTo(v3.x, v3.y);
  ctx.strokeStyle = "#ffa502"; // Kuning
  ctx.stroke();

  // 3. Garis bawah: v3 -> v4 (Warna Hijau)
  ctx.beginPath();
  ctx.moveTo(v3.x, v3.y);
  ctx.lineTo(v4.x, v4.y);
  ctx.strokeStyle = "#2ed573"; // Hijau
  ctx.stroke();

  // 4. Garis kiri: v4 -> v1 (Warna Biru)
  ctx.beginPath();
  ctx.moveTo(v4.x, v4.y);
  ctx.lineTo(v1.x, v1.y);
  ctx.strokeStyle = "#1e90ff"; // Biru
  ctx.stroke();

  ctx.save(); // Simpan state canvas awal

  // Pindahkan titik koordinat (0,0) ke posisi v1
  ctx.translate(v1.x, v1.y);

  // Rotasi canvas berdasarkan item.degree (konversi ke radian)
  // Pastikan item.degree bernilai 0 jika belum didefinisikan
  const rotationAngle = (item.degree || 0) * (Math.PI / 180);
  ctx.rotate(rotationAngle);

  // Tulis teks (posisinya sekarang relatif terhadap v1 yang sudah di-translate & rotate)
  ctx.fillStyle = "#2f3542";
  ctx.font = "bold 14px Arial";
  const label = `${showIdx ? `[${idx}]` : ""}${showLabel ? item.label : ""} ${showDegree ? parseFloat(item.degree).toFixed(0) + "Deg" : ""}`;
  ctx.fillText(label, 0, -8);

  ctx.restore();
}

export function drawBoundingBoxes(
  canvas,
  data,
  opts = {
    showIdx: false,
    showDegree: false,
    showLabel: false,
  },
) {
  if (!data || data.length === 0) return;

  // 1. Cari koordinat X dan Y terbesar dari seluruh data vertices
  let maxX = 800; // nilai default minimal (opsional)
  let maxY = 600; // nilai default minimal (opsional)

  data.forEach((item) => {
    item.vertices.forEach((v) => {
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    });
  });

  // 2. Tambahkan sedikit padding/jarak aman (misal 50px) agar kotak paling kanan tidak mepet
  const padding = 50;

  // 3. Atur ulang ukuran asli atribut kanvas secara dinamis
  canvas.width = maxX + padding;
  canvas.height = maxY + padding;

  const ctx = canvas.getContext("2d");

  // Bersihkan canvas (sekarang canvas.width sudah mencakup data terjauh)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  data.forEach((item, idx) => {
    drawBox(ctx, item, idx, opts);
  });
}
