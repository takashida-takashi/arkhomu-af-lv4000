(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const key = Symbol.for("hako-af.market-prices");
  if (globalThis[key]) {
    globalThis.hakoAfMarketSnapshots = globalThis[key];
    return;
  }
  const prices = new Map();
  const wrapped = new WeakSet();
  const expeditionSources = new Map([
    ["/api/expedition/repeat-status", ["repeat", data => data && {
      open: data.open, gateLevel: data.gateLevel, passActive: data.passActive
    }]],
    ["/api/nation-facilities/effects", ["nation", data => data?.expeditionTimeFactor]],
    ["/api/config/game", ["config", data => data?.expedition && { expedition: data.expedition, stats: data.stats }]],
    ["/api/items/category-groups", ["categories", data => data?.find?.(group => group.id === "food")?.categories]]
  ]);
  const expeditionData = new Map();
  const earlyMatings = [];
  let watchMatings = false;
  globalThis.hakoAfMarketSnapshots = globalThis[key] = prices;

  function publishMating(result) {
    document.dispatchEvent(new CustomEvent("hako-af:mating-completed", { detail: JSON.stringify(result) }));
  }

  document.addEventListener("hako-af:watch-mating-results", () => {
    watchMatings = true;
    for (const result of earlyMatings.splice(0)) publishMating(result);
  }, { once: true });

  function publishExpedition(type, value) {
    document.dispatchEvent(new CustomEvent("hako-af:expedition-native-data", { detail: { type, value } }));
  }

  document.addEventListener("hako-af:read-expedition-native-data", () => {
    for (const [type, value] of expeditionData) publishExpedition(type, value);
  });

  function observeMating(args, response) {
    const [url, options] = args;
    if (options?.method !== "POST") return;
    const special = url === "/api/mating/r6-execute";
    const parentIds = special ? options.body?.materialIds : [options.body?.parentAId, options.body?.parentBId];
    if (!Array.isArray(parentIds) || !parentIds.length || !parentIds.every(validId)) return;
    const parents = parentIds.map(String);
    Promise.resolve(response).then(payload => {
      if (special ? payload?.success === false : payload?.success !== true) return;
      const id = payload?.monster?.id;
      if (!validId(id) || parents.includes(String(id))) return;
      const result = { parents, child: String(id) };
      if (watchMatings) publishMating(result);
      else earlyMatings.push(result);
    }).catch(() => {});
  }

  function validId(id) {
    return typeof id === "string" && id.length > 0 || Number.isSafeInteger(id);
  }

  function irreversibleMonsterRequest(url, body) {
    switch (url) {
      case "/api/mating/execute": return ["合成", [body?.parentAId, body?.parentBId]];
      case "/api/mating/r6-execute": return ["特殊合成", body?.materialIds];
      case "/api/mating/sacrifice": return ["素材として消費", body?.sacrificeIds];
      case "/api/soul/soulify": return ["魂化", [body?.userMonsterId]];
      case "/api/soul/soulify-batch": return ["魂化", body?.userMonsterIds];
      case "/api/monsters/release": return ["解放", [body?.userMonsterId]];
      case "/api/monsters/release-batch": return ["解放", body?.userMonsterIds];
      default: return null;
    }
  }

  function observe(native) {
    if (typeof native !== "function" || wrapped.has(native)) return native;
    const proxy = new Proxy(native, {
      apply(target, thisArg, args) {
        const operation = args[1]?.method === "POST" && irreversibleMonsterRequest(args[0], args[1].body);
        if (operation && Array.isArray(operation[1]) && operation[1].length && operation[1].every(validId) &&
            !document.dispatchEvent(new CustomEvent("hako-af:guard-monster-operation", {
              cancelable: true, detail: JSON.stringify([operation[0], operation[1].map(String)])
            }))) {
          const statusMessage = "拡張育成ルートの警告で操作をキャンセルしました。";
          return Promise.reject(Object.assign(new Error(statusMessage), { statusCode: 400, data: { statusMessage } }));
        }
        const response = Reflect.apply(target, thisArg, args);
        const expeditionSource = expeditionSources.get(args[0]);
        if (expeditionSource) {
          const [type, select] = expeditionSource;
          Promise.resolve(response).then(payload => {
            const value = select(payload);
            if (value == null) return;
            expeditionData.set(type, value);
            publishExpedition(type, value);
          }).catch(() => {});
        }
        if (args[0] === "/api/market/stats") {
          // Observe the data already returned to the marketplace. Return its original promise to the caller.
          Promise.resolve(response).then(payload => {
            if (!Array.isArray(payload?.stats)) return;
            const at = Date.now();
            const requested = args[1]?.query?.item_ids;
            if (typeof requested === "string") {
              for (const id of requested.split(",")) prices.delete(id);
            } else prices.clear();
            for (const entry of payload.stats) {
              const price = Number(entry?.cheapest_price);
              if (typeof entry?.item_id === "string" && Number.isSafeInteger(price) && price > 0) prices.set(entry.item_id, { price, at });
            }
            document.dispatchEvent(new Event("hako-af:market-snapshot"));
          }).catch(() => {});
        }
        if (args[0] === "/api/mating/execute" || args[0] === "/api/mating/r6-execute") observeMating(args, response);
        return response;
      }
    });
    wrapped.add(proxy);
    return proxy;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "$fetch");
  if (descriptor && (!descriptor.configurable || !Object.hasOwn(descriptor, "value"))) return;
  let nativeFetch = observe(descriptor?.value);
  Object.defineProperty(globalThis, "$fetch", {
    configurable: true, enumerable: descriptor?.enumerable ?? true,
    get: () => nativeFetch,
    set: next => { nativeFetch = observe(next); }
  });
})();
