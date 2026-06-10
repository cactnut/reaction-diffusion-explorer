import type { RDModel } from "./types";

export const mimuraMurray: RDModel = {
  id: "mimura-murray",
  name: "三村・村田 捕食者-被食者モデル",
  description: "生態学的な捕食者-被食者系から導かれるチューリング・パターンモデル。被食者 u（活性化因子）と捕食者 v（抑制因子）が反応拡散し、捕食者の拡散が被食者よりはるかに速い（Dv/Du が大きい）ときに拡散誘起不安定性が生じ、生態学的なスポットや迷路状（ラビリンス）パターンが自己組織化する。a で被食者の自己増殖の基礎レベル、b で増殖の密度依存性、d で捕食者の自己抑制を制御し、ratio で捕食者拡散の速さを決める。共存平衡 (u*=5, v*=10) 近傍から微小ノイズで立ち上がる。なお、このハーネスの正規化ラプラシアンでは Du が小さすぎるとチューリング波長が格子分解能を下回り模様が出ないため、既定 Du は格子で解像できる大きさに設定してある。",
  speciesNote: "u (c.r) = 被食者（プレイ、活性化因子）、v (c.g) = 捕食者（プレデター、抑制因子）。標準パラメータでの共存平衡は u*≈5, v*≈10。u が局所的に増えると捕食者 v を呼び寄せるが、v は速く拡散して周囲で u を抑え込むため、空間的にスポット/迷路構造が形成される。表示・ブラシ対象は被食者 u。",
  equations: [
    "∂u/∂t = Du·∇²u + [ (a + b·u − u²)/c − v ]·u",
    "∂v/∂t = Dv·∇²v + [ u − (1 + d·v) ]·v,  Dv = Du·ratio",
  ],
  components: 2,
  resScale: 0.7,
  params: [
    {
      key: "a", label: "被食者基礎増殖 a", symbol: "a",
      min: 20, max: 45, step: 0.5, default: 35,
      axisEligible: true, axisRange: [24, 42],
      description: "被食者の自己増殖の基礎レベル。大きくすると平衡点の被食者密度が上がり、パターンがスポット状から迷路状・反転スポットへと遷移する。小さすぎると一様状態に戻る。",
    },
    {
      key: "b", label: "増殖密度依存 b", symbol: "b",
      min: 8, max: 24, step: 0.5, default: 16,
      axisEligible: true, axisRange: [11, 21],
      description: "被食者増殖の密度依存項の係数。大きくすると活性化（自己増殖）が強まり、パターンの波長やコントラストが増して構造がはっきりする。小さくすると不安定性が弱まり一様化する。",
    },
    {
      key: "csat", label: "増殖飽和係数 c", symbol: "c",
      min: 6, max: 14, step: 0.5, default: 9,
      axisEligible: true, axisRange: [7, 13],
      description: "被食者増殖項の飽和（割り算）係数。大きくすると反応の強さ全体が弱まり平衡密度と不安定性が低下する。小さくすると反応が強まりパターンが鋭くなる。",
    },
    {
      key: "d", label: "捕食者自己抑制 d", symbol: "d",
      min: 0.2, max: 0.8, step: 0.02, default: 0.4,
      axisEligible: true, axisRange: [0.25, 0.65],
      description: "捕食者の自己抑制（密度効果）。大きくすると捕食者が増えにくくなり平衡の捕食者密度が下がって被食者スポットが大きく粗くなる。小さくすると捕食者が強く効き構造が細かくなる。",
    },
    {
      key: "Du", label: "被食者拡散 Du", symbol: "Du",
      min: 0.3, max: 1.8, step: 0.05, default: 1,
      axisEligible: true, axisRange: [0.5, 1.5],
      description: "被食者（活性化因子）の拡散係数で、この正規化ラプラシアン上での基準拡散の大きさ。小さすぎる（0.2 程度）とチューリング波長が格子分解能を下回り模様が出ないため、既定は格子で解像できる 1.0 にしてある。大きくすると構造が粗く大きくなる。",
    },
    {
      key: "ratio", label: "拡散比 Dv/Du", symbol: "d_v/d_u",
      min: 8, max: 28, step: 0.5, default: 20,
      axisEligible: true, axisRange: [10, 25],
      description: "捕食者拡散と被食者拡散の比（Dv = Du·ratio）。チューリング不安定性の鍵で、大きくすると抑制因子が速く広がり明瞭なスポット/迷路が出る。小さい（Du≈1.0 と組み合わせておおむね12未満）と不安定性が消え一様状態に戻る。",
    },
  ],
  defaultXKey: "a",
  defaultYKey: "ratio",
  dt: 0.005,
  stepsBase: 80,
  brushChannel: 0,
  brushValue: 9.0,
  updateGlsl: /* glsl */ `
float u = clamp(c.r, 0.0, 16.0);
float v = clamp(c.g, 0.0, 16.0);
float cc = max(csat, 1e-3);
// reaction brackets
float fu = (a + b * u - u * u) / cc - v;   // prey per-capita growth bracket
float gv = u - (1.0 + d * v);              // predator per-capita growth bracket
float ru = fu * u;
float rv = gv * v;
// bound the per-step reaction increment for stiff regimes
ru = clamp(ru, -50.0, 50.0);
rv = clamp(rv, -50.0, 50.0);
float Dv = Du * ratio;
float nu = u + uDt * (Du * lap.r + ru);
float nv = v + uDt * (Dv * lap.g + rv);
vec4 next = vec4(clamp(nu, 0.0, 16.0), clamp(nv, 0.0, 16.0), 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
// coexistence equilibrium from params (solve u^2 + (csat/d - b)u - (a + csat/d) = 0, positive root)
float dd = max(d, 1e-3);
float B = csat / dd - b;
float C = -(a + csat / dd);
float disc = max(B * B - 4.0 * C, 0.0);
float u0 = 0.5 * (-B + sqrt(disc));
u0 = clamp(u0, 0.1, 14.0);
float v0 = clamp((u0 - 1.0) / dd, 0.0, 14.0);
vec4 seed = vec4(u0 + 0.15 * (n1 - 0.5), v0 + 0.15 * (n2 - 0.5), 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
// prey u sits near equilibrium u*~5 and patterns roughly fill [1, 9];
// map a tight window around the equilibrium so spots/labyrinths show full contrast.
float t = clamp(s.r / 9.0, 0.0, 1.0);
`,
};
