const { test, expect } = require("@playwright/test");
const {
  collectErrors,
  relevantErrors,
  startDungeon,
} = require("./helpers/dungeon-flow");

test("dungeon map remains usable in compact landscape", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
  const errors = collectErrors(page);
  await startDungeon(page);
  await page.waitForTimeout(500);
  const layout = await page.evaluate(() => {
    const map = document.querySelector(".tower-map").getBoundingClientRect();
    const openNodes = [...document.querySelectorAll(".map-node.open")];
    const overlaps = [...document.querySelectorAll(".map-layer")].some(layer => {
      const nodes = [...layer.querySelectorAll(".map-node")];
      return nodes.some((node, index) => nodes.slice(index + 1).some(other => {
        const a = node.getBoundingClientRect(), b = other.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }));
    });
    const visibleOpen = openNodes.filter(node => {
      const box = node.getBoundingClientRect();
      return box.top >= map.top && box.bottom <= map.bottom;
    });
    return {
      pageOverflowX: document.scrollingElement.scrollWidth > innerWidth,
      pageOverflowY: document.scrollingElement.scrollHeight > innerHeight,
      mapHeight: map.height,
      openCount: openNodes.length,
      visibleOpen: visibleOpen.length,
      visibleLabels: visibleOpen.filter(node => {
        const label = node.querySelector(".node-label").getBoundingClientRect();
        return label.top >= map.top && label.bottom <= map.bottom;
      }).length,
      overlaps,
    };
  });
  expect(layout.pageOverflowX).toBe(false);
  expect(layout.pageOverflowY).toBe(false);
  expect(layout.mapHeight).toBeGreaterThanOrEqual(60);
  expect(layout.visibleOpen).toBe(layout.openCount);
  expect(layout.visibleLabels).toBe(layout.openCount);
  expect(layout.overlaps).toBe(false);
  const scrollState = await page.evaluate(() => {
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    const map = document.querySelector(".tower-map");
    map.scrollTop = map.scrollHeight;
    return {
      pageScrolled: document.scrollingElement.scrollTop > 0,
      mapScrollable: map.scrollHeight > map.clientHeight,
      mapScrolled: map.scrollTop > 0,
    };
  });
  expect(scrollState.pageScrolled).toBe(false);
  expect(scrollState.mapScrollable).toBe(true);
  expect(scrollState.mapScrolled).toBe(true);
  expect(relevantErrors(errors)).toEqual([]);
});
