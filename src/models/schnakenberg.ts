import type { RDModel } from "./types";

export const schnakenberg: RDModel = {
  id: "schnakenberg",
  name: "Schnakenberg (シュナッケンベルク)",
  description: "活性因子 u と基質 v による2成分の反応拡散系。基質が一定速度で供給され、自己触媒反応 u²v によって活性因子が増殖する。基質の拡散が活性因子よりずっと速い(Dv≫Du)ことでチューリング不安定性が生じ、一様状態から自発的にスポットや迷路状のパターンが形成される。",
  speciesNote: "c.r = u(活性因子, ブラシで注入)、c.g = v(基質)。一様定常状態は u0=a+b, v0=b/(a+b)²。微小ノイズを加えた一様状態から開始し、チューリング不安定性でパターンが立ち上がる。なお供給係数 a が小さすぎる(0 付近)と一様定常状態の反応ヤコビアンが反応不安定(正の実固有値)になり、チューリングではなく単なる発散になるため、a の下限は 0.02 に設定している。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u + a - u + u^2 v`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + b - u^2 v`,
  ],
  components: 2,
  resScale: 0.5,
  params: [
    {
      key: "a", label: "供給係数 a", symbol: "a",
      min: 0.02, max: 0.3, step: 0.005, default: 0.1,
      axisEligible: true, axisRange: [0.05, 0.22],
      description: "活性因子 u の一定供給速度。一様定常状態は u0=a+b。大きくすると活性因子のベース量が増え、スポットが太く密になり、やがてパターンが消えて一様化する。小さすぎると一様状態が反応不安定になり発散するため下限は 0.02。",
    },
    {
      key: "b", label: "供給係数 b", symbol: "b",
      min: 0.4, max: 1.4, step: 0.01, default: 0.9,
      axisEligible: true, axisRange: [0.75, 1.3],
      description: "基質 v の一定供給速度。活性化反応の燃料となる。大きくすると活性因子が増えてスポットが密集・連結し、迷路状や反転パターン(穴あき)へと遷移する。",
    },
    {
      key: "Du", label: "活性因子拡散 Du", symbol: "Du",
      min: 0.05, max: 0.4, step: 0.01, default: 0.2,
      axisEligible: true, axisRange: [0.1, 0.35],
      description: "活性因子 u の拡散係数。パターンの基本スケールを決める。大きくすると特徴サイズが粗くなりスポットが大きくなる。小さくすると細かいパターンになる。",
    },
    {
      key: "ratio", label: "拡散比 Dv/Du", symbol: "Dv/Du",
      min: 5, max: 20, step: 0.5, default: 18,
      axisEligible: true, axisRange: [8, 20],
      description: "基質拡散と活性因子拡散の比(Dv=Du·ratio)。チューリング不安定性の駆動力。大きくすると分離が強まり明瞭なスポット/縞が出る。小さすぎると一様状態が安定しパターンが消える。",
    },
  ],
  defaultXKey: "a",
  defaultYKey: "b",
  dt: 0.035,
  stepsBase: 40,
  brushChannel: 0,
  brushValue: 2.5,
  updateGlsl: /* glsl */ `
float Dv = Du * ratio;
float u = c.r;
float v = c.g;
float reac = u * u * v;
float du = Du * lap.r + a - u + reac;
float dv = Dv * lap.g + b - reac;
float un = clamp(u + uDt * du, 0.0, 4.0);
float vn = clamp(v + uDt * dv, 0.0, 4.0);
vec4 next = vec4(un, vn, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
float u0 = a + b;
float v0 = b / max((a + b) * (a + b), 1e-3);
float u = u0 + 0.02 * (n1 - 0.5);
float v = v0 + 0.02 * (n2 - 0.5);
vec4 seed = vec4(clamp(u, 0.0, 4.0), clamp(v, 0.0, 4.0), 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = smoothstep(0.6, 1.6, s.r);
`,
};
