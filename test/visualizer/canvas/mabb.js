/**
 * Mencari Convex Hull menggunakan Andrew's Monotone Chain (O(N log N)).
 */
function getConvexHull(points) {
  // Urutkan titik berdasarkan x, lalu y
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );

  if (sorted.length <= 1) return sorted;

  // Perkalian silang untuk menentukan arah belokan
  const cross = (o, a, b) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };

  // Build lower hull
  const lower = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Gabungkan lower dan upper hull (hapus titik duplikat di ujung)
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Menghitung Minimum Area Bounding Box menggunakan teknik Rotating Calipers.
 */
export function getMinimumBoundingBox(points) {
  const hull = getConvexHull(points);
  const n = hull.length;

  if (n < 3) {
    throw new Error("Dibutuhkan minimal 3 titik non-kolinear.");
  }

  let minArea = Infinity;
  let bestCorners = [];

  // Iterasi melalui setiap sisi (edge) dari convex hull
  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];

    // Vektor dari edge saat ini
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    // Hitung sudut rotasi agar edge sejajar dengan sumbu-X
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    // Rotasi seluruh titik hull dan cari batas ekstrem
    for (const p of hull) {
      const rx = p.x * cos - p.y * sin;
      const ry = p.x * sin + p.y * cos;

      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;

    if (area < minArea) {
      minArea = area;

      // 4 titik sudut kotak pada koordinat terotasi
      const rotatedCorners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];

      // Kembalikan sudut ke sistem koordinat awal (Inverse Rotation)
      const invCos = Math.cos(angle);
      const invSin = Math.sin(angle);

      bestCorners = rotatedCorners.map((p) => ({
        x: p.x * invCos - p.y * invSin,
        y: p.x * invSin + p.y * invCos,
      }));
    }
  }

  return { minArea, corners: bestCorners };
}
