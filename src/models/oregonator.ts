import type { RDModel } from "./types";

export const oregonator: RDModel = {
  id: "oregonator",
  name: "Oregonator (BZ)",
  description: "ベローゾフ・ジャボチンスキー反応のスパイラル波を再現する興奮性媒体モデル。Tyson-Fife の 2 変数還元 (標準形) を使い、活性種 u が自己触媒的に立ち上がり、抑制種 v が遅れて追従することで回転スパイラルや標的波が生まれる。f と ε のバランスが興奮性・振動性の境界を決める。",
  speciesNote: "u = 活性種 (HBrO2、自己触媒で急増する興奮変数)、v = 抑制種/触媒 (Ce⁴⁺、u に遅れて追従する回復変数)。元の 3 変数 FKN 機構は explicit Euler には硬すぎるため、臭化物イオンを断熱消去した標準的な Tyson-Fife の 2 変数還元を用いている。表示は活性種 u の濃いところを明色にしている。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u + \frac{1}{\varepsilon}\left[u(1 - u) - \frac{f \cdot v \cdot (u - q)}{u + q}\right]`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + (u - v), \quad D_v = D_u \cdot D_r`,
  ],
  components: 2,
  // 剛性のため dt が小さく 1 フレーム 150 サブステップと重い。拡散係数は据え置きで
  // (安定性に影響しない) タイル解像度だけ下げ、スパイラルを大きく見せつつ計算量を減らす。
  resScale: 0.6,
  params: [
    {
      key: "eps", label: "時間スケール ε", symbol: "ε",
      min: 0.03, max: 0.12, step: 0.005, default: 0.05,
      axisEligible: true, axisRange: [0.04, 0.1],
      description: "活性種 u の応答の速さ (小さいほど u が速い)。小さくすると興奮性が強まり鋭いスパイラル波になり、大きくすると波が鈍り振動的な挙動へ移る。下限を 0.04 に上げて 1/ε を最大 25 に抑え、explicit Euler の硬さを安全側にしている。",
    },
    {
      key: "f", label: "化学量論係数 f", symbol: "f",
      min: 0.3, max: 1.4, step: 0.05, default: 0.6,
      axisEligible: true, axisRange: [0.45, 0.85],
      description: "抑制種 v が u を抑える強さ。小さいと u が立ちっぱなしになり、1 付近で安定スパイラル、大きくすると抑制が勝って波が消えやすくなる (興奮性と静止の境界を制御)。スライダ上限を 1.4 に抑え、最悪ケースの反応項を抑えている。",
    },
    {
      key: "q", label: "閾値定数 q", symbol: "q",
      min: 0.001, max: 0.006, step: 0.0005, default: 0.002,
      axisEligible: true, axisRange: [0.0015, 0.005],
      description: "活性化の閾値スケール。大きくすると u の点火閾値が上がり波の立ち上がりが緩やかに、小さくすると鋭く尖った波先になる。軸の下限を 0.0015 に抑えて (u−q)/(u+q) の u=0 付近の傾き (∝1/q) が過大にならないようにしている。",
    },
    {
      key: "Du", label: "u の拡散 Dᵤ", symbol: "Dᵤ",
      min: 0.1, max: 1.0, step: 0.05, default: 0.8,
      axisEligible: true, axisRange: [0.2, 1.0],
      description: "活性種の拡散の速さ。大きいほど波の幅とスパイラルの巻きが大きくなり、模様全体がなめらかになる。",
    },
    {
      key: "Dr", label: "拡散比 Dᵥ/Dᵤ", symbol: "Dᵣ",
      min: 0.2, max: 2, step: 0.1, default: 1,
      axisEligible: true, axisRange: [0.5, 1.5],
      description: "抑制種と活性種の拡散の比 (Dᵥ = Dᵤ·Dᵣ)。1 付近では均一拡散で典型的な BZ スパイラル、大きくすると抑制が広く拡散して波が分裂・不安定化しやすい。",
    },
  ],
  defaultXKey: "f",
  defaultYKey: "eps",
  dt: 0.001,
  stepsBase: 150,
  // 剛性は反応項のみ・拡散は緩い (Dv≤2) ので演算子分割が効く。ラプラシアンを固定したまま
  // 反応を 15 回サブサイクルし、高価な 9 点フェッチのパスを 150→10/フレームに削減
  // (×4 で 600→40)。dt_frame=15·0.001=0.015 ≤ 0.62·ε (ε 軸下限 0.04) でスパイラルの
  // 伝播速度を保つ。R を大きくしすぎる (≈25 以上) と展開後シェーダが ANGLE/Metal で
  // 性能の崖に落ちるため、60fps を満たす最小の R に留める (M1 実測で ×4 60fps)。
  reactionSubsteps: 15,
  brushChannel: 0,
  brushValue: 0.9,
  updateGlsl: /* glsl */ `

    float u = c.r;
    float v = c.g;
    float denom = max(u + q, 1e-3);
    float react = u * (1.0 - u) - f * v * (u - q) / denom;
    float du = Du * lap.r + react / max(eps, 1e-3);
    float dv = Du * Dr * lap.g + (u - v);
    vec4 next = vec4(
      clamp(u + du * uDt, 0.0, 1.0),
      clamp(v + dv * uDt, 0.0, 1.0),
      0.0, 0.0);
  
`,
  seedGlsl: /* glsl */ `

    // 興奮性媒体のスパイラル種: 左半分を励起 (u 高)、回復変数 v を縦方向に傾けて
    // 波面の片端を不応にし、自由端を作って渦を巻かせる。
    float u = pos.x < 0.5 ? 0.9 : 0.0;
    float v = 0.10 + 0.30 * pos.y;
    u += 0.02 * (n1 - 0.5);
    vec4 seed = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 0.0);
  
`,
  displayGlsl: /* glsl */ `

    float t = smoothstep(0.05, 0.6, s.r);
  
`,
};
