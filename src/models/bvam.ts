import type { RDModel } from "./types";

export const bvam: RDModel = {
  id: "bvam",
  name: "BVAM",
  description: "Barrio-Varea-Aragón-Maini モデル。動物の体表模様 (毛皮の斑点・縞) を生む 2 成分チューリング系。三次の反応項を持ち、結合係数 C と反応係数 a, b, h を調整することで斑点と縞のあいだを連続的に行き来できる。η は反応の強さ全体を、拡散比 Dᵥ/Dᵤ は模様の細かさを決める。チューリング不安定には均一平衡 (0,0) が反応のみで安定 (b < −1 かつ h > 0) であることが必要で、既定値はその模様生成域に収めてある。",
  speciesNote: "u = c.r (活性因子に相当する第 1 形態素)、v = c.g (第 2 形態素)。均一平衡は (0,0) で、そこから微小ゆらぎを増幅して模様が立ち上がる。チューリング不安定が起こるには (0,0) が反応のみでは安定 (trace = η(1+b) < 0 すなわち b < −1、かつ det = η²(b − a·h) > 0) でなければならず、a = −1 のとき h を正にとる必要がある。表示は v の符号付き値を中心 0 で明暗に割り当てている。Dᵤ は安定性のためシェーダ内に 0.18 で固定し、Dᵥ は拡散比パラメータで与える。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u + \eta(u + a \cdot v - C \cdot u \cdot v - u \cdot v^2)`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + \eta(b \cdot v + h \cdot u + C \cdot u \cdot v + u \cdot v^2)`,
  ],
  components: 2,
  resScale: 0.6,
  params: [
    {
      key: "Cc", label: "結合係数 C", symbol: "C",
      min: -1.5, max: 1.5, step: 0.05, default: 0.5,
      axisEligible: true, axisRange: [-1, 1],
      description: "二次結合 u·v の強さ。線形不安定の発生 (オンセット) には効かず、しきい値を超えたあとに斑点と縞のどちらが選ばれるかを決める。小さいと縞 (ストライプ) が、大きいと斑点 (スポット) が優勢になる。負値も含めると標準的な斑点/縞の分岐を再現しやすい。",
    },
    {
      key: "b", label: "反応係数 b", symbol: "b",
      min: -2, max: -1.05, step: 0.02, default: -1.7,
      axisEligible: true, axisRange: [-1.9, -1.3],
      description: "v の線形減衰 (負値)。反応のみの安定条件 trace = η(1+b) < 0 を満たすため必ず −1 より小さくとる。−1 に近づけるほど不安定化が強まり模様の振幅・密度が増し、大きく負にすると平坦化して模様が消える。",
    },
    {
      key: "a", label: "反応係数 a", symbol: "a",
      min: -2, max: 0, step: 0.02, default: -1,
      axisEligible: true, axisRange: [-1.5, -0.5],
      description: "u に対する v の線形結合 (負値)。det = η²(b − a·h) を通じて h と組んでチューリング不安定の発生条件を左右する。a = −1 のとき条件は b + h > 0。0 に近いほど波長が長く模様が粗くなる。",
    },
    {
      key: "h", label: "結合係数 h", symbol: "h",
      min: 0, max: 3.5, step: 0.05, default: 2.5,
      axisEligible: true, axisRange: [1.5, 3],
      description: "u が v を駆動する線形結合 (正値)。det > 0 のチューリング条件には h を正にとる必要がある (a = −1 のとき h > −b)。大きいほど模様が立ち上がりやすく、迷路状/網目状への偏りも変える。",
    },
    {
      key: "eta", label: "反応の強さ η", symbol: "η",
      min: 0.1, max: 0.4, step: 0.01, default: 0.25,
      axisEligible: true, axisRange: [0.2, 0.4],
      description: "反応項全体のスケール。大きいほど模様が速く・くっきり立ち上がりコントラストが強くなるが、大きすぎると三次項 u·v² の剛性で状態が clamp 上限に張り付き模様が荒れる。0.25 付近で clamp に触れず安定したチューリング模様になる。",
    },
    {
      key: "ratio", label: "拡散比 Dᵥ/Dᵤ", symbol: "Dᵥ/Dᵤ",
      min: 1, max: 12, step: 0.5, default: 8,
      axisEligible: true, axisRange: [6, 12],
      description: "v と u の拡散比。チューリング模様の細かさを決め、大きいほど活性因子が局在し斑点・縞が細かく密になる。6 を下回ると不安定が起きにくく模様が出ない。",
    },
  ],
  defaultXKey: "Cc",
  defaultYKey: "b",
  dt: 0.09,
  stepsBase: 16,
  brushChannel: 1,
  brushValue: 0.8,
  updateGlsl: /* glsl */ `

    // Dᵤ は安定性のため定数固定。Dᵥ は拡散比で与える
    const float Du = 0.18;
    // 状態を有界に保つ (三次項 u·v² は爆発しやすいため clamp が必須)
    float u = clamp(c.r, -1.5, 1.5);
    float v = clamp(c.g, -1.5, 1.5);
    float Dv = Du * ratio;
    // 反応項 (η でスケール)。三次の結合が斑点/縞の分岐を生む
    float ru = eta * (u + a * v - Cc * u * v - u * v * v);
    float rv = eta * (b * v + h * u + Cc * u * v + u * v * v);
    vec4 next = vec4(
      clamp(u + (Du * lap.r + ru) * uDt, -1.5, 1.5),
      clamp(v + (Dv * lap.g + rv) * uDt, -1.5, 1.5),
      0.0, 0.0);
`,
  seedGlsl: /* glsl */ `

    // 均一平衡 (0,0) のまわりの微小ランダムゆらぎで対称性を破る
    float u0 = 0.04 * (n1 - 0.5);
    float v0 = 0.04 * (n2 - 0.5);
    vec4 seed = vec4(u0, v0, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `

    // v は中心 0 の符号付き値。検証済み既定では概ね ±0.8 に振れるので 0 を中点に明暗化
    float t = smoothstep(-0.8, 0.8, s.g);
`,
};
