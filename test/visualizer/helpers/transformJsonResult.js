function calculateDistance(xA, yA, xB, yB) {
  return Math.hypot(xB - xA, yB - yA);
}
function calculateDegree(x1, y1, x2, y2) {
  // Menghitung sudut sisi atas bounding box
  const dx = x2 - x1;
  const dy = y2 - y1;

  const radians = Math.atan2(dy, dx);
  const degrees = radians * (180 / Math.PI);

  return degrees;
}

export function transformTextAnnotation(obj) {
  return (
    obj?.map((item) => {
      const vertices = item.boundingPoly?.vertices ?? [];

      const [v0, v1, v3] = vertices;

      const x1 = v0?.x ?? 0;
      const y1 = v0?.y ?? 0;

      const x2 = v1?.x ?? 0;
      const y2 = v1?.y ?? 0;

      const x4 = v3?.x ?? 0;
      const y4 = v3?.y ?? 0;

      return {
        label: item.description,
        vertices,
        dimension: {
          w: calculateDistance(x1, y1, x2, y2),
          h: calculateDistance(x1, y1, x4, y4),
        },
        degree: calculateDegree(x1, y1, x2, y2),
      };
    }) ?? []
  );
}
