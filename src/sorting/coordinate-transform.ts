import type { ProjectedBox, TransformedTextAnnotation } from "../types.js";

export interface ReadingAxes {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

export function createReadingAxes(degree: number): ReadingAxes {
  const radian = (degree * Math.PI) / 180;

  return {
    ux: Math.cos(radian),
    uy: Math.sin(radian),

    vx: -Math.sin(radian),
    vy: Math.cos(radian),
  };
}

export function projectWordBox(
  box: TransformedTextAnnotation,
  originalIndex: number,
  axes: ReadingAxes,
): ProjectedBox | null {
  if (box.vertices.length !== 4) {
    return null;
  }

  const points = box.vertices.map((vertex) => ({
    x: vertex.x,
    y: vertex.y,
  }));

  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    return null;
  }

  const uValues = points.map(
    (point) => point.x! * axes.ux + point.y! * axes.uy,
  );

  const vValues = points.map(
    (point) => point.x! * axes.vx + point.y! * axes.vy,
  );

  const uMin = Math.min(...uValues);
  const uMax = Math.max(...uValues);

  const vMin = Math.min(...vValues);
  const vMax = Math.max(...vValues);

  return {
    originalIndex,
    box,

    centerU: (uMin + uMax) / 2,
    centerV: (vMin + vMax) / 2,

    uMin,
    uMax,

    vMin,
    vMax,

    width: uMax - uMin,
    height: vMax - vMin,
  };
}
