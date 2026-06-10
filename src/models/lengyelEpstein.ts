import type { RDModel } from "./types";

export const lengyelEpstein: RDModel = {
  id: "lengyel-epstein",
  name: "Lengyel-Epstein (CDIMA)",
  description: "CDIMA化学反応のチューリングモデル。活性化因子u(ヨウ化物イオン I⁻)と抑制因子v(亜塩素酸イオン)が反応拡散により斑点・縞・六角格子パターンを自発形成する。供給率aが基底濃度を、bが抑制因子の応答強度を決め、両者の比が斑点と縞の境界を支配する。",
  speciesNote: "u=活性化因子(ヨウ化物 I⁻, c.r): 拡散が遅く局所的に増幅。v=抑制因子(亜塩素酸 ClO₂⁻, c.g): 速く拡散しuを抑える。Du<Dv(短距離活性化・長距離抑制)がチューリング不安定性を生む。時間スケール比σは抑制因子の式全体(拡散と反応の両方)に掛かり、長距離抑制の主因となる。均一定常状態 u₀=a/5, v₀=1+u₀² の周りで微小ノイズから空間パターンが成長する。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \cdot \nabla^2 u + a - u - \frac{4uv}{1 + u^2}`,
    String.raw`\frac{\partial v}{\partial t} = \sigma \cdot \left[(D_u \cdot r) \cdot \nabla^2 v + b \cdot \left(u - \frac{uv}{1 + u^2}\right)\right]`,
  ],
  components: 2,
  resScale: 0.45,
  params: [
    {
      key: "a", label: "供給率 a", symbol: "a",
      min: 6, max: 20, step: 0.1, default: 12,
      axisEligible: true, axisRange: [8, 18],
      description: "活性化因子の供給率。均一定常状態 u₀=a/5 を決める。小さいと斑点(スポット)が、大きくすると縞(ストライプ)や逆斑点へと遷移する。パターンの基本スケールと密度を支配する主要軸。",
    },
    {
      key: "b", label: "抑制応答 b", symbol: "b",
      min: 0.1, max: 1, step: 0.01, default: 0.35,
      axisEligible: true, axisRange: [0.15, 0.9],
      description: "抑制因子の生成強度。小さいとチューリング不安定で明瞭なパターンが出る。大きくすると抑制が強まり均一状態が安定化してパターンが消える。aと組み合わせて斑点⇔縞の境界を制御する。",
    },
    {
      key: "sig", label: "時間スケール比 σ", symbol: "σ",
      min: 5, max: 50, step: 1, default: 30,
      axisEligible: true, axisRange: [10, 50],
      description: "抑制因子の式全体(拡散・反応)に掛かる時間スケール比。長距離抑制の主因で、実効拡散比 Dv/Du=σ·r を支配する。大きいほどvが速く拡散・追従し、パターンが鋭く安定化して波長も広がる。小さいと応答が鈍り波打つ過渡状態が長く残る。",
    },
    {
      key: "dratio", label: "拡散比 d (Dv/Du の化学項)", symbol: "r",
      min: 0.5, max: 2, step: 0.05, default: 1,
      axisEligible: true, axisRange: [0.6, 1.8],
      description: "抑制因子と活性化因子の化学的拡散係数の比 d(参照論文の d、~1)。実効的な長距離抑制の大部分はσが供給するため、ここは1前後の微調整軸。大きいほどパターンの波長(斑点や縞の間隔)が広がり、小さすぎるとチューリング不安定が弱まる。",
    },
    {
      key: "du", label: "活性拡散 Du", symbol: "Du",
      min: 0.02, max: 0.08, step: 0.005, default: 0.04,
      axisEligible: false, axisRange: [0.03, 0.07],
      description: "活性化因子の拡散係数。全体のパターンスケールを設定する。大きくするとパターン全体が粗く(大きく)なり、小さくすると微細になる。抑制拡散が σ·du·r で連動するため、安定性のため小さめに保つ。",
    },
  ],
  defaultXKey: "a",
  defaultYKey: "b",
  dt: 0.04,
  stepsBase: 40,
  brushChannel: 0,
  brushValue: 8.0,
  updateGlsl: /* glsl */ `

  // u = activator (c.r), v = inhibitor (c.g)
  float u = clamp(c.r, 0.0, 30.0);
  float v = clamp(c.g, 0.0, 60.0);

  // shared nonlinear term: u*v / (1 + u^2)
  float denom = max(1.0 + u * u, 1e-3);
  float fr = u * v / denom;

  // diffusion coefficients (faithful to reference: sigma scales the WHOLE v equation,
  // so the inhibitor diffusion carries sigma -> long-range inhibition that drives Turing).
  // Du = du (activator, slow). Dv_eff = sig * du * dratio (inhibitor, fast).
  float Du = du;                 // activator diffusion
  float Dv = sig * du * dratio;  // inhibitor diffusion (sigma * d * Du), large

  // reaction terms (reference: u_t = a - u - 4*fr ; v_t = sigma*b*(u - fr))
  float ru = a - u - 4.0 * fr;       // activator reaction
  float rv = sig * b * (u - fr);     // inhibitor reaction (sigma folded into rate)

  float du_dt = Du * lap.r + ru;
  float dv_dt = Dv * lap.g + rv;

  float un = u + uDt * du_dt;
  float vn = v + uDt * dv_dt;

  // clamp to safe bounded range
  un = clamp(un, 0.0, 30.0);
  vn = clamp(vn, 0.0, 60.0);

  vec4 next = vec4(un, vn, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `

  // homogeneous Turing steady state + small symmetry-breaking noise
  float u0 = a / 5.0;
  float v0 = 1.0 + u0 * u0;
  float u = u0 + 0.10 * (n1 - 0.5);
  float v = v0 + 0.10 * (n2 - 0.5);
  vec4 seed = vec4(max(u, 0.0), max(v, 0.0), 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `

  // u (activator) sits at u0=a/5 (~1.6..3.6) and peaks at a few x u0 in patterned states.
  // smoothstep around the typical band gives good spot/stripe contrast.
  float u = s.r;
  float t = smoothstep(0.5, 6.0, u);
`,
};
