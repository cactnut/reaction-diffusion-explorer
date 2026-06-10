import type { RDModel } from "./types";

export const kellerSegel: RDModel = {
  id: "keller-segel",
  name: "Keller-Segel (走化性)",
  description: "細胞 u が自ら分泌する誘引物質 v の勾配に向かって移動する走化性モデル。誘引強度 χ が大きいと細胞が一点に集まって密な斑点 (アグリゲーション) を作り、小さいとほぼ均一なまま広がる。素の走化性は反拡散的で密度が無限に爆発するため、体積占有 (volume-filling) で密度が飽和上限 u_sat に近づくとフラックスが止まるようにし、PDE 自体に有限平衡を持たせている。",
  speciesNote: "u (r) = 細胞密度、v (g) = 誘引物質の濃度。細胞は v の勾配を登るように移動し、移動先で v をさらに分泌するため正のフィードバックで凝集する。表示は u (細胞密度) の濃いところを明色にしている。",
  equations: [
    "∂u/∂t = Dᵤ∇²u − χ∇·(q(u)∇v)   (q(u) = u(1 − u/u_sat))",
    "∂v/∂t = Dᵥ∇²v + p·u − v   (Dᵥ = Dᵤ·r)",
  ],
  components: 2,
  params: [
    {
      key: "chi", label: "走化性強度 χ", symbol: "χ",
      min: 0, max: 4, step: 0.05, default: 2,
      axisEligible: true, axisRange: [0, 3.5],
      description: "細胞が誘引物質 v の勾配を登る強さ。大きいほど凝集が強まり、細胞が孤立した密な斑点に集まる。0 付近では走化性が効かず、ほぼ均一なまま緩く拡散する。体積占有により大きくしても密度は u_sat 付近で頭打ちになる。",
    },
    {
      key: "Du", label: "細胞の拡散 Dᵤ", symbol: "Dᵤ",
      min: 0.05, max: 0.5, step: 0.01, default: 0.2,
      axisEligible: true, axisRange: [0.05, 0.5],
      description: "細胞自身のランダムな拡散の速さ。大きいほど凝集が拡散にほどけて斑点が大きくぼやけ、小さいほど鋭く細かい斑点に集中する。",
    },
    {
      key: "ratio", label: "拡散比 Dᵥ/Dᵤ", symbol: "r",
      min: 1, max: 8, step: 0.5, default: 4,
      axisEligible: true, axisRange: [1, 8],
      description: "誘引物質 v の拡散を細胞拡散の何倍にするか (Dᵥ = Dᵤ·r)。大きいほど v が広範囲に染み出して凝集の間隔 (斑点どうしの距離) が広がる。",
    },
    {
      key: "prod", label: "誘引物質の生産 p", symbol: "p",
      min: 0.2, max: 3, step: 0.1, default: 1,
      axisEligible: true, axisRange: [0.3, 2.5],
      description: "細胞 1 単位あたりが分泌する誘引物質 v の量。大きいほど v の勾配が急になり走化性のフィードバックが強まって、より早く・より密に凝集する。",
    },
  ],
  defaultXKey: "chi",
  defaultYKey: "Du",
  dt: 0.08,
  stepsBase: 16,
  brushChannel: 0,
  brushValue: 8.0,
  updateGlsl: /* glsl */ `

    // 体積占有 (volume-filling) でフラックスを飽和させ、PDE 自体に有限平衡を持たせる。
    // これによりクランプは「安全弁」になり、模様の凍結 (クランプ張り付き) を防ぐ。
    float uSat = 8.0;
    float sens = clamp(1.0 - c.r / uSat, 0.0, 1.0);      // u が uSat に近づくと走化性が止まる
    float dsens = 1.0 - 2.0 * c.r / uSat;                // d/du [u*(1-u/uSat)] = 1 - 2u/uSat
    float qC = c.r * sens;                               // 飽和重み付き密度 q = u(1 - u/uSat)
    float qx = gx.r * dsens;                             // ∂q/∂x
    float qy = gy.r * dsens;                             // ∂q/∂y
    // 飽和走化性の発散項 ∇·(q ∇v) = ∇q·∇v + q·∇²v
    float chemo = qx * gx.g + qy * gy.g + qC * lap.g;
    // 細胞 u: 拡散 + 飽和走化性流入 (− χ ∇·(q ∇v))
    float du = Du * lap.r - chi * chemo;
    // 誘引物質 v: 拡散 + u からの生産 − 自己分解
    float dv = (Du * ratio) * lap.g + prod * c.r - c.g;
    // クランプは安全弁: u は uSat 付近で安定するので 12 で十分、v は prod*uSat に合わせ 25。
    vec4 next = vec4(
      clamp(c.r + du * uDt, 0.0, 12.0),
      clamp(c.g + dv * uDt, 0.0, 25.0),
      0.0, 0.0);
`,
  seedGlsl: /* glsl */ `

    // ほぼ均一な細胞密度 + 微小ノイズで対称性を破る。v は 0 付近から立ち上がる。
    float u0 = 1.0 + 0.1 * (n1 - 0.5);
    float v0 = 0.02 * n2;
    vec4 seed = vec4(u0, v0, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `

    // 飽和平衡 (max u ~ uSat=8) に合わせてしきい値を調整。凝集斑点を明色に。
    float t = smoothstep(1.2, 6.0, s.r);
`,
};
