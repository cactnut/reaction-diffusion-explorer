/** モデルのパラメータ 1 つぶんの定義 */
export interface ParamDef {
  /** GLSL の変数名にそのまま使う識別子 (例: "F", "k", "Du")。シェーダ内でこの名前で参照できる */
  key: string;
  /** 表示名 (日本語) */
  label: string;
  /** 数式記号 (例: "F", "Dᵥ") */
  symbol: string;
  /** 固定値スライダーの下限・上限・刻み */
  min: number;
  max: number;
  step: number;
  /** 軸に乗っていないときの固定値 */
  default: number;
  /** マトリックスの軸に選べるか */
  axisEligible: boolean;
  /** 軸に乗せたときの初期スイープ範囲 */
  axisRange: [number, number];
  /** このパラメータが何を制御し、上げると模様がどう変わるか (日本語) */
  description: string;
}

/**
 * 反応拡散モデルの定義。
 *
 * 状態は最大 4 成分 (RGBA float テクスチャ)。`components` で使う成分数を宣言する。
 * GLSL チャンクは vec4 ベースで書き、使う成分だけ参照する (例: 2 成分なら c.r, c.g)。
 */
export interface RDModel {
  id: string;
  name: string;
  /** モデルの説明 (日本語、1〜2 文) */
  description: string;
  /** 各成分が何を表すか (日本語) */
  speciesNote: string;
  /** 支配方程式の人間可読表現 (Unicode、成分ごとに 1 行) */
  equations: string[];
  /** 状態変数の数 (1〜4)。表示・初期化の参考。シェーダは常に vec4 */
  components: number;
  /**
   * シミュレーション解像度の倍率 (既定 1)。Turing 波長が短く模様が細かすぎるモデルは
   * 1 未満にすると、タイルあたりの波の数が減って画面上で模様が大きく見える (拡散係数を
   * いじらないので安定性に影響しない)。
   */
  resScale?: number;
  /** 調整できるパラメータ */
  params: ParamDef[];
  /** マトリックス初期表示で横軸・縦軸に乗せるパラメータの key */
  defaultXKey: string;
  defaultYKey: string;
  /** 時間刻み */
  dt: number;
  /**
   * 速度 ×1 のとき 1 フレームで進めるサブステップ数。dt が小さいモデルほど大きくする
   * (dt·stepsBase ≈ 1 フレームで進む時間)。速度セグメントがこの値を倍率で掛ける。既定 8
   */
  stepsBase?: number;
  /** ブラシで描き足す成分のインデックス (0=r,1=g,2=b,3=a)。既定 1 */
  brushChannel?: number;
  /**
   * ブラシで塗る値。状態のレンジはモデルごとに違う (例: Brusselator の u≈2、Thomas の u≈90)
   * ため、その成分の「明るい / 励起した」値にする。既定 0.9 (状態が [0,1] のモデル用)
   */
  brushValue?: number;
  /**
   * 1 ステップの更新式。スコープに以下が用意される:
   *   vec4  c    — 現在の状態
   *   vec4  lap  — 正規化 9 点ラプラシアン (近傍加重平均 − 中心)
   *   vec4  gx   — x 方向の中心差分勾配 ((E − W) * 0.5)
   *   vec4  gy   — y 方向の中心差分勾配 ((N − S) * 0.5)
   *   float uDt  — 時間刻み
   *   float <key> — 各パラメータ (key 名でそのまま参照可)
   * `vec4 next` に次の状態を代入すること。発散しうるなら clamp / 除算ガードを入れる。
   */
  updateGlsl: string;
  /**
   * 初期状態。スコープに以下が用意される:
   *   vec2  pos  — タイル内の正規化座標 [0,1] (x: 左→右, y: 下→上)
   *   float dc   — タイル中心からの正規化距離 (中心 0、辺の中点で 1 付近)
   *   float n1..n4 — texel ごとに独立な一様乱数 [0,1]
   *   float t1..t4 — タイルごとに一定の乱数 [0,1] (斑点の中心位置などに使う)
   *   float <key> — 各パラメータ (Turing 系は均一平衡の計算に使う)
   * `vec4 seed` に初期値を代入すること。
   */
  seedGlsl: string;
  /** 表示用スカラー化。`vec4 s` から `float t` (0..1) を作る */
  displayGlsl: string;
}

export function getParam(model: RDModel, key: string): ParamDef {
  const p = model.params.find((x) => x.key === key);
  if (!p) throw new Error(`unknown param: ${key}`);
  return p;
}
