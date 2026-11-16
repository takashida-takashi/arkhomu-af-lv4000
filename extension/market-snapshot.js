(() => {
  "use strict";

  const key = Symbol.for("hako-af.market-prices");
  if (globalThis[key]) {
    globalThis.hakoAfMarketSnapshots = globalThis[key];
    return;
  }
  const prices = new Map();
  const wrapped = new WeakSet();
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

  function observe(native) {
    if (typeof native !== "function" || wrapped.has(native)) return native;
    const proxy = new Proxy(native, {
      apply(target, thisArg, args) {
        const response = Reflect.apply(target, thisArg, args);
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
