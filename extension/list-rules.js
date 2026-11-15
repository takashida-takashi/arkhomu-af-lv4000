(() => {
  "use strict";

  const { TARGET, ratio, projected } = globalThis.hakoAf4000;
  const { readEffects } = globalThis.hakoAfEffects;
  const POWER = "power";
  const SUM = "rate_sum";
  const DROP = "trait:add_drop";
  const CONVERSION = "trait:add_artifact_rate";

  function sumRates(metrics, allowMissing = false) {
    const a = metrics.get(CONVERSION);
    const b = metrics.get(DROP);
    if (!allowMissing && (!a || !b)) return null;
    return { parts: [a, b].filter(Boolean), n: Number(((a?.n ?? 0) + (b?.n ?? 0)).toFixed(2)), unit: "%" };
  }

  function dropMetrics(snapshot, power = snapshot?.power) {
    const metrics = snapshot ? readEffects(snapshot) : new Map();
    if (snapshot) metrics.set(SUM, sumRates(metrics, true));
    if (Number.isFinite(power)) metrics.set(POWER, { n: power, unit: "" });
    return { metrics, level: snapshot?.level, complete: !!snapshot };
  }

  function metricValue(item, metric, forecast) {
    if (!metric) return null;
    if (!forecast || item.level >= TARGET) return metric.n;
    const multiplier = ratio(item.level);
    if (multiplier === null) return null;
    if (metric.parts) {
      const sum = metric.parts.reduce((n, part) => n + projected(part, multiplier), 0);
      return Number(sum.toFixed(2));
    }
    return projected(metric, multiplier);
  }

  function activeGroup(group) {
    const children = [];
    for (const child of group.children) {
      if (child.children) {
        const nested = activeGroup(child);
        if (nested.children.length) children.push(nested);
      } else if (activeCondition(child)) {
        children.push(child);
      }
    }
    return { join: group.join, minimum: minimumMatches(group), children };
  }

  function activeCondition(condition) {
    return condition.key !== POWER || !!(condition.min || condition.max);
  }

  function minimumMatches(group) {
    return Number.isSafeInteger(group.minimum) && group.minimum > 0 ? group.minimum : 2;
  }

  function evaluate(item, condition, forecast) {
    const metric = item.metrics.get(condition.key);
    if (!metric) return item.complete && condition.key !== POWER ? false : null;
    if (condition.stars) {
      if (metric.stars == null) return null;
      if (metric.stars < Number(condition.stars)) return false;
    }
    if (!condition.min && !condition.max) return true;
    const n = metricValue(item, metric, forecast);
    if (n === null) return null;
    return (!condition.min || n >= Number(condition.min)) && (!condition.max || n <= Number(condition.max));
  }

  function evaluateGroup(item, group, forecast, matches) {
    const { children } = group;
    const minimum = group.join === "count" ? group.minimum : group.join === "or" ? 1 : children.length;
    let unknown = 0;
    let matched = 0;
    let remaining = children.length;
    for (const child of children) {
      const nested = matches && child.children ? [] : undefined;
      const result = child.children ? evaluateGroup(item, child, forecast, nested) : evaluate(item, child, forecast);
      remaining--;
      if (result === true) {
        matched++;
        if (!matches && matched >= minimum) return true;
        matches?.push(...(nested ?? [child]));
      }
      if (result === null) unknown++;
      if (matched + unknown + remaining < minimum) return false;
    }
    return matched >= minimum ? true : matched + unknown >= minimum ? null : false;
  }

  function viewRule({ root, view, useForecast, showUnknown, kept }) {
    const group = activeGroup(root);
    const error = function validationError(node) {
      if (node.children) {
        if (node.children.length && node.join === "count" && node.minimum > node.children.length) {
          return `一致数 ${node.minimum} を満たすには、このグループに条件があと ${node.minimum - node.children.length} 件必要です。`;
        }
        return node.children.map(validationError).find(Boolean);
      }
      if (node.min && node.max && Number(node.min) > Number(node.max)) return "下限は上限以下にしてください。";
    }(group);
    const active = !error && group.children.length > 0;
    const unchecked = view === "unchecked";
    const discard = view === "discard" || unchecked;
    const checked = view === "kept";
    const keptIds = kept instanceof Set ? kept : new Set(kept);
    return {
      active, error, discard, checked,
      check(item, matches) {
        const kept = keptIds.has(item.keepId);
        const result = active ? evaluateGroup(item, group, useForecast, matches) : null;
        const candidate = active && (result === false || (unchecked && result === true)) && !kept;
        const unknown = active && (result === null || (discard && candidate && item.decomposable == null));
        let show = true;
        if (checked) show = kept;
        else if (discard) show = candidate && item.decomposable === true;
        else if (active) show = result === true || (result === null && showUnknown);
        return { show, kept, result, unknown, protected: discard && candidate && item.decomposable === false };
      }
    };
  }

  function orderItems(items, sort) {
    if (!sort?.key) return items;
    const ranked = items.map(item => ({ item, value: metricValue(item, item.metrics.get(sort.key), sort.forecast) }));
    const direction = sort.direction === "asc" ? 1 : -1;
    ranked.sort((a, b) => {
      if (a.value == null) return b.value == null ? 0 : 1;
      if (b.value == null) return -1;
      return direction * (a.value - b.value);
    });
    return ranked.map(row => row.item);
  }

  globalThis.hakoAfListRules = Object.freeze({ POWER, SUM, DROP, CONVERSION, sumRates, dropMetrics, metricValue,
    activeGroup, minimumMatches, viewRule, orderItems });
})();
