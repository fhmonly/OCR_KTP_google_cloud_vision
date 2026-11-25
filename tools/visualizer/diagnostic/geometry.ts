import type { BoxGeometry, Point } from "./types.js";

/* Geometri satu box dari boundingPoly Vision. Murni (tanpa DOM/Node). */

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Sama dengan visualizer: sudut vektor a -> b dalam derajat, rentang -180..180. */
const edgeDegree = (a: Point, b: Point): number =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

function emptyGeometry(vertices: Point[], hadMissing: boolean): BoxGeometry {
  return {
    vertices,
    vertexCount: vertices.length,
    hadMissingCoordinates: hadMissing,
    degree: null,
    degreeNormalized: null,
    bottomEdgeDegree: null,
    center: null,
    width: null,
    height: null,
    bbox: null,
    area: null,
  };
}

/**
 * @param annotation satu item textAnnotations (bukan index 0).
 * Vision menghilangkan x / y bila nilainya 0, jadi nilai yang hilang dibaca 0
 * (sama dengan perilaku visualizer) dan ditandai di `hadMissingCoordinates`.
 */
export function computeGeometry(annotation: unknown): BoxGeometry {
  const raw = (
    annotation as { boundingPoly?: { vertices?: unknown } } | null
  )?.boundingPoly?.vertices;

  const vertices: Point[] = [];
  let hadMissing = false;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const vertex = (item ?? {}) as { x?: unknown; y?: unknown };
      if (vertex.x === undefined || vertex.y === undefined) hadMissing = true;
      const x = vertex.x === undefined ? 0 : Number(vertex.x);
      const y = vertex.y === undefined ? 0 : Number(vertex.y);
      if (Number.isFinite(x) && Number.isFinite(y)) vertices.push({ x, y });
    }
  }

  const [v0, v1, v2, v3] = vertices;
  if (vertices.length < 3 || !v0 || !v1 || !v2) {
    return emptyGeometry(vertices, hadMissing);
  }

  const degree = edgeDegree(v0, v1);
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Shoelace.
  let twiceArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }

  // Vision: v0=kiri-atas, v1=kanan-atas, v2=kanan-bawah, v3=kiri-bawah
  // (dalam kerangka teks, sebelum rotasi).
  const width = v3 ? mean([distance(v0, v1), distance(v3, v2)]) : distance(v0, v1);
  const height = v3
    ? mean([distance(v0, v3), distance(v1, v2)])
    : distance(v1, v2);

  return {
    vertices,
    vertexCount: vertices.length,
    hadMissingCoordinates: hadMissing,
    degree: round(degree),
    degreeNormalized: round(((degree % 360) + 360) % 360),
    bottomEdgeDegree: v3 ? round(edgeDegree(v3, v2)) : null,
    center: { x: round(mean(xs), 2), y: round(mean(ys), 2) },
    width: round(width, 2),
    height: round(height, 2),
    bbox: {
      minX,
      minY,
      maxX,
      maxY,
      width: round(maxX - minX, 2),
      height: round(maxY - minY, 2),
    },
    area: round(Math.abs(twiceArea) / 2, 2),
  };
}

/** "(x,y) (x,y) ..." untuk tabel teks. */
export function formatVertices(vertices: Point[]): string {
  return vertices.length
    ? vertices.map((v) => `(${v.x},${v.y})`).join(" ")
    : "-";
}
