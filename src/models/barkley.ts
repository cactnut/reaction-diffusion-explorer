import type { RDModel } from "./types";

export const barkley: RDModel = {
  id: "barkley",
  name: "バークレー興奮性媒質（スパイラル波）",
  description: "バークレーモデルは興奮性媒質におけるスパイラル波（渦巻き波）を高速に生成するために設計された2変数反応拡散系です。活性因子 u は閾値 (v+b)/a を超えると一気に立ち上がり、回復変数 v がゆっくり追従して不応期を作ります。初期条件の対称性を u と v のクロスした半平面分割で破ることで、回転するスパイラル波が自発的に形成されます。a は興奮の振幅・波の太さを、b は閾値オフセット（励起のしやすさ）を、eps は時間スケール比（回復の速さ）を制御します。スパイラルが持続する興奮性領域は励起条件 a < 1+b を満たす a≈0.65〜0.95・b≦0.03 の範囲です。",
  speciesNote: "u (c.r) = 活性因子（興奮場、膜電位に相当）。閾値を超えると 0→1 へ急峻に立ち上がる。v (c.g) = 回復変数（不応性、ゆっくり u を追い、励起後の回復を司る）。b と c は未使用で 0。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u + \frac{1}{\varepsilon} \cdot u \cdot (1 - u) \cdot \left(u - \frac{v + b}{a}\right)`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + (u - v)`,
  ],
  components: 2,
  params: [
    {
      key: "a", label: "励起振幅 a", symbol: "a",
      min: 0.3, max: 1, step: 0.01, default: 0.75,
      axisEligible: true, axisRange: [0.6, 0.95],
      description: "閾値の正規化係数で波の振幅と太さを決める。興奮性媒質として持続するには励起条件 a < 1+b を満たす必要があり、a が 1.0 以上だと興奮枝に張り付いて場が固まり（フリーズ）、スパイラルが消える。逆に a が 0.6 を下回ると波が伝播せず消滅する。0.65〜0.95 が安定してスパイラルが回り続ける範囲。",
    },
    {
      key: "b", label: "閾値オフセット b", symbol: "b",
      min: 0, max: 0.15, step: 0.005, default: 0.02,
      axisEligible: true, axisRange: [0, 0.04],
      description: "励起閾値の下駄。大きくすると閾値が上がって励起しにくくなり、a≈0.7 付近では b が 0.03 を超えると波先が後退・消滅しやすくなる。0 付近ほど自発的に持続するスパイラルが安定して回り続ける。",
    },
    {
      key: "eps", label: "時間スケール比 ε", symbol: "ε",
      min: 0.03, max: 0.12, step: 0.005, default: 0.05,
      axisEligible: true, axisRange: [0.03, 0.08],
      description: "活性因子と回復変数の時間スケール比。小さくすると u の立ち上がりが鋭く速くなりスパイラルの巻きが密になる。大きくすると興奮が鈍く波がゆったりする。eps を 0.03 未満にすると 1/eps のスティフネスが強まり波先が1セル幅に潰れるため下限を 0.03 とした。",
    },
    {
      key: "Du", label: "活性因子拡散 Du", symbol: "Du",
      min: 0.2, max: 1, step: 0.05, default: 0.8,
      axisEligible: true, axisRange: [0.2, 1],
      description: "活性因子 u の拡散係数で波の伝播速度と波長を決める。大きくすると波が速く太く広がり、小さくすると波長が短く細かいスパイラルになる。",
    },
    {
      key: "Dv", label: "回復変数拡散 Dv", symbol: "Dv",
      min: 0, max: 0.2, step: 0.01, default: 0,
      axisEligible: false, axisRange: [0, 0.2],
      description: "回復変数 v の拡散係数。通常は0（v は局所的）。わずかに上げると不応領域が滲んで波先がなめらかになり、スパイラルの先端の振る舞いが変化する。",
    },
  ],
  defaultXKey: "b",
  defaultYKey: "a",
  dt: 0.15,
  stepsBase: 10,
  brushChannel: 0,
  brushValue: 1.0,
  updateGlsl: /* glsl */ `
float thr = (c.g + b) / max(a, 1e-3);
float fu = (1.0 / max(eps, 1e-3)) * c.r * (1.0 - c.r) * (c.r - thr);
float fv = c.r - c.g;
float un = c.r + (Du * lap.r + fu) * uDt;
float vn = c.g + (Dv * lap.g + fv) * uDt;
vec4 next = clamp(vec4(un, vn, 0.0, 0.0), 0.0, 1.0);
`,
  seedGlsl: /* glsl */ `
float u0 = pos.x < 0.5 ? 1.0 : 0.0;
float v0 = pos.y < 0.5 ? 0.5 : 0.0;
vec4 seed = vec4(u0, v0, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = smoothstep(0.05, 0.5, s.r);
`,
};
