# reaction-diffusion-explorer

反応拡散系のいいかんじのパラメータを探すためのツール。

Gray-Scott モデルのパラメータ空間 (横軸 = kill rate k、縦軸 = feed rate F) をタイル状のマトリックスで一括シミュレーションし、面白い模様が生まれる組み合わせを目で探せる。タイルをクリックするとそのパラメータで拡大表示され、スライダーで微調整したりドラッグで描き足したりできる。

https://cactnut.github.io/reaction-diffusion-explorer/

## 仕組み

- WebGL2 のフラグメントシェーダで 1 枚の float テクスチャを ping-pong 更新する
- マトリックスはテクスチャをタイル分割し、各タイルがタイル位置から線形補間した固有の (F, k) を持つ。タイル内はトーラス境界なので隣に漏れない
- モデルは [src/models/types.ts](src/models/types.ts) の `RDModel` interface (GLSL チャンク + 軸定義) で抽象化していて、[src/models/index.ts](src/models/index.ts) の registry に追加すれば増やせる。現状は Gray-Scott のみ

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm run build    # 型チェック + dist/ へビルド
```

main へ push すると GitHub Actions が GitHub Pages へデプロイする
(リポジトリ設定の Pages で Source を **GitHub Actions** にしておくこと)。
