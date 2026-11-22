(() => {
  "use strict";
  if (globalThis.hakoAfFrameContext?.active === false) return;
  let started;
  const outside = (dialog, event) => {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  document.addEventListener("pointerdown", event => {
    const dialog = event.target?.closest?.("dialog[data-ha4][open]");
    started = event.button === 0 && event.isPrimary !== false && dialog && outside(dialog, event) ? dialog : null;
  }, true);
  document.addEventListener("pointercancel", () => { started = null; }, true);
  document.addEventListener("click", event => {
    const dialog = started;started = null;
    if (!dialog?.open || event.button !== 0 || !outside(dialog, event)) return;
    const close = [...dialog.querySelectorAll("button")].find(button => button.closest("dialog") === dialog &&
      !button.disabled && button.getClientRects().length && /^(?:閉じる|×|✕|✖|close)$/i.test((button.getAttribute("aria-label") || button.textContent).trim()));
    if (!close) return;
    event.preventDefault();event.stopImmediatePropagation();
    // Use the existing close action so pending work, nested filters and listeners clean up identically.
    close.click();
  }, true);
})();
