(() => {
  "use strict";

  // artifact-v9 の実測ベースの経験式。ゲームの公式式ではない。
  const TARGET = 4000;
  const OFFSET = 199.1941276291921;
  const EXPONENT = 0.6999700116560543;
  const integerFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
  const normalize = value => String(value ?? "").normalize("NFKC").replace(/−/g, "-").trim();

  function levelFrom(value) {
    const m = normalize(value).match(/(?:^|\s)Lv\s*\.?\s*(\d[\d,]*)$/i);
    const level = m ? Number(m[1].replaceAll(",", "")) : NaN;
    return Number.isSafeInteger(level) && level >= 1 ? level : null;
  }

  function valueFrom(value) {
    const m = normalize(value).match(/^([+-]?)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|回)?$/);
    if (!m) return null;
    const n = Number(m[1] + m[2].replaceAll(",", ""));
    return Number.isFinite(n) ? { n, unit: m[3] || "" } : null;
  }

  function ratio(level) {
    const curve = lv => Math.pow((lv + OFFSET) / (1 + OFFSET), EXPONENT);
    return Number.isSafeInteger(level) && level >= 1
      ? (level < TARGET ? curve(TARGET) / curve(level) : 1)
      : null;
  }

  function projected(value, multiplier) {
    if (!value || multiplier === null) return null;
    const raw = value.n * multiplier;
    return value.unit === "%" ? Number(raw.toFixed(2)) : Math.round(raw);
  }

  function text(n, unit, signed) {
    return (signed && n >= 0 ? "+" : "") +
      (unit === "%" ? n.toFixed(2) : integerFormat.format(n)) + unit;
  }

  globalThis.hakoAf4000 = Object.freeze({ TARGET, normalize, levelFrom, valueFrom, ratio, projected, text });
})();
