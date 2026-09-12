# 流用元

- `taksai/kaggle_pokepoke_2` commit `85f90938ebc44816f681b5e617da313c07ed2505`
- `tools/visualizer/player.html`: 盤面CSS、ベンチ・手札・サイド・中央フィールドのDOM構成を `src/board.css` / `src/board.js` に移植。
- PTCGLログの解析と分析画面はこのリポジトリで実装。既存ゲームエンジンは使用しません。
- 日本語辞書、カード情報、画像は `scripts/import-assets.py` で元リポジトリからローカルに取り込みます。`assets/` はGit管理対象外です。元プロジェクトの券面画像はチーム内利用限定・再配布禁止です。
- 名前で照合したカード情報・券面は参考表示です。PTCGLのセットIDと一致する保証はありません。

- `data/japanese-index.json`: 元プロジェクトの全カードから名称対訳（カード名・ワザ名のみ）を抽出し、TCGdexの公開日本語カード一覧 https://api.tcgdex.net/v2/ja/cards と照合。効果本文・画像は含みません。
- 公開版の日本語画像はTCGdexの公開API・画像URLを直接参照します（https://tcgdex.dev/assets）。元プロジェクトの制限付き画像の再配布ではありません。
