export interface Vertex {
  x?: number | null;
  y?: number | null;
}

export interface Dimension {
  w: number;
  h: number;
}

export interface TransformedTextAnnotation {
  label: string | null | undefined;
  vertices: Vertex[];
  dimension: Dimension;
  degree: number;
}

export interface OrientationCluster {
  degree: number;
  count: number;
  supportRatio: number;
  medianHeight: number;
  deviation: number;
  members: number[];
}

export interface MajorityDegreeResult {
  degree: number;
  totalWords: number;
  validWords: number;
  support: number;
  supportRatio: number;
  medianHeight: number;
  deviation: number;
  isReliable: boolean;
  clusters: OrientationCluster[];
  selectedCluster: OrientationCluster;
}

export interface ProjectedBox {
  originalIndex: number;
  box: TransformedTextAnnotation;

  centerU: number;
  centerV: number;

  uMin: number;
  uMax: number;

  vMin: number;
  vMax: number;

  width: number;
  height: number;
}

export interface WordRow {
  centerV: number;
  height: number;
  boxes: ProjectedBox[];
}

export interface SortWordBoxesResult {
  orientation: MajorityDegreeResult;
  rows: WordRow[];
  flat: TransformedTextAnnotation[];
  projected: ProjectedBox[];
  skipped: number;
  rowTolerance: number;
}

export interface WordSegment {
  rowIndex: number;
  segmentIndex: number;

  centerU: number;
  minU: number;
  maxU: number;

  boxes: ProjectedBox[];
}

export interface SortWordBoxesResult {
  orientation: MajorityDegreeResult;
  rows: WordRow[];

  // Hasil sorting lama, tidak berubah.
  flat: TransformedTextAnnotation[];

  // Hasil segmentasi baru.
  segments: WordSegment[];

  projected: ProjectedBox[];
  skipped: number;
  rowTolerance: number;
}
