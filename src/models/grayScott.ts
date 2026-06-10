import type { RDModel } from "./types";

/**
 * Gray-Scott モデル。基質 u が自己触媒種 v に食われて反応する系。
 * 補充 (feed) と除去 (kill) のバランスで斑点・縞・コーラル状など多彩な模様が出る。
 */
export const grayScott: RDModel = {
  id: "gray-scott",
  name: "Gray-Scott",
  description:
    "基質 U が触媒種 V に変換される系。U を供給 (feed) し V を除去 (kill) する速度のバランスで、斑点・迷路・コーラル状・自己複製する模様が現れる。",
  speciesNote: "u = 基質の濃度、v = 自己触媒種の濃度。表示は v の濃いところを明色にしている。",
  equations: [
    String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u - u \cdot v^2 + F(1 - u)`,
    String.raw`\frac{\partial v}{\partial t} = D_v \nabla^2 v + u \cdot v^2 - (F + k)v`,
  ],
  components: 2,
  params: [
    {
      key: "F", label: "供給速度 feed", symbol: "F",
      min: 0.0, max: 0.1, step: 0.0005, default: 0.037,
      axisEligible: true, axisRange: [0.01, 0.09],
      description: "基質 U を補充する速度。大きいほど V が広がりやすく、模様が密になる。",
    },
    {
      key: "k", label: "除去速度 kill", symbol: "k",
      min: 0.02, max: 0.08, step: 0.0005, default: 0.06,
      axisEligible: true, axisRange: [0.044, 0.07],
      description: "触媒種 V を取り除く速度。大きいほど V が死にやすく、斑点が孤立していく。",
    },
    {
      key: "Du", label: "U の拡散 Dᵤ", symbol: "Dᵤ",
      min: 0.2, max: 1.2, step: 0.05, default: 1.0,
      axisEligible: true, axisRange: [0.6, 1.2],
      description: "基質の拡散の速さ。大きいほど模様の特徴が大きくなる。",
    },
    {
      key: "Dv", label: "V の拡散 Dᵥ", symbol: "Dᵥ",
      min: 0.1, max: 0.6, step: 0.025, default: 0.5,
      axisEligible: true, axisRange: [0.2, 0.6],
      description: "触媒種の拡散の速さ。U との拡散比が模様の細かさを決める。",
    },
  ],
  defaultXKey: "k",
  defaultYKey: "F",
  // dt=0.3: この正規化ラプラシアン (固有値 [-2,0]) では explicit Euler の安定条件が
  // dt·D < 1。dt=0.3 で dt·Du は最大 0.36 に収まり、安定かつ F,k の模様マップを保つ。
  dt: 0.3,
  stepsBase: 8,
  brushChannel: 1,
  updateGlsl: /* glsl */ `
    float uvv = c.r * c.g * c.g;
    vec4 next = vec4(
      clamp(c.r + (Du * lap.r - uvv + F * (1.0 - c.r)) * uDt, 0.0, 1.0),
      clamp(c.g + (Dv * lap.g + uvv - (F + k) * c.g) * uDt, 0.0, 1.0),
      0.0, 0.0);
  `,
  seedGlsl: /* glsl */ `
    float r = 0.06;
    vec2 c1 = vec2(0.5);
    vec2 c2 = vec2(0.18 + 0.64 * t1, 0.18 + 0.64 * t2);
    vec2 c3 = vec2(0.18 + 0.64 * t3, 0.18 + 0.64 * t4);
    float v = 0.0;
    v = max(v, step(length(pos - c1), r));
    v = max(v, step(length(pos - c2), r));
    v = max(v, step(length(pos - c3), r));
    v *= 0.85 + 0.15 * n1;
    vec4 seed = vec4(1.0, v, 0.0, 0.0);
  `,
  displayGlsl: /* glsl */ `
    float t = smoothstep(0.04, 0.36, s.g);
  `,
};
