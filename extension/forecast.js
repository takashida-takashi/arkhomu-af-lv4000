(() => {
  "use strict";

  // artifact-v9 の実測ベースの経験式。ゲームの公式式ではない。
  const DEFAULT_TARGET = 4500;
  const MAX_TARGET = 1_000_000;
  const MAX_ESTIMATE_TARGET = 100_000;
  const targetEvent = "hako-af:forecast-target";
  const settingsKey = "hakoAf4000:settings";
  const normalizeTarget = value => {
    const level = Number(value);
    return Number.isSafeInteger(level) && level >= 1 && level <= MAX_TARGET ? level : DEFAULT_TARGET;
  };
  function storedTarget() {
    try { return normalizeTarget(JSON.parse(localStorage.getItem(settingsKey))?.forecastTarget); }
    catch { return DEFAULT_TARGET; }
  }
  let target = storedTarget();
  const getTarget = () => target;
  function setTarget(value) {
    const next = normalizeTarget(value);
    if (next === target) return;
    target = next;
    document.dispatchEvent(new CustomEvent(targetEvent, { detail: String(target) }));
  }
  globalThis.document?.addEventListener(targetEvent, event => {
    if (typeof event.detail === "string") target = normalizeTarget(event.detail);
  });
  globalThis.window?.addEventListener("storage", event => {
    if (event.key === settingsKey || event.key === null) setTarget(storedTarget());
  });
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
      ? (level < target ? curve(target) / curve(level) : 1)
      : null;
  }

  function projected(value, multiplier) {
    if (!value || multiplier === null) return null;
    // Additional hits are a count, including the count already granted by a prefix.
    const raw = value.unit === "回" || value.fixed ? value.n : value.n * multiplier;
    if (!Number.isFinite(raw)) return null;
    return value.unit === "%" ? Number(raw.toFixed(2)) : Math.round(raw);
  }

  function text(n, unit, signed) {
    return (signed && n >= 0 ? "+" : "") +
      (unit === "%" ? n.toFixed(2) : integerFormat.format(n)) + unit;
  }

  globalThis.hakoAf4000 = Object.freeze({ get TARGET() { return target; }, DEFAULT_TARGET, MAX_TARGET, MAX_ESTIMATE_TARGET,
    getTarget, setTarget, normalizeTarget, targetEvent, normalize, levelFrom, valueFrom, ratio, projected, text });
})();
