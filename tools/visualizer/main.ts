import "./style.css";
import {
  initDiagnosticUi,
  type DiagnosticUi,
  type MarkKind,
} from "./diagnostic-ui.js";
import type { ExpectedCategory, ExpectedEntry } from "./diagnostic/types.js";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface Vertex {
  x?: number | null;
  y?: number | null;
}
interface Annotation {
  description?: string | null;
  boundingPoly?: { vertices?: Vertex[] | null } | null;
}
interface VisionJson {
  textAnnotations?: Annotation[] | null;
}
interface Point {
  x: number;
  y: number;
}
interface Box {
  originalIndex: number;
  label: string;
  vertices: Point[];
  degree: number;
}
interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
  fit: number;
  baseX: number;
  baseY: number;
}
interface DragState {
  startX: number;
  startY: number;
  originPanX: number;
  originPanY: number;
  moved: boolean;
}

/* ------------------------------------------------------------------ */
/* Constants & DOM references (all resolved up-front)                 */
/* ------------------------------------------------------------------ */

const PAD = 28;
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_SELECTED_TEXT = "Select a polygon on the canvas.";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 40;
const BUTTON_ZOOM_STEP = 1.25;

const DEFAULT_EDGE_COLORS = [
  "#ff4757", // 1 -> 2: Merah
  "#ffa502", // 2 -> 3: Kuning
  "#2ed573", // 3 -> 4: Hijau
  "#1e90ff", // 4 -> 1: Biru
];

// Ukuran teks dalam piksel layar (konstan saat zoom). Ubah di sini kalau masih kurang besar.
const HEADER_FONT_PX = 14; // index + degree (di atas box)
const LABEL_FONT_PX = 18; // label (di dalam box)

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const canvas = $<HTMLCanvasElement>("canvas");
const canvasWrap = $<HTMLDivElement>("canvas-wrap");
const canvasContext = canvas.getContext("2d");
if (!canvasContext) throw new Error("Canvas 2D context is unavailable");
const ctx: CanvasRenderingContext2D = canvasContext;

const jsonInput = $<HTMLInputElement>("json-file");
const imageInput = $<HTMLInputElement>("image-file");
const clearImageButton = $<HTMLButtonElement>("clear-image");
const showLabel = $<HTMLInputElement>("show-label");
const showIndex = $<HTMLInputElement>("show-index");
const showDegree = $<HTMLInputElement>("show-degree");

const bgPreset = $<HTMLSelectElement>("bg-preset");
const bgColor = $<HTMLInputElement>("bg-color");
const bgHex = $<HTMLInputElement>("bg-hex");
const zoomInButton = $<HTMLButtonElement>("zoom-in");
const zoomOutButton = $<HTMLButtonElement>("zoom-out");
const zoomResetButton = $<HTMLButtonElement>("zoom-reset");
const zoomLevelNode = $("zoom-level");

const removeInput = $<HTMLTextAreaElement>("remove-input");
const removeCategory = $<HTMLSelectElement>("remove-category");
const restoreInput = $<HTMLTextAreaElement>("restore-input");
const removeButton = $<HTMLButtonElement>("remove");
const restoreButton = $<HTMLButtonElement>("restore");
const restoreAllButton = $<HTMLButtonElement>("restore-all");
const exportButton = $<HTMLButtonElement>("export");
const copyRemainingButton = $<HTMLButtonElement>("copy-remaining");
const copyRemovedButton = $<HTMLButtonElement>("copy-removed");
const remainingOutput = $<HTMLTextAreaElement>("remaining");
const removedOutput = $<HTMLTextAreaElement>("removed");

const messageNode = $("message");
const selectedOutput = $("selected");
const emptyState = $("empty");
const datasetName = $("dataset-name");
const canvasMeta = $("canvas-meta");
const totalNode = $("total");
const remainingCountNode = $("remaining-count");
const removedCountNode = $("removed-count");

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

let boxes: Box[] = [];
// Seluruh textAnnotations mentah (termasuk index 0), dikirim apa adanya ke test runner.
let rawAnnotations: Annotation[] = [];
// index -> kategori detektor yang diharapkan menghapusnya.
const removed = new Map<number, ExpectedCategory>();
let diagnostic: DiagnosticUi | null = null;
let selected: number | null = null;
let sourceName = "";
let background: HTMLImageElement | null = null;
let backgroundUrl: string | null = null;
let canvasColor = DEFAULT_BACKGROUND;
// Transform terakhir yang dipakai render(); dipakai juga oleh hit-test dan zoom.
let view: View = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fit: 1,
  baseX: 0,
  baseY: 0,
};
let zoom = 1; // pengali di atas skala "fit"
let panX = 0; // geser dalam piksel layar
let panY = 0;
let drag: DragState | null = null;
let suppressClick = false;

/* ------------------------------------------------------------------ */
/* Data transform                                                     */
/* ------------------------------------------------------------------ */

function toPoint(vertex: Vertex): Point | null {
  // Google Vision omits x / y when the value is 0, so a missing value means 0.
  const x = vertex.x ?? 0;
  const y = vertex.y ?? 0;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function transform(annotations: Annotation[]): Box[] {
  // Same as KTPExtractor: drop textAnnotations[0] (full text) before assigning originalIndex.
  return annotations.slice(1).map((annotation, originalIndex) => {
    const vertices = (annotation.boundingPoly?.vertices ?? [])
      .map(toPoint)
      .filter((point): point is Point => point !== null);
    const a = vertices[0];
    const b = vertices[1];
    const degree =
      a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0;
    return {
      originalIndex,
      label: annotation.description?.trim() ?? "",
      vertices,
      degree,
    };
  });
}

function sourceSize(): Point {
  if (background) {
    return { x: background.naturalWidth, y: background.naturalHeight };
  }
  let x = 1;
  let y = 1;
  for (const box of boxes) {
    for (const point of box.vertices) {
      x = Math.max(x, point.x);
      y = Math.max(y, point.y);
    }
  }
  return { x, y };
}

function remainingIndexes(): number[] {
  return boxes
    .map((box) => box.originalIndex)
    .filter((index) => !removed.has(index))
    .sort((a, b) => a - b);
}

function removedIndexes(): number[] {
  return [...removed.keys()].sort((a, b) => a - b);
}

function expectedEntries(): ExpectedEntry[] {
  return removedIndexes().map((index) => ({
    index,
    category: removed.get(index) ?? "unspecified",
  }));
}

function expectedChanged(): void {
  diagnostic?.onExpectedChanged();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function computeView(width: number, height: number, size: Point): View {
  const fit = Math.min(
    (width - PAD * 2) / Math.max(size.x, 1),
    (height - PAD * 2) / Math.max(size.y, 1),
  );
  const baseX = (width - size.x * fit) / 2;
  const baseY = (height - size.y * fit) / 2;
  return {
    scale: fit * zoom,
    offsetX: baseX + panX,
    offsetY: baseY + panY,
    fit,
    baseX,
    baseY,
  };
}

const MARK_STYLE: Record<
  MarkKind,
  { color: string; dash: boolean; tag: string }
> = {
  // Diharapkan hilang tetapi tidak dihapus pipeline.
  missing: { color: "#ff5d73", dash: true, tag: "MISSING" },
  // Dihapus pipeline padahal tidak diharapkan.
  unexpected: { color: "#ffb020", dash: false, tag: "EXTRA" },
  // Dihapus oleh detektor yang berbeda dari yang diharapkan.
  "wrong-source": { color: "#b388ff", dash: true, tag: "WRONG SRC" },
};

function drawMark(box: Box, kind: MarkKind, scale: number): void {
  const first = box.vertices[0];
  if (!first || box.vertices.length < 3) return;
  const style = MARK_STYLE[kind];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of box.vertices.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = `${style.color}33`;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 / scale;
  ctx.strokeStyle = style.color;
  ctx.setLineDash(style.dash ? [6 / scale, 4 / scale] : []);
  ctx.stroke();
  ctx.setLineDash([]);

  const fontSize = HEADER_FONT_PX / scale;
  const text = `${style.tag} #${box.originalIndex}`;
  ctx.translate(first.x, first.y);
  ctx.rotate((box.degree * Math.PI) / 180);
  ctx.font = `800 ${fontSize}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const height = fontSize * 1.5;
  const y = -(height + 3 / scale);
  ctx.fillStyle = style.color;
  ctx.fillRect(0, y, ctx.measureText(text).width + 10 / scale, height);
  ctx.fillStyle = "#0b1020";
  ctx.fillText(text, 5 / scale, y + height / 2);
  ctx.restore();
}

function drawBox(box: Box, scale: number): void {
  const vertices = box.vertices;
  const first = vertices[0];
  if (!first) return;

  const active = selected === box.originalIndex;
  const angle = (box.degree * Math.PI) / 180;
  const fontFamily = "ui-monospace, monospace";

  /* ---- Isi box ---- */
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of vertices.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = active ? "rgba(255,209,102,.18)" : "rgba(255,255,255,.06)";
  ctx.fill();

  // Halo kuning di belakang garis supaya box yang dipilih tetap terlihat
  // walaupun warna sisinya sudah berbeda-beda.
  if (active) {
    ctx.lineJoin = "round";
    ctx.lineWidth = 7 / scale;
    ctx.strokeStyle = "rgba(255,209,102,.55)";
    ctx.stroke();
  }

  /* ---- Stroke per sisi: 1->2 merah, 2->3 kuning, 3->4 hijau, 4->1 biru ---- */
  ctx.lineCap = "round";
  ctx.lineWidth = (active ? 3 : 2) / scale;
  vertices.forEach((from, i) => {
    const to = vertices[(i + 1) % vertices.length];
    if (!to) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle =
      DEFAULT_EDGE_COLORS[i % DEFAULT_EDGE_COLORS.length] ?? "#31d7a2";
    ctx.stroke();
  });

  /* ---- Index + degree: di atas box, mengikuti orientasi box ---- */
  const headerParts: string[] = [];
  if (showIndex.checked) headerParts.push(`#${box.originalIndex}`);
  if (showDegree.checked) headerParts.push(`${box.degree.toFixed(1)}°`);

  if (headerParts.length) {
    const fontSize = HEADER_FONT_PX / scale;
    const text = headerParts.join(" · ");
    const textHeight = fontSize * 1.5;
    const gap = 3 / scale;

    ctx.save();
    ctx.translate(first.x, first.y);
    ctx.rotate(angle);
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const boxY = -(textHeight + gap); // tepat di atas sisi 1->2
    ctx.fillStyle = "rgba(8,15,28,.9)";
    ctx.fillRect(0, boxY, ctx.measureText(text).width + 10 / scale, textHeight);
    ctx.fillStyle = active ? "#ffd166" : "#e9fff7";
    ctx.fillText(text, 5 / scale, boxY + textHeight / 2);
    ctx.restore();
  }

  /* ---- Label: di dalam box, di tengah, mengikuti orientasi box ---- */
  if (showLabel.checked && box.label) {
    const second = vertices[1];
    const third = vertices[2];
    const boxWidth = second
      ? Math.hypot(second.x - first.x, second.y - first.y)
      : 0;
    const boxHeight =
      second && third ? Math.hypot(third.x - second.x, third.y - second.y) : 0;
    const centerX = vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length;

    // Mulai dari ukuran yang diinginkan, lalu kecilkan bila tidak muat di dalam box.
    let fontSize = LABEL_FONT_PX / scale;
    if (boxHeight > 0) fontSize = Math.min(fontSize, boxHeight * 0.85);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fontSize}px ${fontFamily}`;

    let textWidth = ctx.measureText(box.label).width;
    const maxWidth = boxWidth * 0.94;
    if (maxWidth > 0 && textWidth > maxWidth) {
      fontSize *= maxWidth / textWidth;
      ctx.font = `700 ${fontSize}px ${fontFamily}`;
      textWidth = ctx.measureText(box.label).width;
    }

    const padding = fontSize * 0.15;
    ctx.fillStyle = "rgba(8,15,28,.78)";
    ctx.fillRect(
      -textWidth / 2 - padding,
      -fontSize * 0.65,
      textWidth + padding * 2,
      fontSize * 1.3,
    );
    ctx.fillStyle = active ? "#ffd166" : "#ffffff";
    ctx.fillText(box.label, 0, 0);
    ctx.restore();
  }
}

function render(): void {
  const width = Math.max(320, Math.floor(canvasWrap.clientWidth));
  const height = Math.max(
    360,
    Math.min(900, Math.floor(window.innerHeight * 0.72)),
  );
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const hasContent = boxes.length > 0 || background !== null;
  emptyState.hidden = hasContent;

  if (!hasContent) {
    ctx.clearRect(0, 0, width, height);
    updatePanels();
    return;
  }

  // 1. Canvas background goes FIRST, in screen space, so it never covers the content.
  ctx.fillStyle = canvasColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Image + polygons, in source-image space.
  const size = sourceSize();
  view = computeView(width, height, size);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  if (background) ctx.drawImage(background, 0, 0, size.x, size.y);
  for (const box of boxes) {
    if (removed.has(box.originalIndex) || box.vertices.length < 3) continue;
    drawBox(box, view.scale);
  }
  // Hasil diagnostic test: sorot box yang tidak cocok dengan expected,
  // termasuk yang sedang disembunyikan karena ditandai removed.
  const marks = diagnostic?.getMarks();
  if (marks) {
    for (const [index, kind] of marks) {
      const box = boxes[index];
      if (box) drawMark(box, kind, view.scale);
    }
  }
  ctx.restore();

  updatePanels();
}

/* ------------------------------------------------------------------ */
/* Panels                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

function updateSelectedPanel(): void {
  const box =
    selected === null
      ? undefined
      : boxes.find((b) => b.originalIndex === selected);
  if (!box) {
    selectedOutput.textContent = DEFAULT_SELECTED_TEXT;
    return;
  }
  const category = removed.get(box.originalIndex);
  const testLines = (diagnostic?.describeIndex(box.originalIndex) ?? []).map(
    (line) => escapeHtml(line),
  );
  selectedOutput.innerHTML = [
    `<strong>Index:</strong> ${box.originalIndex}`,
    `<strong>Label:</strong> ${escapeHtml(box.label || "(empty)")}`,
    `<strong>Degree:</strong> ${box.degree.toFixed(4)}°`,
    `<strong>Vertices:</strong> ${box.vertices.length}`,
    `<strong>Status:</strong> ${category ? `Removed (${category})` : "Visible"}`,
    ...testLines,
  ].join("<br>");
}

function updatePanels(): void {
  const remaining = remainingIndexes();
  const removedList = removedIndexes();
  const loaded = boxes.length > 0;

  totalNode.textContent = String(boxes.length);
  zoomLevelNode.textContent = `${Math.round(zoom * 100)}%`;
  remainingCountNode.textContent = String(remaining.length);
  removedCountNode.textContent = String(removedList.length);
  remainingOutput.value = remaining.join(", ");
  removedOutput.value = removedList.join(", ");

  removeButton.disabled = !loaded;
  restoreButton.disabled = !loaded || removedList.length === 0;
  restoreAllButton.disabled = !loaded || removedList.length === 0;
  exportButton.disabled = !loaded;
  copyRemainingButton.disabled = !loaded;
  copyRemovedButton.disabled = !loaded || removedList.length === 0;

  canvasMeta.textContent = loaded
    ? `${boxes.length} annotations · ${remaining.length} visible · ${removedList.length} removed`
    : "Waiting for dataset";

  updateSelectedPanel();
}

function notify(text: string, error = false): void {
  messageNode.textContent = text;
  messageNode.classList.toggle("error", error);
}

/* ------------------------------------------------------------------ */
/* Remove / restore                                                   */
/* ------------------------------------------------------------------ */

function parseIndexes(value: string): { values: number[]; invalid: string[] } {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const token of value.split(/[\s,;]+/).filter(Boolean)) {
    const number = Number(token);
    if (/^\d+$/.test(token) && Number.isSafeInteger(number))
      values.push(number);
    else invalid.push(token);
  }
  return { values: [...new Set(values)], invalid };
}

function removeIndexes(): void {
  const parsed = parseIndexes(removeInput.value);
  if (parsed.invalid.length) {
    notify(`Invalid indexes: ${parsed.invalid.join(", ")}`, true);
    return;
  }
  const known = new Set(boxes.map((box) => box.originalIndex));
  const targets = parsed.values.filter((index) => known.has(index));
  const missing = parsed.values.filter((index) => !known.has(index));

  const category = removeCategory.value as ExpectedCategory;
  for (const index of targets) removed.set(index, category);

  notify(
    `${targets.length} index(es) marked as removed (${category}).` +
      (missing.length ? ` Not found: ${missing.join(", ")}` : ""),
  );
  expectedChanged();
  render();
}

function restoreIndexes(): void {
  const parsed = parseIndexes(restoreInput.value);
  if (parsed.invalid.length) {
    notify(`Invalid indexes: ${parsed.invalid.join(", ")}`, true);
    return;
  }
  let count = 0;
  for (const index of parsed.values) if (removed.delete(index)) count++;
  notify(`${count} index(es) restored.`);
  expectedChanged();
  render();
}

function restoreAll(): void {
  const count = removed.size;
  removed.clear();
  notify(`${count} index(es) restored.`);
  expectedChanged();
  render();
}

/* ------------------------------------------------------------------ */
/* Canvas interaction                                                 */
/* ------------------------------------------------------------------ */

function isInside(point: Point, polygon: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) hit = !hit;
  }
  return hit;
}

function onCanvasClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  const point: Point = {
    x: (clientX - rect.left - view.offsetX) / view.scale,
    y: (clientY - rect.top - view.offsetY) / view.scale,
  };
  // Iterate from the top-most (last drawn) polygon.
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (
      box &&
      !removed.has(box.originalIndex) &&
      box.vertices.length >= 3 &&
      isInside(point, box.vertices)
    ) {
      selected = box.originalIndex;
      render();
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Files                                                              */
/* ------------------------------------------------------------------ */

async function loadJson(file: File): Promise<void> {
  const parsed: unknown = JSON.parse(await file.text());
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("textAnnotations" in parsed)
  ) {
    throw new Error("JSON must contain textAnnotations.");
  }
  const annotations = (parsed as VisionJson).textAnnotations;
  if (!Array.isArray(annotations))
    throw new Error("textAnnotations must be an array.");

  rawAnnotations = annotations as Annotation[];
  boxes = transform(rawAnnotations);
  removed.clear();
  selected = null;
  sourceName = file.name;
  datasetName.textContent = file.name;
  removeInput.value = "";
  restoreInput.value = "";
  resetViewState();
  diagnostic?.onDatasetChanged();
  notify(`Loaded ${boxes.length} annotations.`);
  render();
}

function loadImage(file: File): void {
  if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
  backgroundUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    background = image;
    clearImageButton.disabled = false;
    resetViewState();
    render();
  };
  image.onerror = () => {
    clearBackground();
    notify("Unable to load image.", true);
  };
  image.src = backgroundUrl;
}

function clearBackground(): void {
  if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
  backgroundUrl = null;
  background = null;
  imageInput.value = "";
  clearImageButton.disabled = true;
  render();
}

function indexesOfCategory(category: ExpectedCategory): number[] {
  return removedIndexes().filter((index) => removed.get(index) === category);
}

function exportExpected(): void {
  const payload = {
    schemaVersion: 1,
    sourceFile: sourceName,
    totalAnnotations: boxes.length,
    removedIndexes: removedIndexes(),
    remainingIndexes: remainingIndexes(),
    // Tambahan opsional: detektor mana yang diharapkan menghapus index tsb.
    removedByCategory: {
      watermark: indexesOfCategory("watermark"),
      metadata: indexesOfCategory("metadata"),
      unspecified: indexesOfCategory("unspecified"),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sourceName.replace(/\.json$/i, "") || "dataset"}.expected.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    notify("Copied to clipboard.");
  } catch {
    notify("Clipboard is unavailable in this browser.", true);
  }
}

/* ------------------------------------------------------------------ */
/* Canvas background color                                            */
/* ------------------------------------------------------------------ */

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
}

function setCanvasBackground(color: string): void {
  canvasColor = color;
  bgColor.value = color;
  bgHex.value = color.toUpperCase();
  const hasPreset = [...bgPreset.options].some(
    (option) => option.value === color,
  );
  bgPreset.value = hasPreset ? color : "custom";
  render();
}

/* ------------------------------------------------------------------ */
/* Zoom & pan                                                         */
/* ------------------------------------------------------------------ */

function canNavigate(): boolean {
  return boxes.length > 0 || background !== null;
}

function resetViewState(): void {
  zoom = 1;
  panX = 0;
  panY = 0;
}

function resetView(): void {
  resetViewState();
  render();
}

// Zoom dengan titik (cx, cy) di kanvas (piksel CSS) tetap berada di bawah kursor.
function zoomAt(factor: number, cx: number, cy: number): void {
  if (!canNavigate()) return;
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  if (nextZoom === zoom) return;

  const sourceX = (cx - view.offsetX) / view.scale;
  const sourceY = (cy - view.offsetY) / view.scale;
  zoom = nextZoom;
  const scale = view.fit * zoom;
  panX = cx - sourceX * scale - view.baseX;
  panY = cy - sourceY * scale - view.baseY;
  render();
}

function zoomFromCenter(factor: number): void {
  const rect = canvas.getBoundingClientRect();
  zoomAt(factor, rect.width / 2, rect.height / 2);
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || !canNavigate()) return;
  drag = {
    startX: event.clientX,
    startY: event.clientY,
    originPanX: panX,
    originPanY: panY,
    moved: false,
  };
  canvas.setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent): void {
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return; // toleransi klik
  drag.moved = true;
  canvas.classList.add("dragging");
  panX = drag.originPanX + dx;
  panY = drag.originPanY + dy;
  render();
}

function endDrag(event: PointerEvent): void {
  if (!drag) return;
  if (drag.moved) {
    // Cegah "click" yang menyusul setelah drag agar tidak ikut memilih poligon.
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
  drag = null;
  canvas.classList.remove("dragging");
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

jsonInput.addEventListener("change", () => {
  const file = jsonInput.files?.[0];
  if (!file) return;
  void loadJson(file)
    .catch((error: unknown) =>
      notify(
        error instanceof Error ? error.message : "Failed to read JSON.",
        true,
      ),
    )
    .finally(() => {
      jsonInput.value = ""; // allow re-selecting the same file
    });
});
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) loadImage(file);
});
clearImageButton.addEventListener("click", clearBackground);

removeButton.addEventListener("click", removeIndexes);
restoreButton.addEventListener("click", restoreIndexes);
restoreAllButton.addEventListener("click", restoreAll);
exportButton.addEventListener("click", exportExpected);
copyRemainingButton.addEventListener(
  "click",
  () => void copy(remainingOutput.value),
);
copyRemovedButton.addEventListener(
  "click",
  () => void copy(removedOutput.value),
);

for (const input of [showLabel, showIndex, showDegree]) {
  input.addEventListener("change", render);
}

bgPreset.addEventListener("change", () => {
  if (bgPreset.value === "custom") {
    bgHex.focus();
    return;
  }
  setCanvasBackground(bgPreset.value);
});
bgColor.addEventListener("input", () => setCanvasBackground(bgColor.value));
bgHex.addEventListener("input", () => {
  const color = normalizeHex(bgHex.value);
  if (color) setCanvasBackground(color);
});

canvas.addEventListener("click", (event) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  onCanvasClick(event.clientX, event.clientY);
});

zoomInButton.addEventListener("click", () => zoomFromCenter(BUTTON_ZOOM_STEP));
zoomOutButton.addEventListener("click", () =>
  zoomFromCenter(1 / BUTTON_ZOOM_STEP),
);
zoomResetButton.addEventListener("click", resetView);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    zoomAt(
      Math.exp(-delta * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", startDrag);
canvas.addEventListener("pointermove", moveDrag);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
window.addEventListener("resize", render);

diagnostic = initDiagnosticUi({
  getDataset: () =>
    boxes.length > 0
      ? {
          sourceName,
          textAnnotations: rawAnnotations,
          total: boxes.length,
        }
      : null,
  getExpected: expectedEntries,
  applyExpected(entries, totalAnnotations) {
    if (boxes.length === 0) {
      notify("Load a Vision JSON before loading expected JSON.", true);
      return;
    }
    const known = new Set(boxes.map((box) => box.originalIndex));
    removed.clear();
    const unknown: number[] = [];
    for (const entry of entries) {
      if (known.has(entry.index)) removed.set(entry.index, entry.category);
      else unknown.push(entry.index);
    }
    selected = null;
    const warnings: string[] = [];
    if (unknown.length) warnings.push(`unknown indexes ignored: ${unknown.join(", ")}`);
    if (totalAnnotations !== null && totalAnnotations !== boxes.length) {
      warnings.push(
        `expected file is for ${totalAnnotations} annotations but this dataset has ${boxes.length}`,
      );
    }
    notify(
      `Loaded expected: ${removed.size} removed index(es).` +
        (warnings.length ? ` Warning: ${warnings.join("; ")}.` : ""),
      warnings.length > 0,
    );
    expectedChanged();
    render();
  },
  selectIndex(index) {
    if (!boxes.some((box) => box.originalIndex === index)) return;
    selected = index;
    render();
  },
  requestRender: render,
  notify,
});

render();
