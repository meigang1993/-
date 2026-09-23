const { test, expect } = require("@playwright/test");
const { openOnlineGame } = require("./helpers/online-game");

test("runtime unhandled rejection recovers controls and exposes explicit retry", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(() => {
    const before = window.__loadingCalls.filter(call => call.type === "error").length;
    const control = document.querySelector("[data-start-game]");
    void window.AppActionGuard.run("runtime boundary fixture", () => new Promise(() => {}), {
      control,
      busyText: "处理中…",
      captureRun: false,
    });
    window.state.sortieStarting = true;
    window.state.battle = { locked: true, assetRetrying: true, animQueue: [] };
    const reason = new Error("runtime rejection");
    reason.code = "RUNTIME_TEST";
    const event = new PromiseRejectionEvent("unhandledrejection", {
      cancelable: true,
      promise: Promise.resolve(),
      reason,
    });
    const accepted = window.dispatchEvent(event);
    return {
      accepted,
      prevented: event.defaultPrevented,
      addedErrors: window.__loadingCalls.filter(call => call.type === "error").length - before,
      record: window.AppRuntimeErrors.current(),
      controlLocked: control.dataset.locked === "1",
      controlDisabled: control.disabled,
      sortieStarting: window.state.sortieStarting,
      battleLocked: window.state.battle.locked,
      assetRetrying: window.state.battle.assetRetrying,
    };
  });
  expect(result).toMatchObject({
    accepted: false,
    prevented: true,
    addedErrors: 0,
    record: {
      source: "unhandledrejection",
      code: "RUNTIME_TEST",
      message: "runtime rejection",
    },
    controlLocked: false,
    controlDisabled: false,
    sortieStarting: false,
    battleLocked: false,
    assetRetrying: false,
  });
  expect(result.record.stack).toContain("runtime rejection");
  await expect(page.getByRole("alertdialog")).toContainText("操作发生异常");
  await expect(page.getByRole("button", { name: "返回重试" })).toBeVisible();
  await page.getByRole("button", { name: "返回重试" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator("[data-start-game]")).toBeEnabled();

  const errorResult = await page.evaluate(() => {
    const error = new Error("runtime callback failure");
    error.code = "RUNTIME_CALLBACK_TEST";
    const event = new ErrorEvent("error", {
      cancelable: true,
      error,
      message: error.message,
    });
    return {
      accepted: window.dispatchEvent(event),
      prevented: event.defaultPrevented,
      record: window.AppRuntimeErrors.current(),
    };
  });
  expect(errorResult).toMatchObject({
    accepted: false,
    prevented: true,
    record: {
      source: "error",
      code: "RUNTIME_CALLBACK_TEST",
      message: "runtime callback failure",
    },
  });
  await expect(page.getByRole("button", { name: "返回重试" })).toBeVisible();
  await page.getByRole("button", { name: "返回重试" }).click();

  const retryRenderRecord = await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("retry render failure"), "retry-render");
    return window.AppRuntimeErrors.current();
  });
  expect(retryRenderRecord).toMatchObject({
    source: "retry-render",
    code: "RUNTIME_ERROR",
    message: "retry render failure",
  });
  await page.getByRole("button", { name: "返回重试" }).click();
});

test("runtime boundary survives failures inside its own recovery path", async ({ page }) => {
  await openOnlineGame(page);
  await page.locator("[data-start-settings]").click();
  const settingsSave = page.locator("[data-settings-overlay] [data-save-game]");
  await expect(settingsSave).toBeFocused();
  const result = await page.evaluate(() => {
    const control = document.querySelector("[data-settings-overlay] [data-save-game]");
    control.dataset.locked = "1";
    control.disabled = true;
    const reset = window.AppActionGuard.reset;
    const show = window.AppRuntimeErrorDialog.show;
    window.AppActionGuard.reset = () => { throw new Error("reset failed"); };
    window.AppRuntimeErrorDialog.show = () => { throw new Error("dialog failed"); };
    const reason = new Error("original runtime failure");
    reason.code = "ORIGINAL_RUNTIME_FAILURE";
    const event = new PromiseRejectionEvent("unhandledrejection", {
      cancelable: true,
      promise: Promise.resolve(),
      reason,
    });
    let dispatchError = null;
    try { window.dispatchEvent(event); }
    catch (error) { dispatchError = error.message; }
    window.AppActionGuard.reset = reset;
    window.AppRuntimeErrorDialog.show = show;
    return {
      accepted: !event.defaultPrevented,
      dispatchError,
      record: window.AppRuntimeErrors.current(),
      controlLocked: control.dataset.locked === "1",
      controlDisabled: control.disabled,
    };
  });
  expect(result).toMatchObject({
    accepted: false,
    dispatchError: null,
    record: {
      code: "ORIGINAL_RUNTIME_FAILURE",
      message: "original runtime failure",
    },
    controlLocked: false,
    controlDisabled: false,
  });
  await expect(page.getByRole("alertdialog", { name: "操作发生异常" })).toBeVisible();
  expect(await page.locator("[data-settings-overlay]").evaluate(
    element => element.hasAttribute("inert"))).toBe(true);
  await page.getByRole("button", { name: "返回重试" }).click();
  await expect(page.getByRole("alertdialog", { name: "操作发生异常" })).toHaveCount(0);
  await expect(page.locator("[data-settings-overlay]")).toBeVisible();
  await expect(settingsSave).toBeFocused();
});

test("battle action reset detaches the next queue from a stale task", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    await window.GameBundles.load("battle");
    let releaseOld;
    const oldTask = window.BattleActionGuard.runWhenIdle(
      "stale queued action",
      () => new Promise(resolve => { releaseOld = resolve; }),
    );
    while (!releaseOld) await Promise.resolve();
    window.BattleActionGuard.reset();
    const nextTask = window.BattleActionGuard.runWhenIdle(
      "current queued action",
      async () => "current",
    );
    const nextResult = await Promise.race([
      nextTask,
      new Promise(resolve => setTimeout(() => resolve("blocked"), 50)),
    ]);
    releaseOld("stale");
    return { nextResult, oldResult: await oldTask };
  });
  expect(result).toEqual({ nextResult: "current", oldResult: "stale" });
});

test("battle action tasks can reject writeback after a runtime reset", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    await window.GameBundles.load("battle");
    let releaseOld;
    let commits = 0;
    const oldTask = window.BattleActionGuard.run(
      "stale battle action",
      async context => {
        await new Promise(resolve => { releaseOld = resolve; });
        if (context?.isCurrent?.() === false) return false;
        commits += 1;
        return true;
      },
    );
    while (!releaseOld) await Promise.resolve();
    window.AppRuntimeErrors.capture(new Error("battle action boundary"), "error");
    releaseOld();
    return { result: await oldTask, commits };
  });
  expect(result).toEqual({ result: false, commits: 0 });
});
