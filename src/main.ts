import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { initSquircle } from "./squircle";
import { Simulation, type RGB, type SimColors } from "./sim";
import { models, findModel } from "./models";

const MATRIX_TILE_RES = 128;
const SINGLE_TILE_RES = 384;
const GRID_CHOICES = [6, 8, 10];
const SPEED_CHOICES = [8, 16, 32];
const START_YEAR = 2026;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (v: number) => v.toFixed(4);

function parseNum(s: string | null, fallback: number): number {
  if (s === null) return fallback;
  const v = Number(s);
  return Number.isFinite(v) ? v : fallback;
}

// ===== URL から初期状態を読む =====
const initialParams = new URLSearchParams(location.search);
const model = findModel(initialParams.get("model"));
const xAxis = model.xAxis;
const yAxis = model.yAxis;

let view: "matrix" | "single" = initialParams.get("view") === "single" ? "single" : "matrix";
let grid = GRID_CHOICES.includes(Number(initialParams.get("grid"))) ? Number(initialParams.get("grid")) : 8;
let speed = SPEED_CHOICES.includes(Number(initialParams.get("speed"))) ? Number(initialParams.get("speed")) : 16;
let paused = false;

function rangeFromParams(p: URLSearchParams, key: string, axis: typeof xAxis): [number, number] {
  let lo = clamp(parseNum(p.get(`${key}min`), axis.defaultRange[0]), axis.min, axis.max);
  let hi = clamp(parseNum(p.get(`${key}max`), axis.defaultRange[1]), axis.min, axis.max);
  if (hi - lo < axis.step) [lo, hi] = axis.defaultRange;
  return [lo, hi];
}

let xRange = rangeFromParams(initialParams, xAxis.key, xAxis);
let yRange = rangeFromParams(initialParams, yAxis.key, yAxis);
let xVal = clamp(parseNum(initialParams.get(xAxis.key), xAxis.defaultValue), xAxis.min, xAxis.max);
let yVal = clamp(parseNum(initialParams.get(yAxis.key), yAxis.defaultValue), yAxis.min, yAxis.max);

// ===== DOM =====
const viewMatrix = $("view-matrix");
const viewSingle = $("view-single");
const viewError = $("view-error");
const controls = document.querySelector<HTMLElement>(".controls")!;
const matrixWrap = $("matrix-wrap");
const matrixCanvas = $<HTMLCanvasElement>("matrix-canvas");
const singleCanvas = $<HTMLCanvasElement>("single-canvas");
const hoverBox = $("matrix-hover");
const tooltip = $("matrix-tooltip");
const xTicks = $("x-ticks");
const yTicks = $("y-ticks");
const singleParams = $("single-params");

// 軸まわりのラベルをモデル定義から流し込む
$("x-axis-label").textContent = xAxis.label;
$("y-axis-label").textContent = yAxis.label;
$("x-range-label").textContent = `${xAxis.label} の範囲(横軸)`;
$("y-range-label").textContent = `${yAxis.label} の範囲(縦軸)`;
$("x-param-label").textContent = xAxis.label;
$("y-param-label").textContent = yAxis.label;

const modelSelect = $<HTMLSelectElement>("model-select");
for (const m of models) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  modelSelect.appendChild(opt);
}
modelSelect.value = model.id;
modelSelect.addEventListener("change", () => {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("model", modelSelect.value);
  location.href = url.toString(); // モデル切替はシェーダ再構築が必要なのでリロードする
});

// ===== テーマ =====
type Theme = "light" | "auto" | "dark";
const storedTheme = ((): Theme => {
  try {
    const t = localStorage.getItem("rd-theme");
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
})();

function applyTheme(t: Theme) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try {
    if (t === "auto") localStorage.removeItem("rd-theme");
    else localStorage.setItem("rd-theme", t);
  } catch {}
  requestAnimationFrame(refreshColors);
}

// ===== シミュレーション =====
let matrixSim: Simulation | null = null;
let singleSim: Simulation | null = null;

try {
  matrixSim = new Simulation(matrixCanvas, model, grid, grid, MATRIX_TILE_RES);
  singleSim = new Simulation(singleCanvas, model, 1, 1, SINGLE_TILE_RES);
  matrixSim.setRanges(xRange[0], xRange[1], yRange[0], yRange[1]);
  singleSim.setRanges(xVal, xVal, yVal, yVal);
} catch (e) {
  viewMatrix.hidden = true;
  viewSingle.hidden = true;
  controls.hidden = true;
  viewError.hidden = false;
  $("error-message").textContent = e instanceof Error ? e.message : String(e);
}

function cssRGB(varName: string): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16) / 255);
    return [r, g, b];
  }
  return [0.5, 0.5, 0.5];
}

function refreshColors() {
  const colors: SimColors = {
    stops: [cssRGB("--sim-0"), cssRGB("--sim-1"), cssRGB("--sim-2"), cssRGB("--sim-3")],
    line: cssRGB("--sim-line"),
  };
  matrixSim?.setColors(colors);
  singleSim?.setColors(colors);
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => requestAnimationFrame(refreshColors));

// ===== URL 同期 =====
let urlTimer: number | undefined;

function buildUrl(): string {
  const p = new URLSearchParams();
  if (models.length > 1) p.set("model", model.id);
  if (view === "single") {
    p.set("view", "single");
    p.set(xAxis.key, String(xVal));
    p.set(yAxis.key, String(yVal));
  }
  if (grid !== 8) p.set("grid", String(grid));
  if (speed !== 16) p.set("speed", String(speed));
  if (xRange[0] !== xAxis.defaultRange[0] || xRange[1] !== xAxis.defaultRange[1]) {
    p.set(`${xAxis.key}min`, String(xRange[0]));
    p.set(`${xAxis.key}max`, String(xRange[1]));
  }
  if (yRange[0] !== yAxis.defaultRange[0] || yRange[1] !== yAxis.defaultRange[1]) {
    p.set(`${yAxis.key}min`, String(yRange[0]));
    p.set(`${yAxis.key}max`, String(yRange[1]));
  }
  const q = p.toString();
  return location.pathname + (q ? `?${q}` : "") + location.hash;
}

function updateUrl(push = false) {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    if (push) history.pushState({ rd: true }, "", buildUrl());
    else history.replaceState(history.state, "", buildUrl());
  }, 100);
}

// ===== セグメントコントロール =====
function initSegment(el: HTMLElement, initial: string, onChange: (value: string) => void) {
  const options = [...el.querySelectorAll<HTMLButtonElement>(".segment__option")];
  let active: HTMLButtonElement | null = null;

  const move = (btn: HTMLButtonElement) => {
    el.style.setProperty("--thumb-x", `${btn.offsetLeft}px`);
    el.style.setProperty("--thumb-y", `${btn.offsetTop}px`);
    el.style.setProperty("--thumb-w", `${btn.offsetWidth}px`);
    el.style.setProperty("--thumb-h", `${btn.offsetHeight}px`);
  };

  const select = (value: string, fire: boolean) => {
    const btn = options.find((o) => o.dataset.value === value) ?? options[0];
    active = btn;
    for (const o of options) {
      o.classList.toggle("segment__option--active", o === btn);
      o.setAttribute("aria-pressed", String(o === btn));
    }
    move(btn);
    if (fire) onChange(value);
  };

  select(initial, false);
  requestAnimationFrame(() => el.classList.add("is-ready"));
  for (const btn of options) {
    btn.addEventListener("click", () => select(btn.dataset.value!, true));
  }
  // 表示/非表示やフォントロードでレイアウトが変わったら thumb を追従させる
  new ResizeObserver(() => active && move(active)).observe(el);
  return { select };
}

initSegment($("theme-segment"), storedTheme, (v) => applyTheme(v as Theme));
applyTheme(storedTheme);

initSegment($("grid-segment"), String(grid), (v) => {
  grid = Number(v);
  matrixSim?.setGrid(grid, grid);
  renderTicks();
  updateUrl();
});

initSegment($("speed-segment"), String(speed), (v) => {
  speed = Number(v);
  updateUrl();
});

// ===== 軸目盛 =====
function renderTicks() {
  xTicks.replaceChildren();
  yTicks.replaceChildren();
  for (let i = 0; i < grid; i++) {
    const t = grid > 1 ? i / (grid - 1) : 0;
    const xs = document.createElement("span");
    xs.textContent = fmt(lerp(xRange[0], xRange[1], t));
    xTicks.appendChild(xs);
    const ys = document.createElement("span");
    ys.textContent = fmt(lerp(yRange[0], yRange[1], t));
    yTicks.appendChild(ys);
  }
}

// ===== 範囲入力 (マトリックス) =====
const xMin = $<HTMLInputElement>("x-min");
const xMax = $<HTMLInputElement>("x-max");
const yMin = $<HTMLInputElement>("y-min");
const yMax = $<HTMLInputElement>("y-max");

for (const [input, axis] of [
  [xMin, xAxis], [xMax, xAxis], [yMin, yAxis], [yMax, yAxis],
] as const) {
  input.min = String(axis.min);
  input.max = String(axis.max);
  input.step = String(axis.step);
}

function syncRangeInputs() {
  xMin.value = String(xRange[0]);
  xMax.value = String(xRange[1]);
  yMin.value = String(yRange[0]);
  yMax.value = String(yRange[1]);
}

function onRangeChange() {
  let x0 = clamp(parseNum(xMin.value, xRange[0]), xAxis.min, xAxis.max);
  let x1 = clamp(parseNum(xMax.value, xRange[1]), xAxis.min, xAxis.max);
  let y0 = clamp(parseNum(yMin.value, yRange[0]), yAxis.min, yAxis.max);
  let y1 = clamp(parseNum(yMax.value, yRange[1]), yAxis.min, yAxis.max);
  if (x1 - x0 < xAxis.step) x1 = clamp(x0 + xAxis.step, xAxis.min, xAxis.max);
  if (y1 - y0 < yAxis.step) y1 = clamp(y0 + yAxis.step, yAxis.min, yAxis.max);
  xRange = [x0, x1];
  yRange = [y0, y1];
  syncRangeInputs();
  matrixSim?.setRanges(x0, x1, y0, y1);
  matrixSim?.seed();
  renderTicks();
  updateUrl();
}

for (const input of [xMin, xMax, yMin, yMax]) {
  input.addEventListener("change", onRangeChange);
}

// ===== 単体ビューのパラメータ入力 =====
const xSlider = $<HTMLInputElement>("x-slider");
const xNumber = $<HTMLInputElement>("x-number");
const ySlider = $<HTMLInputElement>("y-slider");
const yNumber = $<HTMLInputElement>("y-number");

for (const [input, axis] of [
  [xSlider, xAxis], [xNumber, xAxis], [ySlider, yAxis], [yNumber, yAxis],
] as const) {
  input.min = String(axis.min);
  input.max = String(axis.max);
  input.step = String(axis.step);
}

function syncSingleControls() {
  xSlider.value = String(xVal);
  xNumber.value = String(xVal);
  ySlider.value = String(yVal);
  yNumber.value = String(yVal);
  singleParams.textContent = `${yAxis.key} ${fmt(yVal)} / ${xAxis.key} ${fmt(xVal)}`;
}

function applySingleParams() {
  singleSim?.setRanges(xVal, xVal, yVal, yVal);
  singleParams.textContent = `${yAxis.key} ${fmt(yVal)} / ${xAxis.key} ${fmt(xVal)}`;
  updateUrl();
}

xSlider.addEventListener("input", () => {
  xVal = parseNum(xSlider.value, xVal);
  xNumber.value = xSlider.value;
  applySingleParams();
});
ySlider.addEventListener("input", () => {
  yVal = parseNum(ySlider.value, yVal);
  yNumber.value = ySlider.value;
  applySingleParams();
});
xNumber.addEventListener("change", () => {
  xVal = clamp(parseNum(xNumber.value, xVal), xAxis.min, xAxis.max);
  xNumber.value = String(xVal);
  xSlider.value = String(xVal);
  applySingleParams();
});
yNumber.addEventListener("change", () => {
  yVal = clamp(parseNum(yNumber.value, yVal), yAxis.min, yAxis.max);
  yNumber.value = String(yVal);
  ySlider.value = String(yVal);
  applySingleParams();
});

// ===== ビュー切替 =====
function setMode(mode: "matrix" | "single") {
  document.querySelectorAll<HTMLElement>("[data-only]").forEach((el) => {
    el.hidden = el.dataset.only !== mode;
  });
}

function setView(v: "matrix" | "single", push: boolean) {
  view = v;
  viewMatrix.hidden = v !== "matrix";
  viewSingle.hidden = v !== "single";
  setMode(v);
  updateUrl(push);
}

function openSingle(xv: number, yv: number, push: boolean) {
  // タイル位置からの補間値は浮動小数の端数が乗るので丸めてから使う
  xVal = Math.round(xv * 1e6) / 1e6;
  yVal = Math.round(yv * 1e6) / 1e6;
  singleSim?.setRanges(xVal, xVal, yVal, yVal);
  singleSim?.seed();
  syncSingleControls();
  setView("single", push);
}

$("back-button").addEventListener("click", () => setView("matrix", false));

window.addEventListener("popstate", () => {
  const p = new URLSearchParams(location.search);
  if (p.get("view") === "single") {
    const xv = clamp(parseNum(p.get(xAxis.key), xVal), xAxis.min, xAxis.max);
    const yv = clamp(parseNum(p.get(yAxis.key), yVal), yAxis.min, yAxis.max);
    openSingle(xv, yv, false);
  } else {
    setView("matrix", false);
  }
});

// ===== マトリックスの hover / クリック =====
function tileFromEvent(e: PointerEvent | MouseEvent) {
  const rect = matrixWrap.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = clamp(Math.floor((x / rect.width) * grid), 0, grid - 1);
  const rowFromTop = clamp(Math.floor((y / rect.height) * grid), 0, grid - 1);
  const row = grid - 1 - rowFromTop; // 行 0 は下端 (= 範囲の最小値)
  const t = grid > 1 ? 1 / (grid - 1) : 0;
  return {
    col, rowFromTop,
    xv: lerp(xRange[0], xRange[1], col * t),
    yv: lerp(yRange[0], yRange[1], row * t),
    rect, x, y,
  };
}

matrixWrap.addEventListener("pointermove", (e) => {
  const { col, rowFromTop, xv, yv, rect, x, y } = tileFromEvent(e);
  hoverBox.hidden = false;
  hoverBox.style.left = `${(col / grid) * 100}%`;
  hoverBox.style.top = `${(rowFromTop / grid) * 100}%`;
  hoverBox.style.width = `${100 / grid}%`;
  hoverBox.style.height = `${100 / grid}%`;

  tooltip.hidden = false;
  tooltip.textContent = `${yAxis.key} ${fmt(yv)} / ${xAxis.key} ${fmt(xv)}`;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  tooltip.style.left = `${clamp(x + 14, 0, rect.width - tw - 2)}px`;
  tooltip.style.top = `${clamp(y + 14, 0, rect.height - th - 2)}px`;
});

matrixWrap.addEventListener("pointerleave", () => {
  hoverBox.hidden = true;
  tooltip.hidden = true;
});

matrixWrap.addEventListener("click", (e) => {
  const { xv, yv } = tileFromEvent(e);
  openSingle(xv, yv, true);
});

// ===== 単体ビューのブラシ =====
let drawing = false;
let lastPos: { x: number; y: number } | null = null;

function brushPos(e: PointerEvent) {
  const rect = singleCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

singleCanvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  try {
    singleCanvas.setPointerCapture(e.pointerId);
  } catch {
    // 合成イベント等で pointerId が無効な場合は capture なしで続行
  }
  const p = brushPos(e);
  singleSim?.brush(p.x, p.y, 8);
  lastPos = p;
});
singleCanvas.addEventListener("pointermove", (e) => {
  if (!drawing || !lastPos) return;
  const p = brushPos(e);
  const dist = Math.hypot(p.x - lastPos.x, p.y - lastPos.y);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i <= steps; i++) {
    singleSim?.brush(lerp(lastPos.x, p.x, i / steps), lerp(lastPos.y, p.y, i / steps), 8);
  }
  lastPos = p;
});
for (const ev of ["pointerup", "pointercancel"] as const) {
  singleCanvas.addEventListener(ev, () => {
    drawing = false;
    lastPos = null;
  });
}

// ===== 再シード / 一時停止 =====
$("reseed-button").addEventListener("click", () => {
  (view === "single" ? singleSim : matrixSim)?.seed();
});

const pauseButton = $<HTMLButtonElement>("pause-button");
const pauseLabel = $("pause-label");
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseLabel.textContent = paused ? "再開" : "一時停止";
  pauseButton.setAttribute("aria-pressed", String(paused));
});

// ===== フッターの年表記 =====
{
  const y = new Date().getFullYear();
  const range = document.querySelector<HTMLElement>("[data-year-range]");
  const years = document.querySelector<HTMLElement>(".footer__years");
  if (range && years) {
    range.textContent = y > START_YEAR ? `${START_YEAR}–${y}` : String(START_YEAR);
    years.hidden = false;
  }
}

// ===== 初期化の仕上げ =====
syncRangeInputs();
syncSingleControls();
renderTicks();
refreshColors();
if (view === "single") {
  singleSim?.setRanges(xVal, xVal, yVal, yVal);
  setView("single", false);
} else {
  setView("matrix", false);
}
initSquircle();

// ===== メインループ =====
function frame() {
  const sim = view === "single" ? singleSim : matrixSim;
  if (sim) {
    if (!paused) sim.step(speed);
    sim.draw(view === "matrix");
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
