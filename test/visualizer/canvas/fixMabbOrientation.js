/**
 * Memperbaiki urutan vertices MABB agar selaras dengan orientasi box sumber.
 * @param {Object} mabb - Objek MABB induk { vertices: [{x,y}, {x,y}, {x,y}, {x,y}] }
 * @param {Object} sourceBox - Salah satu box anak yang orientasinya valid/bagus sebagai referensi
 * @returns {Object} MABB yang sudah diperbaiki urutan vertices-nya
 */
export function fixMabbOrientation(mabbVertices, srcVertices) {
  // 1. Hitung vektor arah "ATAS" dari box sumber (v1 -> v2)
  const srcTopDx = srcVertices[1].x - srcVertices[0].x;
  const srcTopDy = srcVertices[1].y - srcVertices[0].y;

  // Normalisasi vektor "ATAS" sumber menjadi unit vektor
  const srcLen = Math.hypot(srcTopDx, srcTopDy);
  const srcTopVector = { x: srcTopDx / srcLen, y: srcTopDy / srcLen };

  // 2. Cari titik pada MABB yang jika ditarik ke titik MABB berikutnya,
  //    arahnya paling sejajar (paling mirip) dengan vektor "ATAS" dari box sumber.
  let bestIdx = 0;
  let maxDotProduct = -Infinity;

  for (let i = 0; i < 4; i++) {
    const nextI = (i + 1) % 4;

    // Vektor dari titik i ke titik i+1 pada MABB
    const mabbDx = mabbVertices[nextI].x - mabbVertices[i].x;
    const mabbDy = mabbVertices[nextI].y - mabbVertices[i].y;
    const mabbLen = Math.hypot(mabbDx, mabbDy);
    const mabbVector = { x: mabbDx / mabbLen, y: mabbDy / mabbLen };

    // Dot product untuk mengukur kemiripan arah (semakin mendekati 1, semakin searah)
    const dot = mabbVector.x * srcTopVector.x + mabbVector.y * srcTopVector.y;

    if (dot > maxDotProduct) {
      maxDotProduct = dot;
      bestIdx = i; // Ini adalah indeks yang seharusnya menjadi v1 (awal garis atas)
    }
  }

  // 3. Susun ulang urutan vertices MABB dimulai dari bestIdx
  const fixedVertices = [];
  for (let i = 0; i < 4; i++) {
    fixedVertices.push(mabbVertices[(bestIdx + i) % 4]);
  }

  // 4. Pengondisian Winding Order (Searah/Berlawanan Jarum Jam)
  // Pastikan MABB berputar searah dengan box sumber
  const srcWinding =
    (srcVertices[1].x - srcVertices[0].x) *
      (srcVertices[2].y - srcVertices[1].y) -
    (srcVertices[1].y - srcVertices[0].y) *
      (srcVertices[2].x - srcVertices[1].x);
  const mabbWinding =
    (fixedVertices[1].x - fixedVertices[0].x) *
      (fixedVertices[2].y - fixedVertices[1].y) -
    (fixedVertices[1].y - fixedVertices[0].y) *
      (fixedVertices[2].x - fixedVertices[1].x);

  // Jika arah putaran MABB terbalik dibanding sumber, balik urutan v2 dan v4 (indeks 1 dan 3)
  if (
    (srcWinding > 0 && mabbWinding < 0) ||
    (srcWinding < 0 && mabbWinding > 0)
  ) {
    const temp = fixedVertices[1];
    fixedVertices[1] = fixedVertices[3];
    fixedVertices[3] = temp;
  }

  return fixedVertices;
}
