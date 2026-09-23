async function animationNames(page, selectors, runningOnly = false) {
  return page.evaluate(({ targetSelectors, onlyRunning }) => (
    targetSelectors.flatMap(selector => (
      [...document.querySelectorAll(selector)].flatMap(element => (
        element.getAnimations()
          .filter(animation => !onlyRunning || animation.playState === "running")
          .map(animation => animation.animationName)
      ))
    ))
  ), { targetSelectors: selectors, onlyRunning: runningOnly });
}

async function waitForDoubleFrame(page) {
  await page.evaluate(() => new Promise(resolve => (
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  )));
}

async function unlockCharacters(page, ids) {
  await page.evaluate(characterIds => {
    characterIds.forEach(id => {
      const character = window.state.chars.find(item => item.id === id);
      if (character) character.locked = false;
    });
    window.render();
  }, ids);
}

async function sampleSelectionLayout(page, selector) {
  await page.evaluate(targetSelector => {
    document.querySelector(targetSelector).scrollIntoView({ block: "center" });
  }, selector);
  await waitForDoubleFrame(page);
  return page.evaluate(async targetSelector => {
    const samples = [];
    const read = () => {
      const panel = document.querySelector(".modal-card");
      const card = document.querySelector(targetSelector);
      samples.push({ scrollTop: panel.scrollTop, height: card.getBoundingClientRect().height });
    };
    read();
    document.querySelector(targetSelector).click();
    for (let index = 0; index < 8; index += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      read();
    }
    return {
      contentVisibility: getComputedStyle(document.querySelector(targetSelector)).contentVisibility,
      samples,
    };
  }, selector);
}

module.exports = {
  animationNames,
  sampleSelectionLayout,
  unlockCharacters,
  waitForDoubleFrame,
};
