import type { RDModel } from "./models";

/**
 * タイル分割された反応拡散シミュレーション。
 *
 * 1 枚の RGBA float テクスチャ (最大 4 成分) を cols×rows のタイルに分割し、各
 * タイルが軸範囲から線形補間した固有のパラメータを持つ。タイル内はトーラス境界
 * (wrap) なので隣のタイルへ漏れない。cols=rows=1 で単体ビューとしても使う。
 *
 * パラメータは「軸に乗っている 2 つ」(タイル位置から補間) と「固定値の残り」
 * (uniform) に分かれる。軸の選択を変えると sim / seed シェーダを作り直す。
 */

const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** sim と seed で共通の「タイル位置 → パラメータ」プロローグを生成する */
function paramPrologue(model: RDModel, xKey: string, yKey: string) {
  const fixedKeys = model.params.map((p) => p.key).filter((k) => k !== xKey && k !== yKey);
  const fixedUniforms = fixedKeys.map((k) => `uniform float P_${k};`).join("\n");
  const decls = model.params
    .map((p) => {
      if (p.key === xKey) return `  float ${p.key} = mix(uXRange.x, uXRange.y, fx);`;
      if (p.key === yKey) return `  float ${p.key} = mix(uYRange.x, uYRange.y, fy);`;
      return `  float ${p.key} = P_${p.key};`;
    })
    .join("\n");
  return { fixedKeys, fixedUniforms, decls };
}

function simFrag(model: RDModel, xKey: string, yKey: string): { src: string; fixedKeys: string[] } {
  const { fixedKeys, fixedUniforms, decls } = paramPrologue(model, xKey, yKey);
  // 勾配 gx/gy は走化性など一部のモデルしか使わない。使うモデルだけで計算する。
  const usesGrad = /\bg[xy]\b/.test(model.updateGlsl);
  const gradLines = usesGrad
    ? "\n  vec4 gx = (nE - nW) * 0.5;\n  vec4 gy = (nN - nS) * 0.5;"
    : "";
  // 演算子分割: 反応剛性モデルはラプラシアン (高価な近傍フェッチ) を固定したまま
  // 反応項を R 回サブサイクルする。R=1 は従来どおり 1 回更新するだけ。
  const R = Math.max(1, Math.round(model.reactionSubsteps ?? 1));
  const updateBody =
    R > 1
      ? `  vec4 rdState = c;
  for (int rdi = 0; rdi < ${R}; rdi++) {
    vec4 c = rdState;
${model.updateGlsl}
    rdState = next;
  }
  outColor = rdState;`
      : `${model.updateGlsl}

  outColor = next;`;
  const src = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform ivec2 uGrid;
uniform int uTileRes;
uniform vec2 uXRange;
uniform vec2 uYRange;
uniform float uDt;
${fixedUniforms}
out vec4 outColor;

ivec2 wrapT(ivec2 tx, ivec2 origin, int size) {
  ivec2 local = (tx - origin + size) % size;
  return origin + local;
}
vec4 stt(ivec2 tx) { return texelFetch(uState, tx, 0); }

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  ivec2 tile = texel / uTileRes;
  ivec2 origin = tile * uTileRes;

  vec4 c  = stt(texel);
  vec4 nN = stt(wrapT(texel + ivec2( 0,  1), origin, uTileRes));
  vec4 nS = stt(wrapT(texel + ivec2( 0, -1), origin, uTileRes));
  vec4 nE = stt(wrapT(texel + ivec2( 1,  0), origin, uTileRes));
  vec4 nW = stt(wrapT(texel + ivec2(-1,  0), origin, uTileRes));
  vec4 nNE = stt(wrapT(texel + ivec2( 1,  1), origin, uTileRes));
  vec4 nNW = stt(wrapT(texel + ivec2(-1,  1), origin, uTileRes));
  vec4 nSE = stt(wrapT(texel + ivec2( 1, -1), origin, uTileRes));
  vec4 nSW = stt(wrapT(texel + ivec2(-1, -1), origin, uTileRes));

  vec4 lap = -c + 0.2 * (nN + nS + nE + nW) + 0.05 * (nNE + nNW + nSE + nSW);${gradLines}

  vec2 gmax = max(vec2(uGrid) - 1.0, vec2(1.0));
  float fx = float(tile.x) / gmax.x;
  float fy = float(tile.y) / gmax.y;
${decls}

${updateBody}
}
`;
  return { src, fixedKeys };
}

function seedFrag(model: RDModel, xKey: string, yKey: string): string {
  const { fixedUniforms, decls } = paramPrologue(model, xKey, yKey);
  return /* glsl */ `#version 300 es
precision highp float;
uniform ivec2 uGrid;
uniform int uTileRes;
uniform vec2 uXRange;
uniform vec2 uYRange;
uniform float uSeed;
${fixedUniforms}
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 7.31) * 43758.5453); }

void main() {
  vec2 texel = gl_FragCoord.xy;
  float res = float(uTileRes);
  vec2 tileF = floor(texel / res);
  ivec2 tile = ivec2(tileF);
  vec2 local = texel - tileF * res;
  vec2 pos = local / res;
  float dc = length(pos - 0.5) * 2.0;

  float n1 = hash(texel + 1.7);
  float n2 = hash(texel + 9.3);
  float n3 = hash(texel + 27.11);
  float n4 = hash(texel + 51.9);
  float t1 = hash(tileF + 3.7);
  float t2 = hash(tileF + 11.3);
  float t3 = hash(tileF + 23.9);
  float t4 = hash(tileF + 41.1);

  vec2 gmax = max(vec2(uGrid) - 1.0, vec2(1.0));
  float fx = float(tile.x) / gmax.x;
  float fy = float(tile.y) / gmax.y;
${decls}

${model.seedGlsl}

  outColor = seed;
}
`;
}

const BRUSH_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uPoint;
uniform float uRadius;
uniform int uChannel;
uniform float uValue;
out vec4 outColor;

void main() {
  vec4 s = texelFetch(uState, ivec2(gl_FragCoord.xy), 0);
  float d = length(gl_FragCoord.xy - uPoint);
  float m = (1.0 - smoothstep(uRadius * 0.5, uRadius, d)) * uValue;
  if (uChannel == 0) s.r = max(s.r, m);
  else if (uChannel == 2) s.b = max(s.b, m);
  else if (uChannel == 3) s.a = max(s.a, m);
  else s.g = max(s.g, m);
  outColor = s;
}
`;

function displayFrag(model: RDModel): string {
  return /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uGrid;
uniform vec2 uCanvas;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uLine;
uniform float uGapPx;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uCanvas;
  vec4 s = texture(uState, uv);
${model.displayGlsl}
  float tc = clamp(t, 0.0, 1.0);
  vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.45, tc));
  col = mix(col, uC2, smoothstep(0.40, 0.78, tc));
  col = mix(col, uC3, smoothstep(0.72, 1.0, tc));

  if (uGapPx > 0.0) {
    vec2 tilePx = uCanvas / uGrid;
    vec2 inTile = mod(gl_FragCoord.xy, tilePx);
    float dEdge = min(min(inTile.x, tilePx.x - inTile.x),
                      min(inTile.y, tilePx.y - inTile.y));
    float line = 1.0 - smoothstep(uGapPx * 0.5, uGapPx * 0.5 + 1.0, dEdge);
    col = mix(col, uLine, line);
  }
  outColor = vec4(col, 1.0);
}
`;
}

interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

export type RGB = [number, number, number];
export interface SimColors {
  stops: [RGB, RGB, RGB, RGB];
  line: RGB;
}

export class Simulation {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private model: RDModel;

  private cols: number;
  private rows: number;
  private tileRes: number;

  private texInternalFormat: number;
  private texType: number;
  private filterable: boolean;

  private textures: WebGLTexture[] = [];
  private fbos: WebGLFramebuffer[] = [];
  private src = 0;

  private pSim!: Program;
  private pSeed!: Program;
  private pBrush: Program;
  private pDisplay: Program;

  private xKey: string;
  private yKey: string;
  private fixedKeys: string[] = [];
  private fixed: Record<string, number> = {};

  private xRange: [number, number];
  private yRange: [number, number];
  private seedCounter = 0;
  private colors: SimColors = {
    stops: [
      [0.98, 0.976, 0.969],
      [0.714, 0.776, 0.71],
      [0.357, 0.478, 0.357],
      [0.137, 0.212, 0.165],
    ],
    line: [0.906, 0.894, 0.875],
  };

  constructor(canvas: HTMLCanvasElement, model: RDModel, cols: number, rows: number, tileRes: number) {
    this.canvas = canvas;
    this.model = model;
    this.cols = cols;
    this.rows = rows;
    this.tileRes = tileRes;
    this.xKey = model.defaultXKey;
    this.yKey = model.defaultYKey;
    for (const p of model.params) this.fixed[p.key] = p.default;
    this.xRange = [...this.axisRange(this.xKey)];
    this.yRange = [...this.axisRange(this.yKey)];

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error("このブラウザでは WebGL2 を利用できません。");
    this.gl = gl;

    if (gl.getExtension("EXT_color_buffer_float")) {
      this.texInternalFormat = gl.RGBA32F;
      this.texType = gl.FLOAT;
      this.filterable = !!gl.getExtension("OES_texture_float_linear");
    } else if (gl.getExtension("EXT_color_buffer_half_float")) {
      this.texInternalFormat = gl.RGBA16F;
      this.texType = gl.HALF_FLOAT;
      this.filterable = true;
    } else {
      throw new Error("このブラウザ / GPU では float テクスチャへの描画ができません。");
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.buildPrograms();
    this.pBrush = this.compile(BRUSH_FRAG, ["uState", "uPoint", "uRadius", "uChannel", "uValue"]);
    this.pDisplay = this.compile(displayFrag(model), [
      "uState", "uGrid", "uCanvas", "uC0", "uC1", "uC2", "uC3", "uLine", "uGapPx",
    ]);

    this.allocTextures();
    this.seed();
  }

  get texWidth() { return this.cols * this.tileRes; }
  get texHeight() { return this.rows * this.tileRes; }

  private axisRange(key: string): [number, number] {
    return this.model.params.find((x) => x.key === key)!.axisRange;
  }

  private buildPrograms() {
    const sim = simFrag(this.model, this.xKey, this.yKey);
    this.fixedKeys = sim.fixedKeys;
    const fixedUniforms = sim.fixedKeys.map((k) => `P_${k}`);
    this.pSim = this.compile(sim.src, ["uState", "uGrid", "uTileRes", "uXRange", "uYRange", "uDt", ...fixedUniforms]);
    const seedSrc = seedFrag(this.model, this.xKey, this.yKey);
    this.pSeed = this.compile(seedSrc, ["uGrid", "uTileRes", "uXRange", "uYRange", "uSeed", ...fixedUniforms]);
  }

  private compile(fragSrc: string, uniformNames: string[]): Program {
    const gl = this.gl;
    const make = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`シェーダのコンパイルに失敗しました: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, make(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`シェーダのリンクに失敗しました: ${gl.getProgramInfoLog(prog)}`);
    }
    const u: Program["u"] = {};
    for (const name of uniformNames) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u };
  }

  private allocTextures() {
    const gl = this.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    for (const f of this.fbos) gl.deleteFramebuffer(f);
    this.textures = [];
    this.fbos = [];

    const filter = this.filterable ? gl.LINEAR : gl.NEAREST;
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, this.texInternalFormat, this.texWidth, this.texHeight, 0, gl.RGBA, this.texType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("フレームバッファを作成できませんでした。");
      }
      this.textures.push(tex);
      this.fbos.push(fbo);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.src = 0;
  }

  setGrid(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.allocTextures();
    this.seed();
  }

  setAxisKeys(xKey: string, yKey: string) {
    if (xKey === this.xKey && yKey === this.yKey) return;
    this.xKey = xKey;
    this.yKey = yKey;
    this.buildPrograms();
    this.seed();
  }

  setRanges(x0: number, x1: number, y0: number, y1: number) {
    this.xRange = [x0, x1];
    this.yRange = [y0, y1];
  }

  setFixed(key: string, value: number) {
    this.fixed[key] = value;
  }

  setColors(colors: SimColors) {
    this.colors = colors;
  }

  private setParamUniforms(p: Program) {
    const gl = this.gl;
    gl.uniform2i(p.u.uGrid, this.cols, this.rows);
    gl.uniform1i(p.u.uTileRes, this.tileRes);
    gl.uniform2f(p.u.uXRange, this.xRange[0], this.xRange[1]);
    gl.uniform2f(p.u.uYRange, this.yRange[0], this.yRange[1]);
    for (const k of this.fixedKeys) {
      const loc = p.u[`P_${k}`];
      if (loc) gl.uniform1f(loc, this.fixed[k]);
    }
  }

  seed() {
    const gl = this.gl;
    this.seedCounter++;
    gl.useProgram(this.pSeed.prog);
    this.setParamUniforms(this.pSeed);
    gl.uniform1f(this.pSeed.u.uSeed, this.seedCounter * 0.618);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.src]);
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  step(n: number) {
    const gl = this.gl;
    gl.useProgram(this.pSim.prog);
    gl.uniform1i(this.pSim.u.uState, 0);
    // uDt は常に「反応 1 サブステップ」の刻み (= model.dt)。reactionSubsteps>1 でも
    // ここを dt_frame に拡大してはいけない。剛性モデルの反応は線形安定ではなく毎ステップ
    // clamp で抑えているだけなので、刻みを大きくすると発散する。高速化はパス数削減で行う。
    gl.uniform1f(this.pSim.u.uDt, this.model.dt);
    this.setParamUniforms(this.pSim);
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < n; i++) {
      const dst = 1 - this.src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[dst]);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[this.src]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.src = dst;
    }
  }

  brush(cssX: number, cssY: number, radiusTexels = 6) {
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const tx = (cssX / rect.width) * this.texWidth;
    const ty = (1 - cssY / rect.height) * this.texHeight;

    const dst = 1 - this.src;
    gl.useProgram(this.pBrush.prog);
    gl.uniform1i(this.pBrush.u.uState, 0);
    gl.uniform2f(this.pBrush.u.uPoint, tx, ty);
    gl.uniform1f(this.pBrush.u.uRadius, radiusTexels);
    gl.uniform1i(this.pBrush.u.uChannel, this.model.brushChannel ?? 1);
    gl.uniform1f(this.pBrush.u.uValue, this.model.brushValue ?? 0.9);
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[dst]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.src]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.src = dst;
  }

  draw(showGrid: boolean) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const { stops, line } = this.colors;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pDisplay.prog);
    gl.uniform1i(this.pDisplay.u.uState, 0);
    gl.uniform2f(this.pDisplay.u.uGrid, this.cols, this.rows);
    gl.uniform2f(this.pDisplay.u.uCanvas, w, h);
    gl.uniform3fv(this.pDisplay.u.uC0, stops[0]);
    gl.uniform3fv(this.pDisplay.u.uC1, stops[1]);
    gl.uniform3fv(this.pDisplay.u.uC2, stops[2]);
    gl.uniform3fv(this.pDisplay.u.uC3, stops[3]);
    gl.uniform3fv(this.pDisplay.u.uLine, line);
    gl.uniform1f(this.pDisplay.u.uGapPx, showGrid ? Math.max(1, dpr) : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.src]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
