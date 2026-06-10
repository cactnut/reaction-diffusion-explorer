import type { RDModel } from "./types";

export const giererMeinhardt: RDModel = {
  id: "gierer-meinhardt",
  name: "Gierer-Meinhardt（活性因子-抑制因子）",
  description: "古典的な活性因子・抑制因子型のチューリング反応拡散系。活性因子 u が自己触媒的に増殖しつつ抑制因子 v を生成し、v が拡散して u を抑える。短距離活性化・長距離抑制により、斑点やネットワーク状のパターンが一様状態から自発的に立ち上がる。",
  speciesNote: "2成分系。c.r = 活性因子 u（自己触媒的に増える可視種、ブラシで注入する）、c.g = 抑制因子 v（u に追従して増え u を抑える）。b/a は未使用で 0。",
  equations: [
    "∂u/∂t = Du∇²u + ρ + u²/v − μu",
    "∂v/∂t = Dv∇²v + u² − νv   (Dv = Du·ratio)",
  ],
  components: 2,
  resScale: 0.5,
  params: [
    {
      key: "mu", label: "活性因子の減衰率", symbol: "μ",
      min: 0.4, max: 2, step: 0.01, default: 1,
      axisEligible: true, axisRange: [0.6, 1.4],
      description: "活性因子 u の自己分解の速さを決める。大きくすると u が減衰しやすくなり、定常値が下がってパターンの斑点が小さく・まばらになる。小さくすると u が広がりやすくなり斑点が太く密になる。",
    },
    {
      key: "nu", label: "抑制因子の減衰率", symbol: "ν",
      min: 0.4, max: 2, step: 0.01, default: 1,
      axisEligible: true, axisRange: [0.6, 1.6],
      description: "抑制因子 v の分解の速さ。大きくすると v が消えやすく抑制が弱まり、u がより多く・広く立ち上がってパターンが粗くなる。小さくすると抑制が強く効き、斑点が小さく抑えられる。",
    },
    {
      key: "rho", label: "基礎生成率", symbol: "ρ",
      min: 0, max: 0.1, step: 0.001, default: 0.01,
      axisEligible: true, axisRange: [0, 0.06],
      description: "活性因子 u の場所によらない一定の供給量。大きくすると一様状態からパターンが立ち上がりやすくなり背景レベルが上がる。0 に近づけるとパターン形成のきっかけが弱まる。",
    },
    {
      key: "Du", label: "活性因子の拡散係数", symbol: "Dᵤ",
      min: 0.2, max: 0.2, step: 0.01, default: 0.2,
      axisEligible: false, axisRange: [0.2, 0.2],
      description: "活性因子 u の拡散の強さ。安定性確保のため 0.2 に固定。短距離活性化のスケールを決め、抑制因子側との拡散比でパターンの特徴長が決まる。",
    },
    {
      key: "ratio", label: "拡散比 Dv/Du", symbol: "d",
      min: 4, max: 24, step: 0.5, default: 16,
      axisEligible: true, axisRange: [6, 24],
      description: "抑制因子の拡散を活性因子の何倍にするか（Dv = Du·d）。長距離抑制の到達範囲を決め、大きくすると斑点どうしの間隔が広がりまばらな大きいパターンに、小さくすると細かく密なパターンになる。",
    },
  ],
  defaultXKey: "mu",
  defaultYKey: "ratio",
  dt: 0.04,
  stepsBase: 40,
  brushChannel: 0,
  brushValue: 1.6,
  updateGlsl: /* glsl */ `
float v_safe = max(c.g, 1e-3);
float Dv = Du * ratio;
float du = Du * lap.r + rho + (c.r * c.r) / v_safe - mu * c.r;
float dv = Dv * lap.g + c.r * c.r - nu * c.g;
float u_next = clamp(c.r + uDt * du, 0.0, 24.0);
float v_next = clamp(c.g + uDt * dv, 0.0, 24.0);
vec4 next = vec4(u_next, v_next, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
float u0 = (mu > 1e-3) ? ((rho + nu) / mu) : 1.0;
float v0 = (nu > 1e-3) ? ((u0 * u0) / nu) : 1.0;
u0 = clamp(u0, 0.0, 24.0);
v0 = clamp(v0, 1e-3, 24.0);
float u = u0 + 0.02 * (n1 - 0.5);
float v = v0 + 0.02 * (n2 - 0.5);
vec4 seed = vec4(max(u, 0.0), max(v, 1e-3), 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = smoothstep(0.2, 3.0, s.r);
`,
};
