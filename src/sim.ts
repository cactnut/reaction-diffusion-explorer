import type { RDModel } from "./models";

/**
 * タイル分割された反応拡散シミュレーション。
 *
 * 1 枚の float テクスチャを cols×rows のタイルに分割し、各タイルが
 * 軸範囲から線形補間した固有のパラメータ (px, py) を持つ。タイル内は
 * トーラス境界 (wrap) なので隣のタイルへ漏れない。
 * cols=rows=1 にすると単体ビューとしてそのまま使える。
 */

const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

function simFrag(model: RDModel): string {
  return /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform ivec2 uGrid;
uniform int uTileRes;
uniform vec2 uXRange;
uniform vec2 uYRange;
uniform float uDt;
out vec4 outColor;

// タイル内トーラス境界。オフセットは ±1 texel なので +size で必ず正になる
ivec2 wrapT(ivec2 t, ivec2 origin, int size) {
  ivec2 local = (t - origin + size) % size;
  return origin + local;
}
vec2 st(ivec2 t) { return texelFetch(uState, t, 0).rg; }

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  ivec2 tile = texel / uTileRes;
  ivec2 origin = tile * uTileRes;

  vec2 c = st(texel);
  vec2 lap = -c
    + 0.05 * (st(wrapT(texel + ivec2(-1, -1), origin, uTileRes))
            + st(wrapT(texel + ivec2( 1, -1), origin, uTileRes))
            + st(wrapT(texel + ivec2(-1,  1), origin, uTileRes))
            + st(wrapT(texel + ivec2( 1,  1), origin, uTileRes)))
    + 0.2  * (st(wrapT(texel + ivec2(-1,  0), origin, uTileRes))
            + st(wrapT(texel + ivec2( 1,  0), origin, uTileRes))
            + st(wrapT(texel + ivec2( 0, -1), origin, uTileRes))
            + st(wrapT(texel + ivec2( 0,  1), origin, uTileRes)));

  vec2 gmax = max(vec2(uGrid) - 1.0, vec2(1.0));
  float px = mix(uXRange.x, uXRange.y, float(tile.x) / gmax.x);
  float py = mix(uYRange.x, uYRange.y, float(tile.y) / gmax.y);

${model.updateGlsl}

  outColor = vec4(next, 0.0, 1.0);
}
`;
}

const SEED_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform int uTileRes;
uniform float uSeed;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 7.31) * 43758.5453);
}

void main() {
  vec2 texel = gl_FragCoord.xy;
  float res = float(uTileRes);
  vec2 tile = floor(texel / res);
  vec2 local = texel - tile * res;
  float r = res * 0.06;

  // 中央 + タイルごとに位置が変わる 2 点、計 3 つの種を撒く
  float v = step(length(local - res * 0.5), r);
  vec2 p1 = res * (0.18 + 0.64 * vec2(hash(tile + 3.7), hash(tile + 11.3)));
  vec2 p2 = res * (0.18 + 0.64 * vec2(hash(tile + 23.9), hash(tile + 31.1)));
  v = max(v, step(length(local - p1), r));
  v = max(v, step(length(local - p2), r));
  v *= 0.85 + 0.15 * hash(texel);

  outColor = vec4(1.0, v, 0.0, 1.0);
}
`;

const BRUSH_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uPoint;
uniform float uRadius;
out vec4 outColor;

void main() {
  vec2 s = texelFetch(uState, ivec2(gl_FragCoord.xy), 0).rg;
  float d = length(gl_FragCoord.xy - uPoint);
  float m = 1.0 - smoothstep(uRadius * 0.5, uRadius, d);
  s.g = max(s.g, m * 0.9);
  outColor = vec4(s, 0.0, 1.0);
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
  vec2 s = texture(uState, uv).rg;
${model.displayGlsl}
  vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.45, t));
  col = mix(col, uC2, smoothstep(0.40, 0.78, t));
  col = mix(col, uC3, smoothstep(0.72, 1.0, t));

  // タイル境界の罫線
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

  private pSim: Program;
  private pSeed: Program;
  private pBrush: Program;
  private pDisplay: Program;

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
    this.xRange = [...model.xAxis.defaultRange];
    this.yRange = [...model.yAxis.defaultRange];

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error("このブラウザでは WebGL2 を利用できません。");
    this.gl = gl;

    // float テクスチャへのレンダリング対応を確認 (32F 優先、なければ 16F)
    if (gl.getExtension("EXT_color_buffer_float")) {
      this.texInternalFormat = gl.RG32F;
      this.texType = gl.FLOAT;
      this.filterable = !!gl.getExtension("OES_texture_float_linear");
    } else if (gl.getExtension("EXT_color_buffer_half_float")) {
      this.texInternalFormat = gl.RG16F;
      this.texType = gl.HALF_FLOAT;
      this.filterable = true; // half float の LINEAR は WebGL2 コア
    } else {
      throw new Error("このブラウザ / GPU では float テクスチャへの描画ができません。");
    }

    // フルスクリーン三角形
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.pSim = this.compile(simFrag(model), ["uState", "uGrid", "uTileRes", "uXRange", "uYRange", "uDt"]);
    this.pSeed = this.compile(SEED_FRAG, ["uTileRes", "uSeed"]);
    this.pBrush = this.compile(BRUSH_FRAG, ["uState", "uPoint", "uRadius"]);
    this.pDisplay = this.compile(displayFrag(model), [
      "uState", "uGrid", "uCanvas", "uC0", "uC1", "uC2", "uC3", "uLine", "uGapPx",
    ]);

    this.allocTextures();
    this.seed();
  }

  get texWidth() { return this.cols * this.tileRes; }
  get texHeight() { return this.rows * this.tileRes; }

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
      gl.texImage2D(gl.TEXTURE_2D, 0, this.texInternalFormat, this.texWidth, this.texHeight, 0, gl.RG, this.texType, null);
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

  /** マトリックスの分割数を変更する (テクスチャを作り直して再シード) */
  setGrid(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.allocTextures();
    this.seed();
  }

  /** 軸パラメータの範囲を設定する。単体ビューでは min=max で使う */
  setRanges(x0: number, x1: number, y0: number, y1: number) {
    this.xRange = [x0, x1];
    this.yRange = [y0, y1];
  }

  setColors(colors: SimColors) {
    this.colors = colors;
  }

  /** 初期状態を撒き直す */
  seed() {
    const gl = this.gl;
    this.seedCounter++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.src]);
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    gl.useProgram(this.pSeed.prog);
    gl.uniform1i(this.pSeed.u.uTileRes, this.tileRes);
    gl.uniform1f(this.pSeed.u.uSeed, this.seedCounter * 0.618);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** n ステップ進める */
  step(n: number) {
    const gl = this.gl;
    gl.useProgram(this.pSim.prog);
    gl.uniform1i(this.pSim.u.uState, 0);
    gl.uniform2i(this.pSim.u.uGrid, this.cols, this.rows);
    gl.uniform1i(this.pSim.u.uTileRes, this.tileRes);
    gl.uniform2f(this.pSim.u.uXRange, this.xRange[0], this.xRange[1]);
    gl.uniform2f(this.pSim.u.uYRange, this.yRange[0], this.yRange[1]);
    gl.uniform1f(this.pSim.u.uDt, this.model.dt);
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

  /** CSS ピクセル座標 (canvas 左上原点) に化学種 V を描き足す */
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
    gl.viewport(0, 0, this.texWidth, this.texHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[dst]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.src]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.src = dst;
  }

  /** 現在の状態を canvas に描画する */
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
