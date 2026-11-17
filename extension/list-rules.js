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

  function activeGroup(group, origins) {
    const children = [];
    for (const child of group.children) {
      if (child.children) {
        const nested = activeGroup(child, origins);
        if (nested.children.length) children.push(nested);
      } else if (activeCondition(child)) {
        children.push(child);
      }
    }
    const active = { join: group.join, minimum: minimumMatches(group), children };
    origins?.set(active, group);
    return active;
  }

  function activeCondition(condition) {
    return condition.key !== POWER || !!(condition.min || condition.max);
  }

  function minimumMatches(group) {
    return Number.isSafeInteger(group.minimum) && group.minimum > 0 ? group.minimum : 2;
  }

  function supportsAbsence(key) {
    return key.startsWith("trait:") || key.startsWith("stat_");
  }

  function evaluate(item, condition, forecast) {
    const metric = item.metrics.get(condition.key);
    if (condition.absent === true) return metric ? false : item.complete ? true : null;
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

  function sectionLayout(group, origins) {
    const sections = [];
    const indexes = new Map();
    function indexLeaves(node, index) {
      if (node.children) node.children.forEach(child => indexLeaves(child, index));
      else indexes.set(node, index);
    }
    function visit(node) {
      if (node.children && (node.join !== "and" || node.children.length === 1)) {
        node.children.forEach(visit);
        return;
      }
      indexLeaves(node, sections.length);
      sections.push({ source: origins.get(node) ?? node, condition: node });
    }
    visit(group);

    const pages = [];
    const grouped = new Map();
    const pageBySection = sections.map(({ source }, index) => {
      const name = typeof source.sectionPage === "string" ? source.sectionPage.trim() : "";
      if (name && grouped.has(name)) {
        const page = grouped.get(name);
        pages[page].indexes.push(index);
        return page;
      }
      const page = pages.length;
      if (name) grouped.set(name, page);
      pages.push({ name, indexes: [index] });
      return page;
    });
    return { sections, indexes, pages, pageBySection };
  }

  function viewRule({ root, view, useForecast, showUnknown, kept, groupSections }) {
    const origins = groupSections ? new WeakMap() : undefined;
    const group = activeGroup(root, origins);
    const error = function validationError(node) {
      if (node.children) {
        if (node.children.length && node.join === "count" && node.minimum > node.children.length) {
          return `一致数 ${node.minimum} を満たすには、このグループに条件があと ${node.minimum - node.children.length} 件必要です。`;
        }
        return node.children.map(validationError).find(Boolean);
      }
      if (!node.absent && node.min && node.max && Number(node.min) > Number(node.max)) {
        return "下限は上限以下にしてください。";
      }
    }(group);
    const active = !error && group.children.length > 0;
    const unchecked = view === "unchecked";
    const discard = view === "discard" || unchecked;
    const checked = view === "kept";
    const keptIds = kept instanceof Set ? kept : new Set(kept);
    const { sections, indexes, pages, pageBySection } = active && origins
      ? sectionLayout(group, origins) : { sections: [], pages: [] };
    return {
      active, error, discard, checked, sections, pages,
      matchedSections(matches) {
        if (!indexes) return [];
        // evaluateGroup only returns leaves from branches that satisfied their own operator.
        return [...new Set(matches.map(condition => indexes.get(condition)))].sort((a, b) => a - b);
      },
      matchedPages(hits) {
        if (pages.length === sections.length) return hits;
        return [...new Set(hits.map(index => pageBySection[index]))];
      },
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
    activeGroup, minimumMatches, supportsAbsence, viewRule, orderItems });
})();
