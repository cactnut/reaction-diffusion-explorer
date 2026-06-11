import type { RDModel } from "./types";

export const brusselator: RDModel = {
  id: "brusselator",
  name: "ブリュッセレーター",
  description: "古典的なブリュッセレーター反応拡散系。活性化因子 u と抑制因子 v が反応し、拡散比によってチューリング不安定性が生じる。A・B のバランスが安定均一状態・スポット・縞・振動の境界を決める。",
  speciesNote: "u (c.r) = 活性化因子で均一定常値は A。v (c.g) = 抑制因子で均一定常値は B/A。拡散比 Dv/Du が大きく、B が 1+A² (この離散系での均一不安定しきい値) のすぐ手前の帯に入るとチューリングパターンが出現する。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u + A - (B + 1)u + u^2 v`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + Bu - u^2 v`,
  ],
  components: 2,
  resScale: 0.5,
  params: [
    {
      key: "A", label: "供給率 A", symbol: "A",
      min: 1, max: 4, step: 0.05, default: 2,
      axisEligible: true, axisRange: [0.3, 2.5],
      description: "活性化因子 u の一定供給率。均一定常値 u0=A を決める。上げると u のベース濃度が増え、パターンの基準が明るくなりスポットが太くなる。下げすぎると構造が消えやすい。",
    },
    {
      key: "B", label: "変換率 B", symbol: "B",
      min: 1, max: 4.5, step: 0.05, default: 4.4,
      axisEligible: true, axisRange: [2.5, 5],
      description: "u を v へ変換する反応率で不安定性の主要パラメータ。1+A² のすぐ手前の帯でチューリングパターンが発生する。上げると均一状態からスポット・縞へと遷移する。",
    },
    {
      key: "ratio", label: "拡散比 Dv/Du", symbol: "Dv/Du",
      min: 2, max: 4, step: 0.1, default: 4,
      axisEligible: true, axisRange: [2, 4],
      description: "抑制因子の拡散速度を活性化因子に対する比で指定 (Dv=Du·ratio)。大きいほど抑制因子が速く広がりチューリング不安定が起きやすい。この正規化ラプラシアン上では比を 2〜4 に抑え、最短波長 (単一テクセルの市松模様) ではなく内部の有限波長モードが成長するようにする。",
    },
    {
      key: "Du", label: "活性化因子拡散 Du", symbol: "Du",
      min: 0.5, max: 2, step: 0.05, default: 1.5,
      axisEligible: false, axisRange: [0.5, 2],
      description: "活性化因子 u の拡散係数。正規化 9 点ラプラシアン (固有値域 [-2,0]) では O(1) の大きさが必要で、Gray-Scott の Du(最大1.2)と同程度に取る。上げるとパターンスケールが大きく滑らかになり、下げると細かい構造になる。Dv=Du·ratio に直結する。",
    },
  ],
  defaultXKey: "B",
  defaultYKey: "A",
  dt: 0.04,
  stepsBase: 40,
  brushChannel: 0,
  brushValue: 5.0,
  updateGlsl: /* glsl */ `
float Dv = Du * ratio;
float u = c.r;
float v = c.g;
float uv2 = u * u * v;
float du = Du * lap.r + A - (B + 1.0) * u + uv2;
float dv = Dv * lap.g + B * u - uv2;
float nu = clamp(u + uDt * du, 0.0, 15.0);
float nv = clamp(v + uDt * dv, 0.0, 15.0);
vec4 next = vec4(nu, nv, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
float u0 = A;
float v0 = B / max(A, 1e-3);
float u = u0 + 0.04 * (n1 - 0.5);
float v = v0 + 0.04 * (n2 - 0.5);
vec4 seed = vec4(u, v, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = smoothstep(1.0, 3.0, s.r);
`,
};
