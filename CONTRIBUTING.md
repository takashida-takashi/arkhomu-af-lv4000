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
node scripts/build-userscripts.cjs
node --check dist/arkhomu-af-lv4000.user.js
```

プルリクエストではGitHub Actionsがソースの構文と配布ファイルの生成を確認します。生成物は `dist/` に出力されます。通常の機能追加PRにはソースの変更を含めてください。配布サイトが読むルートのZIP、メタデータ、ユーザースクリプトは、メンテナーがリリース時に更新します。

## 配布版を作る

メンテナーはバージョンを `extension/manifest.json` と配布ページ `index.html` に反映します。そのバージョンのZIPを `dist/arkhomu-af-lv4000-v<バージョン>.zip` に作ります。展開したときは `arkhomu-af-lv4000/` の中に `manifest.json` が入る構成にします。

Windows（PowerShell）

```powershell
$version = node -p 'require("./extension/manifest.json").version'
New-Item -ItemType Directory -Force dist/arkhomu-af-lv4000
Copy-Item extension/* dist/arkhomu-af-lv4000 -Recurse -Force
Compress-Archive -Path dist/arkhomu-af-lv4000 -DestinationPath "dist/arkhomu-af-lv4000-v$version.zip" -Force
```

macOS・Linux

```sh
version=$(node -p 'require("./extension/manifest.json").version')
mkdir -p dist/arkhomu-af-lv4000
cp -R extension/. dist/arkhomu-af-lv4000/
(cd dist && zip -q -r "arkhomu-af-lv4000-v$version.zip" arkhomu-af-lv4000)
```

`node scripts/build-userscripts.cjs --pages` を実行します。動作を確認したうえで `dist/pages/` の中身をリポジトリのルートに反映し、リリースとしてコミットします。
