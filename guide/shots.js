"use strict";

const screenshots = {
  "stat-compensation": {
    title: "変更前後の換算結果を確認する",
    filename: "stat-compensation.jpg",
    steps: [[3, 22, "比較している変更前・変更後の世代"], [3, 43, "同じ効果に相当するボーナスパラメータの加算量"], [36, 57, "AFで補う場合の追加ptと合計値"]]
  },
  "op-simulator": {
    title: "OPを選んで想定値を比較する",
    filename: "op-simulator.jpg",
    steps: [[3, 12, "試算するレア度とLvを指定"], [3, 24, "真・極の補正と、そろえる星の評価を指定"], [3, 42, "OPを追加・変更・削除。条件の変更は即時反映"], [3, 78, "見出しのLvと想定値を確認する"]]
  },
  "planner-search": {
    title: "タグやカテゴリでスキルを探す",
    filename: "planner-search.jpg",
    steps: [[19, 22, "名前・ID・効果を検索。タグ検索も組み合わせられる"], [38, 32, "「探索」などのカテゴリを選ぶ"], [9, 40, "必要に応じて「新規のみ」「スキルレベルあり」を指定"]]
  },
  "dungeon-rewards": {
    title: "出撃先選択で初回報酬を確認する",
    filename: "dungeon-rewards.jpg",
    steps: [[41, 46, "地図下の「拡張初回報酬」で黒字のダンジョンに絞る"], [34, 51, "ダンジョン名の行を開く"], [51, 68, "フロア・難易度別のポーション個数と収支を確認"]]
  },
  "planner-home": {
    title: "ホームの「その他」から開く",
    filename: "planner-home.jpg",
    steps: [[9, 75, "ホームの行動メニューにある「拡張育成プランナー」を押す"]]
  },
  "planner-start": {
    title: "新規作成または編集を選ぶ",
    filename: "planner-start.jpg",
    steps: [[7, 78, "新しく組む場合は「新規作成」"], [42, 78, "保存したルートを開く場合は「保存済みルートを編集」"]]
  },
  "planner-monster": {
    title: "育成対象を図鑑から選ぶ",
    filename: "planner-monster.jpg",
    steps: [[16, 37, "名前で検索。種族・ランク・カテゴリなどでも探せる"], [14, 69, "育成したいホムのカードを押す"]]
  },
  "planner-skills": {
    title: "スキルを追加し、ルートを組む",
    filename: "planner-skills.jpg",
    steps: [[22, 44, "追加先を「通常スキル」「永久スキル」から選び、候補の「追加」を押す"],
      [36, 69, "候補の「スキルLvあり」を確認。スキル名を押すと説明が開く"],
      [73, 80, "追加済みのスキルはLvを指定したり、通常・永久の間で移したりできる"],
      [96, 11, "ルート名を入力。編成単位で整理する場合はグループ名も入れる"],
      [96, 40, "Rank 6固有パッシブは枠外。無効化できるものにはON・OFFが出る"]]
  },
  "planner-save": {
    title: "画面下で育成ルートを保存",
    filename: "planner-save.jpg",
    steps: [[42, 54, "「拡張育成ルートに保存」を押す。編集中のルートでは「変更を保存」"]]
  },
  "planner-preview-inputs": {
    title: "通常モードの試算条件を入力",
    filename: "planner-preview-inputs.jpg",
    steps: [[40, 4, "「完成形プレビュー」を開く"], [34, 36, "世代値・ボーナスパラメータを入力し、必要に応じて完成時のランクを選ぶ"],
      [40, 95, "「アーティファクトを選ぶ」で試算用のAFを指定"]]
  },
  "planner-preview-result": {
    title: "ステータスと適正を確認する",
    filename: "planner-preview-result.jpg",
    steps: [[53, 8, "「基準」と「完成時」を比較。本人・AF・味方の補正も確認できる"],
      [15, 67, "下にスクロールすると適正の表も見られる"]]
  },
  "planner-af": {
    title: "選んだAFを完成形に反映する",
    filename: "planner-af.jpg",
    steps: [[54, 25, "標準の「通常」「ボス／天昇の塔」「PvP」の装備を読み込める"],
      [40, 81, "AF名・並び順・レア度・お気に入りで候補を探し、下の一覧でカードを選ぶ"],
      [31, 93, "拡張フィルタとLv4500予測を使って比較できる。試算には選んだAFの現在値を使用する"]]
  },
  "planner-official": {
    title: "公式戦の開幕ステータスを確認する",
    filename: "planner-official.jpg",
    steps: [[37, 6, "ルールを「公式戦」に切り替える"], [63, 27, "Lv100での試算結果を確認"]]
  },
  "guild-dungeon-filter": {
    title: "道中とボスを分けて絞り込む",
    filename: "guild-dungeon-filter.jpg",
    steps: [[48, 63, "「難易度・編成」から探したい項目を選ぶ"],
      [51, 46, "「道中のホムンクルス」なら名前、「難易度」なら条件値を指定する"],
      [79, 37, "条件を複数使う場合は、AND・OR・指定数以上などでつなぐ"],
      [74, 88, "「未確認のダンジョンも表示」で、詳細を確認したい行を表示する"]]
  },
  "box-management": {
    title: "ボックスを作り、引き継ぎを設定する",
    filename: "box-management.jpg",
    steps: [[81, 21, "新しいボックス名を入力して「追加」"],
      [70, 33, "まとめて振り分ける場合は「条件で一括追加」"],
      [40, 53, "素材用など、子を入れたくないボックスは「合成後の子を入れる」をオフにする"]]
  },
  "box-bulk": {
    title: "世代・レベル・元ランクで一括追加",
    filename: "box-bulk.jpg",
    steps: [[65, 23, "追加先のボックスを選ぶ。画像ではボックス名と追加対象数を伏せています"],
      [78, 55, "世代・レベル・元ランクのうち、使いたい条件を入力する"],
      [76, 85, "該当・追加・登録済みの数を確認し、「該当するホムを追加」を押す"]]
  },
  settings: {
    title: "拡張設定を開く",
    steps: [[23, 18, "「拡張更新」で使用中のバージョンを確認"], [91, 43, "使いたい機能だけオンにする"]]
  },
  "af-detail": {
    title: "AF詳細の予測値",
    steps: [[74, 8, "「拡張予測」で詳細の予測表示を切り替える"], [69, 61, "各項目の現在値と、その下に出るLv4500予測値を確認"], [95, 13, "Lv4500未満の装備は「Lv4500予測をコピー」から共有"]]
  },
  "af-filter": {
    title: "拡張フィルタの条件入力",
    steps: [[19, 56, "検索またはカテゴリから比較項目を選ぶ"], [83, 49, "下限・上限・その項目の★を設定"], [47, 38, "AND・OR・指定数以上を選択。「＋ グループ」で入れ子にする"], [72, 18, "繰り返し使う条件はプリセットとして保存"]]
  },
  explore: {
    title: "探索結果のAF表示",
    steps: [[9, 18, "フィルタに一致したAFの個数を確認"], [50, 48, "全レア度を含むAFのドロップ合計を確認"], [65, 64, "拡張フィルタと「全件表示」「優先度別ページ」を切り替える"], [7, 92, "色付きの枠を確認し、カードの✓を押して一致条件を開く"]]
  },
  "explore-matches": {
    title: "一致した条件の内訳",
    steps: [[67, 75, "どの条件に、どの値で一致したかを確認"]]
  },
  "explore-stats": {
    title: "探索統計の読み方",
    steps: [[49, 24, "「今回」「直近30日」「累計」を比較"], [26, 56, "1ストックあたりのAF・経験値・ゴールドと勝率を確認"], [84, 93, "編成を変えたら必要に応じて「統計をリセット」"]]
  },
  "expedition-open": {
    title: "遠征中に次の遠征画面を開く",
    filename: "expedition-open.jpg",
    steps: [[17, 86, "遠征の進行状況で「遠征画面を開く」を押す"]]
  },
  "expedition-members": {
    title: "次の遠征メンバーを選ぶ",
    filename: "expedition-members.jpg?v=roster",
    steps: [[27, 22, "所持ホムンクルスから次のメンバーを選ぶ"], [84, 96, "「次へ：弁当を選ぶ」を押す"]]
  },
  "expedition-plan": {
    title: "配分を計算して弁当欄に入れる",
    filename: "expedition-plan.jpg",
    steps: [[78, 9, "比較方法と制限時間を設定する"], [32, 44, "くり返しを含めるか選び、「配分を計算」を押す"], [41, 93, "1体あたりの上昇量・時間・回数を確認し、「この配分をセット」を押す"]]
  },
  "expedition-weights": {
    title: "能力ごとの重みと最低値を設定する",
    filename: "expedition-weights.jpg",
    steps: [[76, 15, "比較方法で「カスタム（重み・最低値）」を選ぶ"], [39, 83, "例では体力を1、速度を1.5として比較"], [74, 38, "最低値には1体あたりの上昇量を指定する"]]
  },
  "expedition-food": {
    title: "配分計算に使う食材を指定する",
    filename: "expedition-food.jpg",
    steps: [[30, 42, "「食材の使用条件」で最高レア度を設定する"], [27, 65, "除外候補を探す。並び順は標準一覧に合わせることもできる"], [78, 38, "カード右下の「除外」で計算対象から外す。「除外中」を押すと解除"]]
  },
  "party-share": {
    title: "編成を共有する",
    filename: "party-share.png?v=masked",
    steps: [[8, 33, "「共有リンクをコピー」を押す"], [27, 33, "「画像を保存」なら1枚の画像で渡せる"]]
  },
  "party-import": {
    title: "共有された個体を育成に使う",
    steps: [[27, 82, "個体カードの下までスクロールし、「拡張育成ルートに取り込む」を押す"]]
  },
  "training-editor": {
    title: "育成ルートを作成・編集・削除",
    steps: [[53, 19, "「保存済みのルート」で編集するルートを選択"], [49, 52, "通常・永久スキルを1行ずつ入力"], [19, 91, "「保存」で更新。「削除」で選んだルートを削除"]]
  },
  "training-detail": {
    title: "個体に育成ルートを割り当てる",
    steps: [[18, 42, "「拡張育成ルートを読み込む」で個体に設定"], [49, 42, "「設定中のルートを編集」で開き直す"], [37, 83, "不足スキルと図鑑での入手元を確認"], [77, 42, "世代上げに使う個体は「世代上げ母体に指定」"]]
  },
  "training-grant": {
    title: "必要な永久スキルを付与する",
    filename: "training-grant.png?v=masked",
    steps: [[64, 44, "訓練所のスキル付与で、ルート設定済みの個体を選択"], [27, 42, "所持スキル一覧では、名前でも検索できる"], [21, 63, "緑の枠が付いた未付与の必要スキルを確認"]]
  },
  "training-inherit": {
    title: "覚えるスキルと覚えないスキルをまとめて設定",
    steps: [[45, 11, "合成で使う育成ルートが選ばれているか確認"], [4, 15, "「一括選択」をオンにすると候補に反映"], [76, 97, "結果を確認し、「内容を確認」から合成の確認へ"]]
  },
  "mating-start": {
    title: "世代上げで押す継承生成ボタン",
    steps: [[62, 93, "母体と素材を確認して「このホムンクルスを継承生成する」を押す"]]
  },
  notifications: {
    title: "ホームの拡張通知",
    steps: [[11, 14, "見出しを押すと開閉。最後の状態を記憶"], [51, 52, "予定時刻や未実行の項目を確認"]]
  },
  "watch-item": {
    title: "素材の所持数・目標数",
    steps: [[12, 20, "倉庫のアイテム詳細で通知を登録・解除"], [43, 20, "必要なら目標数を入力"]]
  },
  estimate: {
    title: "AFをLv4500にする費用の目安",
    steps: [[76, 7, "強化画面で「拡張強化見積もり（Lv4500）」を開く"], [62, 23, "「フリマの売上平均を取得・反映」を押す"], [66, 85, "必要素材数・強化費用・合計を比較"]]
  },
  gacha: {
    title: "拡張フィルタと拡張セット",
    steps: [[29, 37, "拡張フィルタで投入候補を絞る"], [21, 83, "使う場合は「拡張セットを使う」をチェック"], [76, 92, "追加候補の個数と連数を確認"]]
  }
};

function renderShot(figure) {
  const id = figure.dataset.shot;
  const { title, steps, filename = id + ".png" } = screenshots[id];
  const heading = document.createElement("h3");
  heading.textContent = title;
  const screen = document.createElement("a");
  screen.className = "screen";
  screen.href = "./images/" + filename;
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
    const original = document.createElement("a");
    original.href = screen.href;
    original.target = "_blank";
    original.rel = "noopener";
    original.textContent = "原寸画像を開く";
    dialog.append(close, annotated, captions.cloneNode(true), original);
    dialog.addEventListener("close", () => { dialog.remove(); screen.focus(); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
  figure.append(heading, screen, captions);
}

for (const figure of document.querySelectorAll("[data-shot]")) renderShot(figure);
