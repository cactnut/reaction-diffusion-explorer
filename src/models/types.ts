/** マトリックスの軸 1 本ぶんの定義 */
export interface AxisDef {
  /** URL クエリやラベルに使う短いキー (例: "k") */
  key: string;
  /** 表示名 (例: "kill rate k") */
  label: string;
  /** パラメータとして許容する下限・上限 */
  min: number;
  max: number;
  /** 入力 UI の刻み */
  step: number;
  /** マトリックス初期表示の範囲 */
  defaultRange: [number, number];
  /** 単体ビュー初期値 */
  defaultValue: number;
}

/**
 * 反応拡散モデルの定義。
 * シミュレーションは 2 成分 (state.rg) を前提とし、モデルごとの違いは
 * GLSL チャンクと軸定義で表現する。新しいモデルはこの interface を実装して
 * models/index.ts の registry に追加する。
 */
export interface RDModel {
  id: string;
  name: string;
  /** 横軸 (マトリックスの列方向) */
  xAxis: AxisDef;
  /** 縦軸 (マトリックスの行方向) */
  yAxis: AxisDef;
  /** 時間刻み */
  dt: number;
  /**
   * 1 ステップの更新式。利用できる変数:
   *   vec2 c    — 現在の状態 (c.r, c.g)
   *   vec2 lap  — 9 点ラプラシアン
   *   float px  — 横軸パラメータ (このタイルの値)
   *   float py  — 縦軸パラメータ
   *   float uDt — 時間刻み
   * `vec2 next` に次の状態を代入すること。
   */
  updateGlsl: string;
  /**
   * 表示用のスカラー化。`vec2 s` (状態) から `float t` (0..1) を作る。
   */
  displayGlsl: string;
}
