# 開発に参加する

1. GitHubの **Fork** でこのリポジトリをフォークし、自分のフォークをクローンします。
2. 作業ブランチを作り、`extension/` のソースを変更します。PCではChromeまたはEdgeの拡張機能ページでデベロッパーモードを有効にし、`manifest.json` がある `extension/` を「パッケージ化されていない拡張機能」として読み込んで動作を確認できます。普段の配布版と重なる場合は、テスト中だけそちらを無効にしてください。
3. フォークにブランチをプッシュし、このリポジトリの `main` にプルリクエストを開きます。変更内容、確認した画面と端末、再現手順を添えてください。

## ソースの場所

- `extension/content.js` と `extension/read-af.js` に、AFの予測表示・絞り込み・標準画面との連携があります。
- `extension/extras.js` と `extension/extras-main.js` に、拡張設定やホーム通知などがあります。
- `extension/manifest.json` がChrome・Edge用の構成です。`scripts/build-userscripts.cjs` が同じソースからスマホ用スクリプトを生成します。モバイルでも使うモジュールを追加する場合は、ビルドの読み込み順も更新してください。

機能追加では、ゲームの通常操作でページに読み込まれた情報を使ってください。自動操作や自動巡回、繰り返しのゲームAPI呼び出しは追加しないでください。スクリーンショットや再現データを添付する場合は、アカウント情報や認証情報を除いてください。

## ビルドを確認する

Node.js 22で、リポジトリのルートから実行します。

```sh
npm ci --ignore-scripts
node scripts/build-userscripts.cjs
node --check dist/arkhomu-af-lv4000.user.js
```

プルリクエストではGitHub Actionsがソースの構文と配布ファイルの生成を確認します。PRにはソースの変更を含めてください。配布ページの文章は `index.html` で編集できます。

## 配布の流れ

メンテナーが `main` にマージすると、GitHub ActionsがPC用ZIP、Android用Tampermonkeyスクリプト、iPhone・iPad用Userscriptsスクリプトをビルドします。ビルドが通ると3つのファイルと配布ページをまとめて公開します。配布番号は、拡張本体とモバイルの更新スクリプトの変更に合わせて進みます。取説や配布ページの編集時は直前の配布番号で公開します。

PCだけを更新するときは、`main` に入るコミットの件名の末尾に `[pc-only]` を付けます。この場合もPC用ZIPと配布ページを更新し、スマホ用ファイルは直前の通常配布と同じ内容を公開します。

公開結果は [Actions](https://github.com/takashida-takashi/arkhomu-af-lv4000/actions/workflows/check.yml) で確認できます。再実行する際は、最新の `main` で「Run workflow」を選びます。

手元で配布用のファイルを確認する場合は `node scripts/build-userscripts.cjs --pages` を実行します。Gitの全履歴とZIP作成コマンド（Windowsでは標準の `tar.exe`、macOS・Linuxでは `zip`）を使い、`dist/pages/` に出力します。
