const path = require("path");
const { expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../../publish/index.html")}`;

async function openOnlineGame(page, options = {}) {
  await page.addInitScript(({
    seedKv, kvGetFailure, renderFailure, frameFailure, unhandledBootFailure,
  }) => {
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    let seed = 2971485;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if (renderFailure) {
      const toggle = DOMTokenList.prototype.toggle;
      let injected = false;
      window.__startupRenderCount = 0;
      DOMTokenList.prototype.toggle = function patchedToggle(token, force) {
        if (token === "dungeon-mode") {
          window.__startupRenderCount += 1;
          if (!injected) {
            injected = true;
            window.__delayRenderFrame = true;
            window.dispatchEvent(new Event("resize"));
            window.__delayRenderFrame = false;
            throw new Error("injected first render failure");
          }
        }
        return toggle.call(this, token, force);
      };
    }
    if (renderFailure || frameFailure || unhandledBootFailure) {
      const requestFrame = window.requestAnimationFrame.bind(window);
      let injected = false;
      window.requestAnimationFrame = callback => {
        if (window.__delayRenderFrame) {
          window.__releaseDelayedRender = () => requestFrame(callback);
          return 0;
        }
        if (!injected && callback?.name === "completeBootFrame"
          && (frameFailure || unhandledBootFailure)) {
          injected = true;
          if (frameFailure) throw new Error("injected first frame scheduling failure");
          Promise.reject(new Error("injected unhandled boot rejection"));
          return requestFrame(() => setTimeout(callback, 0));
        }
        return requestFrame(callback);
      };
    }
    window.__onlineKv = new Map(Object.entries(seedKv || {}));
    window.__onlineKvCalls = [];
    window.__onlinePuts = [];
    window.__onlineFnInvokes = [];
    window.__loadingCalls = [];
    window.dzmm = {
      kv: {
        async get(key) {
          window.__onlineKvCalls.push({ method: "get", key });
          if (kvGetFailure) {
            const error = new Error("direct kv read failed");
            error.code = "NETWORK_ERROR";
            throw error;
          }
          return { value: clone(window.__onlineKv.get(key) ?? null) };
        },
        async put(key, value, options) {
          window.__onlineKvCalls.push({ method: "put", key });
          window.__onlineKv.set(key, clone(value));
          window.__onlinePuts.push({ key, options: clone(options) });
        },
        async delete(key) {
          window.__onlineKvCalls.push({ method: "delete", key });
          window.__onlineKv.delete(key);
        },
      },
      fn: {
        async invoke(name) {
          window.__onlineFnInvokes.push(name);
          throw new Error(`unexpected function call: ${name}`);
        },
      },
      save: {
        onAction(handler) {
          window.__onlineSaveAction = handler;
        },
      },
      loading: {
        progress(payload) {
          window.__loadingCalls.push({ type: "progress", payload: clone(payload) });
        },
        ready() {
          window.__loadingCalls.push({ type: "ready" });
        },
        error(code, message) {
          window.__loadingCalls.push({ type: "error", code, message });
        },
      },
      toast: { success() {}, error() {}, warning() {}, info() {} },
    };
  }, {
    seedKv: options.seedKv || {},
    kvGetFailure: options.kvGetFailure === true,
    renderFailure: options.renderFailure === true,
    frameFailure: options.frameFailure === true,
    unhandledBootFailure: options.unhandledBootFailure === true,
  });
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  if (options.waitForReady === false) return;
  await expect.poll(() => page.evaluate(() => ({
    online: navigator.onLine,
    dzmm: typeof window.dzmm,
    ready: window.__loadingCalls.some(call => call.type === "ready"),
  }))).toEqual({ online: true, dzmm: "object", ready: true });
}

module.exports = { gameUrl, openOnlineGame };
