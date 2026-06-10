import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { initSquircle } from "./squircle";
import { Simulation, type RGB, type SimColors } from "./sim";
import { models, findModel, getParam, type RDModel } from "./models";
import { texToMathML } from "./mathml";

const MATRIX_TILE_RES = 128;
const SINGLE_TILE_RES = 384;
const GRID_CHOICES = [6, 8, 10];
const SPEED_CHOICES = [1, 2, 4];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a < 1) return v.toFixed(4);
  if (a < 100) return v.toFixed(3);
  return v.toFixed(1);
}

function parseNum(s: string | null | undefined, fallback: number): number {
  if (s === null || s === undefined || s === "") return fallback;
  const v = Number(s);
  return Number.isFinite(v) ? v : fallback;
}

// label に数式記号が紛れているとき (例: "励起振幅 a" + symbol "a") は記号を二重に
// 表示してしまうので、記号トークンを除いた名前部分だけを返す。記号は呼び出し側で
// .control-sym などのスタイル付きで別途付加する。
function paramName(p: { label: string; symbol: string }): string {
  const tokens = p.label.split(/\s+/);
  const i = tokens.lastIndexOf(p.symbol);
  return i < 0 ? p.label : tokens.filter((_, k) => k !== i).join(" ");
}

// ===== 状態 =====
const params = new URLSearchParams(location.search);
const model: RDModel = findModel(params.get("m"));

function axisKeyFrom(qs: string, fallback: string): string {
  const k = params.get(qs);
  if (k && model.params.some((p) => p.key === k && p.axisEligible)) return k;
  return fallback;
}

let xKey = axisKeyFrom("x", model.defaultXKey);
let yKey = axisKeyFrom("y", model.defaultYKey);
if (xKey === yKey) {
  // 重複したら別の軸候補へ
  const alt = model.params.find((p) => p.axisEligible && p.key !== xKey);
  yKey = alt ? alt.key : yKey;
}

function parseRange(qs: string, def: [number, number]): [number, number] {
  const raw = params.get(qs);
  if (!raw) return [...def];
  const [a, b] = raw.split(",").map(Number);
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) return [a, b];
  return [...def];
}

let xRange = parseRange("xr", getParam(model, xKey).axisRange);
let yRange = parseRange("yr", getParam(model, yKey).axisRange);

const values: Record<string, number> = {};
for (const p of model.params) {
  values[p.key] = clamp(parseNum(params.get(`p_${p.key}`), p.default), p.min, p.max);
}

let view: "matrix" | "single" = params.get("v") === "single" ? "single" : "matrix";
// 分割数は軸ごと。旧 URL の g は両軸に適用する
function parseGridParam(qs: string): number {
  for (const raw of [params.get(qs), params.get("g")]) {
    const v = Number(raw);
    if (GRID_CHOICES.includes(v)) return v;
  }
  return 8;
}
let gridX = parseGridParam("gx");
let gridY = parseGridParam("gy");
let speed = SPEED_CHOICES.includes(Number(params.get("s"))) ? Number(params.get("s")) : 2;
let paused = false;

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
const paramControls = $("param-controls");
const xAxisLabel = $("x-axis-label");
const yAxisLabel = $("y-axis-label");

// ===== モデル選択 =====
const modelSelect = $<HTMLSelectElement>("model-select");
for (const m of models) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  modelSelect.appendChild(opt);
}
modelSelect.value = model.id;
modelSelect.addEventListener("change", () => {
  // モデルはパラメータもシェーダも別物なのでリロードで作り直す
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("m", modelSelect.value);
  location.href = url.toString();
});

// ===== モデル情報 (式と解説) =====
function renderModelInfo() {
  const info = $("model-info");
  info.replaceChildren();
  for (const eq of model.equations) {
    const e = document.createElement("div");
    e.className = "model-info__eq";
    // equations は LaTeX サブセット。ネイティブ MathML に変換して描画する
    e.innerHTML = texToMathML(eq);
    info.appendChild(e);
  }
  const desc = document.createElement("p");
  desc.className = "model-info__desc";
  desc.textContent = model.description;
  info.appendChild(desc);
  const sp = document.createElement("p");
  sp.className = "model-info__desc model-info__desc--sub";
  sp.textContent = model.speciesNote;
  info.appendChild(sp);
}

// ===== 軸セレクタ =====
const xAxisSelect = $<HTMLSelectElement>("x-axis-select");
const yAxisSelect = $<HTMLSelectElement>("y-axis-select");

function fillAxisSelect(sel: HTMLSelectElement, selectedKey: string) {
  sel.replaceChildren();
  for (const p of model.params) {
    if (!p.axisEligible) continue;
    const opt = document.createElement("option");
    opt.value = p.key;
    opt.textContent = `${paramName(p)} (${p.symbol})`;
    sel.appendChild(opt);
  }
  sel.value = selectedKey;
}

function onAxisChange(which: "x" | "y", newKey: string) {
  if (which === "x") {
    if (newKey === yKey) yKey = xKey; // 入れ替え
    xKey = newKey;
  } else {
    if (newKey === xKey) xKey = yKey;
    yKey = newKey;
  }
  xRange = [...getParam(model, xKey).axisRange];
  yRange = [...getParam(model, yKey).axisRange];
  fillAxisSelect(xAxisSelect, xKey);
  fillAxisSelect(yAxisSelect, yKey);
  renderParamControls();
  renderTicks();
  updateAxisLabels();
  pushToSims();
  matrixSim?.seed();
  updateUrl();
}

xAxisSelect.addEventListener("change", () => onAxisChange("x", xAxisSelect.value));
yAxisSelect.addEventListener("change", () => onAxisChange("y", yAxisSelect.value));

function updateAxisLabels() {
  const px = getParam(model, xKey);
  const py = getParam(model, yKey);
  xAxisLabel.textContent = `${paramName(px)} (${px.symbol})`;
  yAxisLabel.textContent = `${paramName(py)} (${py.symbol})`;
}

// ===== パラメータコントロール (動的生成) =====
function makeControlGroup(): HTMLDivElement {
  const g = document.createElement("div");
  g.className = "control-group";
  return g;
}

function renderParamControls() {
  paramControls.replaceChildren();
  for (const p of model.params) {
    const isAxis = p.key === xKey || p.key === yKey;
    const asRange = view === "matrix" && isAxis;
    const g = makeControlGroup();

    const label = document.createElement("span");
    label.className = "control-label";
    if (asRange) {
      const which = p.key === xKey ? "横軸 X" : "縦軸 Y";
      label.innerHTML = `${paramName(p)} <span class="control-sym">${p.symbol}</span> <span class="control-axis-tag">${which}</span>`;
    } else {
      label.innerHTML = `${paramName(p)} <span class="control-sym">${p.symbol}</span>`;
    }
    g.appendChild(label);

    if (asRange) {
      const range = p.key === xKey ? xRange : yRange;
      const row = document.createElement("div");
      row.className = "range-row";
      const mkNum = (val: number, isMin: boolean) => {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.className = "input input--num";
        inp.inputMode = "decimal";
        inp.min = String(p.min);
        inp.max = String(p.max);
        inp.step = String(p.step);
        inp.value = String(val);
        inp.setAttribute("aria-label", `${p.label} ${isMin ? "最小値" : "最大値"}`);
        inp.addEventListener("change", () => onRangeChange(p.key));
        return inp;
      };
      const minInput = mkNum(range[0], true);
      const maxInput = mkNum(range[1], false);
      const sep = document.createElement("span");
      sep.className = "range-row__sep";
      sep.textContent = "–";
      row.append(minInput, sep, maxInput);
      g.appendChild(row);
      g.dataset.rangeKey = p.key;
    } else {
      const row = document.createElement("div");
      row.className = "slider-row";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(p.min);
      slider.max = String(p.max);
      slider.step = String(p.step);
      slider.value = String(values[p.key]);
      slider.setAttribute("aria-label", `${p.label} スライダー`);
      const num = document.createElement("input");
      num.type = "number";
      num.className = "input input--num";
      num.inputMode = "decimal";
      num.min = String(p.min);
      num.max = String(p.max);
      num.step = String(p.step);
      num.value = String(values[p.key]);
      slider.addEventListener("input", () => {
        values[p.key] = parseNum(slider.value, values[p.key]);
        num.value = slider.value;
        onValueChange();
      });
      num.addEventListener("change", () => {
        const v = clamp(parseNum(num.value, values[p.key]), p.min, p.max);
        values[p.key] = v;
        num.value = String(v);
        slider.value = String(v);
        onValueChange();
      });
      row.append(slider, num);
      g.appendChild(row);
    }

    const desc = document.createElement("p");
    desc.className = "control-desc";
    desc.textContent = p.description;
    g.appendChild(desc);

    paramControls.appendChild(g);
  }
}

function readRangeInputs(key: string): [number, number] {
  const g = paramControls.querySelector<HTMLElement>(`[data-range-key="${key}"]`);
  const inputs = g?.querySelectorAll<HTMLInputElement>(".input--num");
  if (!inputs || inputs.length < 2) return key === xKey ? xRange : yRange;
  return [Number(inputs[0].value), Number(inputs[1].value)];
}

function onRangeChange(key: string) {
  const p = getParam(model, key);
  let [lo, hi] = readRangeInputs(key);
  lo = clamp(parseNum(String(lo), p.axisRange[0]), p.min, p.max);
  hi = clamp(parseNum(String(hi), p.axisRange[1]), p.min, p.max);
  if (hi - lo < p.step) hi = clamp(lo + p.step, p.min, p.max);
  if (key === xKey) xRange = [lo, hi];
  else yRange = [lo, hi];
  // 入力欄を正規化後の値に同期
  const g = paramControls.querySelector<HTMLElement>(`[data-range-key="${key}"]`);
  const inputs = g?.querySelectorAll<HTMLInputElement>(".input--num");
  if (inputs && inputs.length >= 2) {
    inputs[0].value = String(lo);
    inputs[1].value = String(hi);
  }
  pushToSims();
  matrixSim?.seed();
  renderTicks();
  updateUrl();
}

function onValueChange() {
  pushToSims();
  updateUrl();
}

// ===== シミュレーション =====
let matrixSim: Simulation | null = null;
let singleSim: Simulation | null = null;

try {
  const rs = model.resScale ?? 1;
  const matrixRes = Math.max(32, Math.round(MATRIX_TILE_RES * rs));
  const singleRes = Math.max(96, Math.round(SINGLE_TILE_RES * rs));
  matrixSim = new Simulation(matrixCanvas, model, gridX, gridY, matrixRes);
  singleSim = new Simulation(singleCanvas, model, 1, 1, singleRes);
} catch (e) {
  viewMatrix.hidden = true;
  viewSingle.hidden = true;
  controls.hidden = true;
  viewError.hidden = false;
  $("error-message").textContent = e instanceof Error ? e.message : String(e);
}

function pushToSims() {
  if (matrixSim) {
    matrixSim.setAxisKeys(xKey, yKey);
    matrixSim.setRanges(xRange[0], xRange[1], yRange[0], yRange[1]);
    for (const p of model.params) matrixSim.setFixed(p.key, values[p.key]);
  }
  if (singleSim) {
    singleSim.setAxisKeys(xKey, yKey);
    singleSim.setRanges(values[xKey], values[xKey], values[yKey], values[yKey]);
    for (const p of model.params) singleSim.setFixed(p.key, values[p.key]);
  }
}

// ===== 色 =====
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

// ===== URL 同期 =====
let urlTimer: number | undefined;
function buildUrl(): string {
  const p = new URLSearchParams();
  if (models.length > 1) p.set("m", model.id);
  if (view === "single") p.set("v", "single");
  if (xKey !== model.defaultXKey) p.set("x", xKey);
  if (yKey !== model.defaultYKey) p.set("y", yKey);
  const dx = getParam(model, xKey).axisRange;
  const dy = getParam(model, yKey).axisRange;
  if (xRange[0] !== dx[0] || xRange[1] !== dx[1]) p.set("xr", `${xRange[0]},${xRange[1]}`);
  if (yRange[0] !== dy[0] || yRange[1] !== dy[1]) p.set("yr", `${yRange[0]},${yRange[1]}`);
  if (gridX !== 8) p.set("gx", String(gridX));
  if (gridY !== 8) p.set("gy", String(gridY));
  if (speed !== 2) p.set("s", String(speed));
  for (const param of model.params) {
    if (values[param.key] !== param.default) p.set(`p_${param.key}`, String(values[param.key]));
  }
  const q = p.toString();
  return location.pathname + (q ? `?${q}` : "") + location.hash;
}

function updateUrl(push = false) {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    if (push) history.pushState({ rd: true }, "", buildUrl());
    else history.replaceState(history.state, "", buildUrl());
  }, 120);
}

// ===== セグメントコントロール =====
function initSegment(el: HTMLElement, initial: string, onChange: (value: string) => void) {
  const options = [...el.querySelectorAll<HTMLButtonElement>(".segment__option")];
  let active: HTMLButtonElement | null = null;
  let wasHidden = false;
  const move = (btn: HTMLButtonElement) => {
    // display:none 中は 0 が計測される。書き込まずに保持し、
    // 再表示直後の 1 回はアニメーションなしで配置する (thumb の飛び込み防止)
    if (!el.offsetWidth) {
      wasHidden = true;
      return;
    }
    if (wasHidden) {
      wasHidden = false;
      el.classList.remove("is-ready");
      requestAnimationFrame(() => el.classList.add("is-ready"));
    }
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
  for (const btn of options) btn.addEventListener("click", () => select(btn.dataset.value!, true));
  new ResizeObserver(() => active && move(active)).observe(el);
  return { select };
}

initSegment($("theme-segment"), storedTheme, (v) => applyTheme(v as Theme));
applyTheme(storedTheme);

function applyGrid() {
  matrixSim?.setGrid(gridX, gridY);
  renderTicks();
  fitCanvases(); // 縦横比が変わる
  updateUrl();
}

initSegment($("x-grid-segment"), String(gridX), (v) => {
  gridX = Number(v);
  applyGrid();
});

initSegment($("y-grid-segment"), String(gridY), (v) => {
  gridY = Number(v);
  applyGrid();
});

initSegment($("speed-segment"), String(speed), (v) => {
  speed = Number(v);
  updateUrl();
});

// ===== 軸目盛 =====
function renderTicks() {
  xTicks.replaceChildren();
  yTicks.replaceChildren();
  for (let i = 0; i < gridX; i++) {
    const t = gridX > 1 ? i / (gridX - 1) : 0;
    const xs = document.createElement("span");
    xs.textContent = fmt(lerp(xRange[0], xRange[1], t));
    xTicks.appendChild(xs);
  }
  for (let i = 0; i < gridY; i++) {
    const t = gridY > 1 ? i / (gridY - 1) : 0;
    const ys = document.createElement("span");
    ys.textContent = fmt(lerp(yRange[0], yRange[1], t));
    yTicks.appendChild(ys);
  }
}

// ===== キャンバスを画面の縦幅に収める =====
// 2 カラムレイアウト時はページをスクロールさせず、キャンバスの一辺を
// 「ステージの高さからカード内のキャンバス以外の高さを引いた値」と
// 利用可能な幅の小さい方に合わせる。1 カラム時は従来どおり幅いっぱい。
// app.css のページ固定モードの media query と一致させること
const desktopLayout = matchMedia("(min-width: 1024px) and (min-height: 480px)");
const stageEl = document.querySelector<HTMLElement>(".main__stage")!;
const matrixEl = document.querySelector<HTMLElement>(".matrix")!;
const matrixHint = viewMatrix.querySelector<HTMLElement>(".view-card__hint")!;
const matrixCanvasArea = viewMatrix.querySelector<HTMLElement>(".view-card__canvas")!;
const singleWrap = viewSingle.querySelector<HTMLElement>(".single__canvas-wrap")!;
const singleCanvasArea = viewSingle.querySelector<HTMLElement>(".view-card__canvas")!;

function fitCanvases() {
  // 縦横の分割数が違ってもタイルが正方形になるようにキャンバスの縦横比を合わせる
  matrixEl.style.setProperty("--matrix-aspect", `${gridX} / ${gridY}`);
  if (!desktopLayout.matches) {
    matrixEl.style.removeProperty("--matrix-size");
    singleWrap.style.removeProperty("width");
    return;
  }
  // view-card__canvas はヒント / バーを除いた中央領域。その実寸に収める
  if (!viewMatrix.hidden) {
    const availH = matrixCanvasArea.clientHeight;
    // 目盛・軸ラベルの高さ (キャンバスサイズに依存しない)
    const chromeV = matrixEl.offsetHeight - matrixWrap.offsetHeight;
    // 幅は軸ラベル・目盛の右端からカード右端 (= ヒント右端) まで
    const availW = matrixHint.getBoundingClientRect().right - matrixWrap.getBoundingClientRect().left;
    // --matrix-size は幅。高さは aspect-ratio (gridX/gridY) で決まる
    const size = Math.max(120, Math.floor(Math.min(availW, (availH - chromeV) * (gridX / gridY))));
    matrixEl.style.setProperty("--matrix-size", `${size}px`);
  }
  if (!viewSingle.hidden) {
    const size = Math.max(120, Math.floor(Math.min(singleCanvasArea.clientWidth, singleCanvasArea.clientHeight)));
    singleWrap.style.width = `${size}px`;
  }
}

desktopLayout.addEventListener("change", fitCanvases);
new ResizeObserver(fitCanvases).observe(stageEl);
// 目盛ラベルの幅が変わると左の余白が変わる。fitCanvases は yTicks 自身の高さ
// (= --matrix-size) を変えるため、同一サイクルで処理するとループエラーになる。
// rAF で次フレームにずらす
new ResizeObserver(() => requestAnimationFrame(fitCanvases)).observe(yTicks);

// ===== ビュー切替 =====
function setMode(mode: "matrix" | "single") {
  document.querySelectorAll<HTMLElement>("[data-only]").forEach((el) => {
    el.hidden = el.dataset.only !== mode;
  });
}

function paramSummary(): string {
  return `${getParam(model, yKey).symbol} ${fmt(values[yKey])} / ${getParam(model, xKey).symbol} ${fmt(values[xKey])}`;
}

function setView(v: "matrix" | "single", push: boolean) {
  view = v;
  viewMatrix.hidden = v !== "matrix";
  viewSingle.hidden = v !== "single";
  setMode(v);
  renderParamControls(); // 軸パラメータが range↔slider で切り替わる
  if (v === "single") singleParams.textContent = paramSummary();
  fitCanvases();
  updateUrl(push);
}

function openSingle(xv: number, yv: number, push: boolean) {
  values[xKey] = Math.round(xv * 1e6) / 1e6;
  values[yKey] = Math.round(yv * 1e6) / 1e6;
  pushToSims();
  singleSim?.seed();
  setView("single", push);
}

$("back-button").addEventListener("click", () => setView("matrix", false));

window.addEventListener("popstate", () => {
  const p = new URLSearchParams(location.search);
  if ((p.get("m") ?? model.id) !== model.id) {
    location.reload();
    return;
  }
  view = p.get("v") === "single" ? "single" : "matrix";
  if (view === "single") {
    values[xKey] = clamp(parseNum(p.get(`p_${xKey}`), values[xKey]), getParam(model, xKey).min, getParam(model, xKey).max);
    values[yKey] = clamp(parseNum(p.get(`p_${yKey}`), values[yKey]), getParam(model, yKey).min, getParam(model, yKey).max);
    pushToSims();
    singleSim?.seed();
  }
  setView(view, false);
});

// ===== マトリックスの hover / クリック =====
function tileFromEvent(e: PointerEvent | MouseEvent) {
  const rect = matrixWrap.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = clamp(Math.floor((x / rect.width) * gridX), 0, gridX - 1);
  const rowFromTop = clamp(Math.floor((y / rect.height) * gridY), 0, gridY - 1);
  const row = gridY - 1 - rowFromTop; // 行 0 は下端 (= 範囲の最小値)
  const tx = gridX > 1 ? 1 / (gridX - 1) : 0;
  const ty = gridY > 1 ? 1 / (gridY - 1) : 0;
  return {
    col, rowFromTop,
    xv: lerp(xRange[0], xRange[1], col * tx),
    yv: lerp(yRange[0], yRange[1], row * ty),
    rect, x, y,
  };
}

matrixWrap.addEventListener("pointermove", (e) => {
  const { col, rowFromTop, xv, yv, rect, x, y } = tileFromEvent(e);
  hoverBox.hidden = false;
  hoverBox.style.left = `${(col / gridX) * 100}%`;
  hoverBox.style.top = `${(rowFromTop / gridY) * 100}%`;
  hoverBox.style.width = `${100 / gridX}%`;
  hoverBox.style.height = `${100 / gridY}%`;

  tooltip.hidden = false;
  tooltip.textContent = `${getParam(model, yKey).symbol} ${fmt(yv)} / ${getParam(model, xKey).symbol} ${fmt(xv)}`;
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
const pauseIcon = $("pause-icon");
const playIcon = $("play-icon");
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseIcon.toggleAttribute("hidden", paused);
  playIcon.toggleAttribute("hidden", !paused);
  const label = paused ? "再開" : "一時停止";
  pauseButton.setAttribute("aria-label", label);
  pauseButton.title = label;
  pauseButton.setAttribute("aria-pressed", String(paused));
});

// ===== 初期化 =====
renderModelInfo();
fillAxisSelect(xAxisSelect, xKey);
fillAxisSelect(yAxisSelect, yKey);
updateAxisLabels();
renderTicks();
refreshColors();
pushToSims();
if (view === "single") {
  singleSim?.seed();
}
// シミュレーションを作れなかったときはエラービューのまま (setView が viewMatrix を再表示してしまう)
if (matrixSim) setView(view, false);
initSquircle();

// ===== メインループ =====
// 反応サブサイクル (reactionSubsteps) はシェーダ内のループで回るため、その分だけ
// テクスチャパス (高価な 9 点フェッチ) の回数を減らす。総反応ステップ数
// (= 1 フレームで進む時間) は stepsBase のまま保たれる。R は sim.ts と同じ式で導出する。
const reactionSubsteps = Math.max(1, Math.round(model.reactionSubsteps ?? 1));
const outerStepsBase = Math.max(1, Math.ceil((model.stepsBase ?? 8) / reactionSubsteps));

function frame() {
  const sim = view === "single" ? singleSim : matrixSim;
  if (sim) {
    if (!paused) sim.step(outerStepsBase * speed);
    sim.draw(view === "matrix");
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
