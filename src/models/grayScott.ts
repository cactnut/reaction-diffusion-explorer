import type { RDModel } from "./types";

/**
 * Gray-Scott モデル。
 *   du/dt = Du ∇²u − u v² + F (1 − u)
 *   dv/dt = Dv ∇²v + u v² − (F + k) v
 * Du=1.0, Dv=0.5, dt=1.0 (9 点ラプラシアン正規化) は定番の安定設定。
 */
export const grayScott: RDModel = {
  id: "gray-scott",
  name: "Gray-Scott",
  xAxis: {
    key: "k",
    label: "kill rate k",
    min: 0.02,
    max: 0.08,
    step: 0.0005,
    defaultRange: [0.044, 0.07],
    defaultValue: 0.06,
  },
  yAxis: {
    key: "F",
    label: "feed rate F",
    min: 0.0,
    max: 0.12,
    step: 0.0005,
    defaultRange: [0.01, 0.09],
    defaultValue: 0.037,
  },
  dt: 1.0,
  updateGlsl: /* glsl */ `
    float F = py;
    float K = px;
    float u = c.r;
    float v = c.g;
    float uvv = u * v * v;
    vec2 next = clamp(vec2(
      u + (1.0 * lap.r - uvv + F * (1.0 - u)) * uDt,
      v + (0.5 * lap.g + uvv - (F + K) * v) * uDt
    ), 0.0, 1.0);
  `,
  displayGlsl: /* glsl */ `
    float t = smoothstep(0.04, 0.36, s.g);
  `,
};
