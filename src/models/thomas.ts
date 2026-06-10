import type { RDModel } from "./types";

export const thomas: RDModel = {
  id: "thomas",
  name: "Thomasモデル（基質阻害チューリング）",
  description: "固定化酵素による基質阻害反応のチューリング・モデル。基質u（酸素・尿酸アナログ）と補基質vが、反応項 ρ·u·v/(1+u+K·u²) を共有して結合する。uは速く拡散しvは遅く（あるいはその逆比で）拡散することでチューリング不安定性が生じ、均一状態から自発的にスポットやストライプが立ち上がる。古典的な定常パターン形成モデル。補基質の緩和率は textbook 値 α=1.5 を定数として埋め込んでいる。",
  speciesNote: "c.r = u（基質：拡散が速い活性化因子側、ブラシで注入する種）。c.g = v（補基質：拡散が遅い／比で大きく拡散する抑制側）。c.b と c.a は未使用（0.0）。補基質の緩和率 α は textbook 値 1.5 をシェーダ内の定数として固定（パラメータ化していない）。均一定常状態は a,b,ρ,K と固定の α=1.5 から定まる不動点で、textbook 値 a=150,b=100,ρ=13,K=0.05 では (u*,v*)≈(37.7,25.2)。",
  equations: [
    "∂u/∂t = Du·∇²u + a − u − ρ·u·v/(1 + u + K·u²)",
    "∂v/∂t = Dv·∇²v + α·(b − v) − ρ·u·v/(1 + u + K·u²),  α = 1.5,  Dv = Du·ratio",
  ],
  components: 2,
  resScale: 0.5,
  params: [
    {
      key: "a", label: "基質供給率 a", symbol: "a",
      min: 80, max: 250, step: 1, default: 150,
      axisEligible: true, axisRange: [110, 200],
      description: "基質uの一定供給量。均一定常状態の位置を決める主要パラメータ。上げるとuの平衡濃度が高まり、ある範囲ではスポットの数密度やパターンの種類（スポット↔ストライプ↔均一）が切り替わる。極端に上げ下げするとチューリング不安定領域を外れて均一状態に戻る。",
    },
    {
      key: "b", label: "補基質供給 b", symbol: "b",
      min: 50, max: 160, step: 1, default: 100,
      axisEligible: true, axisRange: [70, 130],
      description: "補基質vの目標濃度（固定のα=1.5で緩和される基準値）。aとの比がパターン形成領域を決める。上げるとvが豊富になり反応項が強まって、活性化因子uの抑制が強くなる。aとのバランスが崩れると不安定領域を外れ均一化する。",
    },
    {
      key: "ratio", label: "拡散比 Dv/Du", symbol: "Dv/Du",
      min: 5, max: 80, step: 1, default: 40,
      axisEligible: true, axisRange: [10, 60],
      description: "抑制側vと活性側uの拡散係数の比。チューリング不安定性の鍵。およそ30以上で均一状態が不安定化しパターンが出現する。上げるほどパターンの特徴波長が短くなり、スポットが細かく密になる。低いと均一状態のまま。",
    },
    {
      key: "Du", label: "基質拡散 Du", symbol: "Du",
      min: 0.1, max: 0.3, step: 0.01, default: 0.2,
      axisEligible: false, axisRange: [0.1, 0.3],
      description: "活性化因子uの拡散係数。Dv=Du·ratioで抑制側に連動する。上げるとパターン全体のスケール（特徴長）が大きくなり、模様が粗くなる。拡散マージンの制約からこの値とratioの積で拡散側の時間刻みが決まるため範囲を絞っている。",
    },
    {
      key: "rho", label: "反応強度 ρ", symbol: "ρ",
      min: 8, max: 20, step: 0.5, default: 13,
      axisEligible: true, axisRange: [9, 18],
      description: "基質阻害反応 ρ·u·v/(1+u+K·u²) の全体強度。uとvの消費速度を決める。上げると反応による結合が強まり、パターンのコントラストが増す一方、強すぎると不動点が移動して不安定領域を外れることがある。高ρ・高K・小a・大b では u* が 0 に近づき反応が剛性化するため、時間刻みを十分小さく取っている。",
    },
    {
      key: "K", label: "基質阻害係数 K", symbol: "K",
      min: 0.02, max: 0.1, step: 0.005, default: 0.05,
      axisEligible: true, axisRange: [0.03, 0.08],
      description: "基質阻害の非線形性（分母のK·u²項）。高u域で反応を頭打ちにする飽和・阻害効果。上げると高濃度の基質で反応が抑えられ、スポットのピーク濃度が低くなりパターンの形状が変化する。",
    },
  ],
  defaultXKey: "ratio",
  defaultYKey: "a",
  dt: 0.0006,
  stepsBase: 150,
  // 剛性は反応項のみ。拡散は緩い (最悪 Dv=Du·ratio=0.3·80=24) ので演算子分割が効く。
  // R=10 で dt_frame=0.006、拡散安定 0.006·24·2=0.29<1 を満たす。チューリング模様は
  // 定常状態に収束するためラプラシアン遅延は過渡だけに効き、最終模様は不変。
  // テクスチャパスを 150→15/フレームに削減 (×4 で 600→60)。反応式が Oregonator より
  // 重く R≥25 では ANGLE/Metal で性能が崩れるため R=10 に留める (M1 実測で ×4 60fps)。
  reactionSubsteps: 10,
  brushChannel: 0,
  brushValue: 120.0,
  updateGlsl: /* glsl */ `
float u = c.r;
float v = c.g;
float alpha = 1.5;
float Dv = Du * ratio;
float denom = max(1.0 + u + K * u * u, 1e-3);
float h = rho * u * v / denom;
float du = Du * lap.r + a - u - h;
float dv = Dv * lap.g + alpha * (b - v) - h;
float un = clamp(u + uDt * du, 0.0, 400.0);
float vn = clamp(v + uDt * dv, 0.0, 400.0);
vec4 next = vec4(un, vn, 0.0, 0.0);
`,
  seedGlsl: /* glsl */ `
float alpha = 1.5;
float guess_u = a * 0.25 + 1.0;
float guess_v = b * 0.25 + 1.0;
float u0 = guess_u;
float v0 = guess_v;
for (int i = 0; i < 40; i++) {
  float denom = max(1.0 + u0 + K * u0 * u0, 1e-3);
  float h = rho * u0 * v0 / denom;
  float f1 = a - u0 - h;
  float f2 = alpha * (b - v0) - h;
  float dh_du = rho * v0 * (denom - u0 * (1.0 + 2.0 * K * u0)) / (denom * denom);
  float dh_dv = rho * u0 / denom;
  float j11 = -1.0 - dh_du;
  float j12 = -dh_dv;
  float j21 = -dh_du;
  float j22 = -alpha - dh_dv;
  float det = j11 * j22 - j12 * j21;
  det = (abs(det) < 1e-4) ? (det >= 0.0 ? 1e-4 : -1e-4) : det;
  float dU = (-f1 * j22 + f2 * j12) / det;
  float dV = (-j11 * f2 + j21 * f1) / det;
  u0 += dU;
  v0 += dV;
}
u0 = clamp(u0, 0.0, 400.0);
v0 = clamp(v0, 0.0, 400.0);
float us = u0 + 0.04 * u0 * (n1 - 0.5);
float vs = v0 + 0.04 * v0 * (n2 - 0.5);
vec4 seed = vec4(max(us, 0.0), max(vs, 0.0), 0.0, 0.0);
`,
  displayGlsl: /* glsl */ `
float t = clamp(s.r / 90.0, 0.0, 1.0);
`,
};
