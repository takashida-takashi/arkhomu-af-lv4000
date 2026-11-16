"use strict";

const screenshots = {
  settings: {
    title: "拡張設定を開く",
    steps: [[49, 17, "「拡張更新」で使用中のバージョンを確認"], [85, 43, "使いたい機能だけオンにする"]]
  },
  "af-detail": {
    title: "AF詳細の予測値",
    steps: [[91, 4, "「拡張予測」で詳細の予測表示を切り替える"], [66, 16, "現在値 → Lv4000予測値を確認"], [63, 12, "Lv4000未満の装備は「Lv4000予測をコピー」から共有"]]
  },
  "af-filter": {
    title: "拡張フィルタの条件入力",
    steps: [[16, 55, "検索またはカテゴリから比較項目を選ぶ"], [62, 21, "下限・上限・その項目の★を設定"], [62, 14, "AND・OR・指定数以上を選択。「＋ グループ」で入れ子にする"]]
  },
  explore: {
    title: "探索結果のAF表示",
    steps: [[14, 14, "一致したAFの個数と、レア度を問わないAFドロップ合計を確認"], [31, 55, "拡張フィルタと「全件表示」「優先度別ページ」を切り替える"], [9, 68, "枠と✓が付いたカードを確認し、✓を押して条件の内訳を開く"]]
  },
  "explore-matches": {
    title: "一致した条件の内訳",
    steps: [[4, 43, "どの条件に、どの値で一致したかを確認"]]
  },
  "explore-stats": {
    title: "探索統計の読み方",
    steps: [[47, 25, "「今回」「直近30日」「累計」を比較"], [16, 55, "1ストックあたりのAF・経験値・ゴールドと勝率を確認"], [84, 92, "編成を変えたら必要に応じて「統計をリセット」"]]
  },
  "party-share": {
    title: "編成を共有する",
    steps: [[4, 11, "「共有リンクをコピー」を押す"], [18, 11, "「画像を保存」なら1枚の画像で渡せる"], [9, 53, "個体ごとの「拡張育成ルートに取り込む」を押す"]]
  },
  "training-editor": {
    title: "育成ルートを作成・編集・削除",
    steps: [[51, 17, "「保存済みのルート」で編集するルートを選択"], [53, 56, "通常・永久スキルを1行ずつ入力"], [8, 90, "「保存」で更新。「削除」で選んだルートを削除"]]
  },
  "training-detail": {
    title: "個体に育成ルートを割り当てる",
    steps: [[8, 23, "「拡張育成ルートを読み込む」で個体に設定"], [33, 23, "「設定中のルートを編集」で開き直す"], [7, 76, "不足スキルと図鑑での入手元を確認"]]
  },
  "training-grant": {
    title: "必要な永久スキルを付与する",
    steps: [[5, 94, "訓練所のスキル付与で、ルート設定済みの個体を選択"], [10, 32, "所持スキル一覧の先頭にある、未付与の必要スキルを確認"]]
  },
  "training-inherit": {
    title: "覚えるスキルと覚えないスキルをまとめて設定",
    steps: [[41, 33, "合成で使う育成ルートが選ばれているか確認"], [5, 44, "「一括選択」をオンにすると候補に反映"], [19, 90, "結果を確認し、ゲームの画面から合成する"]]
  },
  notifications: {
    title: "ホームの拡張通知",
    steps: [[11, 14, "見出しを押すと開閉。最後の状態を記憶"], [31, 58, "予定時刻や未実行の項目を確認"]]
  },
  "watch-item": {
    title: "素材の所持数・目標数",
    steps: [[7, 15, "倉庫のアイテム詳細で通知を登録・解除"], [26, 15, "目標数を入力"]]
  },
  estimate: {
    title: "AFをLv4000にする費用の目安",
    steps: [[14, 9, "強化画面で「拡張強化見積もり（Lv4000）」を開く"], [30, 24, "「フリマの売上平均を取得・反映」を押す"], [71, 87, "必要素材数・強化費用・合計を比較"]]
  },
  gacha: {
    title: "ガチャで出たAFを確認",
    steps: [[36, 83, "AFガチャ・スーパーガチャの結果で、PWとAF＋ドロップ合計を確認"]]
  }
};

function renderShot(figure) {
  const id = figure.dataset.shot;
  const { title, steps } = screenshots[id];
  const heading = document.createElement("h3");
  heading.textContent = title;
  const screen = document.createElement("a");
  screen.className = "screen";
  screen.href = "./images/" + id + ".png";
  screen.target = "_blank";
  screen.rel = "noopener";
  screen.setAttribute("aria-label", title + "の画像を拡大");
  const image = document.createElement("img");
  image.src = screen.href;
  image.alt = title + "の画面例";
  image.loading = "lazy";
  screen.append(image);
  const captions = document.createElement("ol");
  captions.className = "figure-steps";
  steps.forEach(([x, y, text], index) => {
    const marker = document.createElement("span");
    marker.className = "marker";
    marker.style.setProperty("--x", x + "%");
    marker.style.setProperty("--y", y + "%");
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = index + 1;
    screen.append(marker);
    const line = document.createElement("li");
    line.textContent = text;
    captions.append(line);
  });
  screen.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const dialog = document.createElement("dialog");
    dialog.className = "zoom";
    dialog.setAttribute("aria-label", title);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "閉じる";
    close.addEventListener("click", () => dialog.close());
    const annotated = document.createElement("div");
    annotated.className = "screen";
    annotated.append(...Array.from(screen.children, child => child.cloneNode(true)));
    dialog.append(close, annotated, captions.cloneNode(true));
    dialog.addEventListener("close", () => { dialog.remove(); screen.focus(); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
  figure.append(heading, screen, captions);
}

for (const figure of document.querySelectorAll("[data-shot]")) renderShot(figure);
