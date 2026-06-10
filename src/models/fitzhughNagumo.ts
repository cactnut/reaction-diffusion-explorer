import type { RDModel } from "./types";

export const fitzhughNagumo: RDModel = {
  id: "fitzhugh-nagumo",
  name: "FitzHugh-Nagumo 興奮性媒質",
  description: "活性因子 u と回復因子 v からなる2変数の興奮性・振動性モデル。u は三次の非線形項 (u - u³) による速い興奮ダイナミクスを持ち、v はゆっくりとした回復をもたらす。パラメータ次第でスパイラル波、ラビリンス（迷路）模様、振動パターンを生み出す。FitzHugh-Nagumo は神経興奮や心筋の波動伝播のモデルとしても知られる。",
  speciesNote: "2成分系。c.r = u（活性因子・興奮変数、概ね [-2, 2] にクランプ）、c.g = v（回復因子・抑制変数）。ブラシは u (channel 0) に注入し、興奮の核を作る。c.b と c.a は未使用（0.0）。",
  equations: [
    "∂u/∂t = Du∇²u + u − u³ − v",
    "∂v/∂t = Dv∇²v + ε(u − b·v − a)",
  ],
  components: 2,
  params: [
    {
      key: "Du", label: "活性因子拡散係数", symbol: "Du",
      min: 0.1, max: 1.5, step: 0.01, default: 0.6,
      axisEligible: true, axisRange: [0.3, 1.2],
      description: "活性因子 u の拡散の強さ。大きくすると興奮が空間的に広がりやすくなり、波面が太く滑らかになる。小さいと細かく鋭い構造になる。",
    },
    {
      key: "Dv", label: "回復因子拡散係数", symbol: "Dv",
      min: 0, max: 0.5, step: 0.005, default: 0.05,
      axisEligible: true, axisRange: [0, 0.3],
      description: "回復因子 v の拡散の強さ。0 付近では古典的な興奮波（スパイラル）になり、大きくするとラビリンス（迷路）状の定常パターンへ移行する。",
    },
    {
      key: "eps", label: "時間スケール比 ε", symbol: "ε",
      min: 0.005, max: 0.2, step: 0.005, default: 0.05,
      axisEligible: true, axisRange: [0.01, 0.15],
      description: "回復因子の時定数。小さいほど v がゆっくり追従し、長く尾を引くスパイラル波になる。大きくすると振動が速くなり、より局所的・断片的な挙動になる。",
    },
    {
      key: "a", label: "閾値オフセット a", symbol: "a",
      min: -0.3, max: 0.5, step: 0.01, default: 0.1,
      axisEligible: true, axisRange: [-0.1, 0.4],
      description: "興奮の閾値を決めるオフセット。小さい（負側）と自発的に興奮しやすく振動的になり、大きくすると静止状態が安定して刺激待ちの興奮性媒質になる。",
    },
    {
      key: "b", label: "回復強度 b", symbol: "b",
      min: 0, max: 2, step: 0.01, default: 0.5,
      axisEligible: true, axisRange: [0.1, 1.5],
      description: "回復因子の自己減衰の強さ。小さいと v が強く蓄積して振動・スパイラルが持続し、大きくすると v が早く飽和してパターンが定常化・単純化する。",
    },
  ],
  defaultXKey: "b",
  defaultYKey: "a",
  dt: 0.22,
  stepsBase: 6,
  brushChannel: 0,
  brushValue: 1.0,
  updateGlsl: /* glsl */ `
float u = c.r;
float v = c.g;
float du = Du * lap.r + u - u*u*u - v;
float dv = Dv * lap.g + eps * (u - b * v - a);
float un = clamp(u + uDt * du, -2.0, 2.0);
float vn = clamp(v + uDt * dv, -2.0, 2.0);
vec4 next = vec4(un, vn, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
// 対称性を破ってスパイラル/ラビリンスを誘発する分割初期化
// u は左右で正負に分割、v は上下で段差をつける（位相のずれを作る）
float u0 = pos.x < 0.5 ? 1.0 : -1.0;
float v0 = pos.y < 0.5 ? 0.0 : 0.5;
// 微小ノイズで微細構造の核を散布
u0 += 0.05 * (n1 - 0.5);
v0 += 0.05 * (n2 - 0.5);
vec4 seed = vec4(u0, v0, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = smoothstep(-0.4, 0.6, s.r);
`,
};
