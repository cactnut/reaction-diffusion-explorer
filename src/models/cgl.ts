import type { RDModel } from "./types";

export const cgl: RDModel = {
  id: "cgl",
  name: "複素ギンツブルグ・ランダウ (スパイラル乱流)",
  description: "複素振幅 A = u + i·v に対する λ-ω 型方程式。∂A/∂t = A + (1+iβ)∇²A − (1+iγ)|A|²A を実部 u (チャンネルr) と虚部 v (チャンネルg) に分解して積分します。線形成長 +A と三次の飽和項 −|A|²A が振幅を |A|≈1 のリミットサイクルに引き込み、拡散の虚部 β(分散)と非線形周波数 γ により、定常スパイラル・フェイズターブレンス(位相乱流)・振幅乱流(欠陥乱流)へと相が変化します。Benjamin–Feir 不安定線 1+βγ<0 を境に挙動が一変するのが見どころです。",
  speciesNote: "2変数: c.r = 複素振幅の実部 u、c.g = 虚部 v。振幅 |A|=√(u²+v²) はおおむね 0〜1.1 に収束し、位相 atan2(v,u) が空間的に渦やターゲットを描きます。b/a チャンネルは未使用 (0.0)。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = u + \nabla^2 u - \beta \nabla^2 v - (u^2 + v^2)(u - \gamma v)`,
    String.raw`\frac{\partial v}{\partial t} = v + \nabla^2 v + \beta \nabla^2 u - (u^2 + v^2)(v + \gamma u)`,
  ],
  components: 2,
  params: [
    {
      key: "beta", label: "分散 β (拡散の虚部)", symbol: "β",
      min: -2, max: 2, step: 0.05, default: 1.5,
      axisEligible: true, axisRange: [-2, 2],
      description: "拡散項の虚部係数。位相の分散性を制御します。γと組み合わせて 1+βγ<0 になると Benjamin–Feir 不安定となり、定常スパイラルから位相乱流・振幅乱流へ崩れます。値を上げると渦の腕の巻きが強まり乱流化しやすくなります。",
    },
    {
      key: "gamma", label: "非線形周波数 γ", symbol: "γ",
      min: -2, max: 2, step: 0.05, default: -1,
      axisEligible: true, axisRange: [-2, 2],
      description: "三次飽和項の虚部係数。振幅に依存した回転周波数を与えます。βと符号が逆で積が大きいほど不安定(乱流)寄りになり、同符号だと整然としたスパイラルや定常パターンに落ち着きます。",
    },
    {
      key: "dscale", label: "拡散スケール", symbol: "D",
      min: 0.3, max: 1, step: 0.05, default: 1,
      axisEligible: true, axisRange: [0.4, 1],
      description: "ラプラシアン項全体の強さ。大きいほど構造のスケールが大きく滑らかになり、小さいと細かい渦が密集します。安定性のため上限は1.0に制限しています。",
    },
  ],
  defaultXKey: "beta",
  defaultYKey: "gamma",
  dt: 0.08,
  stepsBase: 12,
  brushChannel: 0,
  brushValue: 1.0,
  updateGlsl: /* glsl */ `

  // CGL real form: A = u + i v,  ∂A/∂t = A + (1+iβ)∇²A − (1+iγ)|A|²A
  float u = c.r;
  float v = c.g;
  float amp2 = u*u + v*v;                 // |A|^2
  // diffusion (real + imaginary cross terms), scaled by dscale
  float diffU = dscale * (lap.r - beta * lap.g);
  float diffV = dscale * (lap.g + beta * lap.r);
  // linear growth + cubic saturation with nonlinear frequency gamma
  float reacU = u - amp2 * (u - gamma * v);
  float reacV = v - amp2 * (v + gamma * u);
  float du = reacU + diffU;
  float dv = reacV + diffV;
  float nu = u + uDt * du;
  float nv = v + uDt * dv;
  // clamp to a safe bounded range (limit cycle radius ~1, allow transient overshoot)
  nu = clamp(nu, -3.0, 3.0);
  nv = clamp(nv, -3.0, 3.0);
  vec4 next = vec4(nu, nv, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `

  // small random complex amplitude in [-0.5,0.5] to break symmetry → spirals/turbulence
  float u0 = (n1 - 0.5);
  float v0 = (n2 - 0.5);
  vec4 seed = vec4(u0, v0, 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `

  // show real part u remapped to [0,1]; |A|<=~1.1 so /2 + 0.5 centers it
  float t = clamp(s.r * 0.5 + 0.5, 0.0, 1.0);
`,
};
