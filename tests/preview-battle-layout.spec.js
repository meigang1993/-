const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");

test("battle clash stays above captions without locked-screen dimming", async ({ page }) => {
  await startRegressionBattle(page);
  const styles = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.enemies[0];
    battle.skillCaption = {
      id: "whip-caption",
      side: actor.side,
      text: `${actor.name} 发动了 爱之鞭挞`,
    };
    battle.lastClash = {
      id: "whip-clash", result: "成功", a: "♥", t: "♠",
    };
    battle.locked = true;
    window.render();
    const clash = getComputedStyle(document.querySelector(".clash-popup"));
    const caption = getComputedStyle(
      document.querySelector(".skill-caption"));
    return {
      clashZ: Number(clash.zIndex),
      captionZ: Number(caption.zIndex),
      filter: clash.filter,
    };
  });
  expect(styles.clashZ).toBeGreaterThan(styles.captionZ);
  expect(styles.filter).toBe("none");
});

test("battle detail shows one primary role beside the name and in skill hover text", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 420 });
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const actor = window.BattleSystem.active(window.state.battle);
    actor.ref = "manny";
    actor.name = "曼妮";
    actor.combatRoles = ["输出", "控制"];
    window.render();
  });
  const unit = page.locator(".ally-row .unit").first();
  const art = unit.locator(".unit-art");
  const expected = await unit.evaluate(node => {
    const target = window.state.battle.allies.find(
      item => item.uid === node.dataset.target);
    return window.UICommon.skillSummary(target);
  });
  await expect(art).toHaveAttribute("title", expected);
  await expect(art).not.toHaveAttribute("title", /实战定位：/);
  await expect(unit.locator(".unit-name .combat-role")).toHaveCount(0);
  const activeSkill = page.locator(".active-skills .skill").first();
  await expect(activeSkill).toBeVisible();
  await expect(activeSkill).toHaveAttribute("title", /实战定位：/);
  await page.locator("[data-active-info]").first().click();
  const detailTitle = page.locator(".info-overlay .info-title-row");
  await expect(detailTitle.locator("h2")).toBeVisible();
  await expect(detailTitle.locator(".combat-role")).toHaveCount(1);
  const expectedRole = await page.evaluate(() => {
    const battle = window.state.battle;
    const unitData = [...battle.allies, ...battle.enemies]
      .find(item => item.uid === window.state.infoUnit);
    return window.UICommon.combatRolesOf(unitData)[0];
  });
  await expect(detailTitle.locator(".combat-role")).toHaveText(expectedRole);
  expect(await detailTitle.evaluate(row => {
    const bounds = row.getBoundingClientRect();
    const section = row.closest("section").getBoundingClientRect();
    return bounds.left >= section.left && bounds.right <= section.right;
  })).toBe(true);
  await page.locator("[data-info-tab='skills']").click();
  await expect(page.locator(".info-overlay .role-position")).toHaveCount(1);
  await expect(page.locator(".skill-detail .skill").first())
    .toHaveAttribute("title", new RegExp(`实战定位：${expectedRole}`));
  await expect(page.locator(".battle-screen .unit-skill-tooltip"))
    .toHaveCount(0);
  expect(relevantErrors(errors)).toEqual([]);
});

test("all playable characters keep readable skill buttons in the active battle panel", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 800, height: 420 });
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const snapshots = [];
    window.GameData.characters.forEach(template => {
      actor.ref = template.id;
      actor.name = template.name;
      actor.combatRoles = template.combatRoles;
      actor.skills = template.skills;
      actor.side = "ally";
      actor.hp = actor.maxHp = 100;
      actor.intent = 10;
      battle.activeUid = actor.uid;
      battle.phase = 4;
      battle.locked = false;
      battle.selectedSkillCard = null;
      window.render();
      const expected = window.UICommon.skillsOf(actor)
        .filter(skill =>
          skill.source !== "relic" && skill.source !== "derived");
      const buttons = [
        ...document.querySelectorAll(".active-skills .skill"),
      ];
      const activeBox = document.querySelector(".active-info")
        .getBoundingClientRect();
      const skillViewport = document.querySelector(".active-skills");
      const skillBox = skillViewport.getBoundingClientRect();
      const overflow = skillBox.left < activeBox.left - 1
        || skillBox.right > activeBox.right + 1
        || skillBox.top < activeBox.top - 1
        || skillBox.bottom > activeBox.bottom + 1;
      skillViewport.scrollTop = skillViewport.scrollHeight;
      const last = buttons[buttons.length - 1]?.getBoundingClientRect();
      const lastReachable = !last || (
        last.top >= skillBox.top - 1 && last.bottom <= skillBox.bottom + 1
      );
      snapshots.push({
        id: template.id,
        expected: expected.length,
        rendered: buttons.length,
        missingIcon:
          buttons.some(button => !button.querySelector("span")?.textContent.trim()),
        missingName:
          buttons.some(button => !button.querySelector("em")?.textContent.trim()),
        missingTip:
          buttons.some(button => !button.title.includes(template.combatRoles[0])),
        overflow,
        scrollable: skillViewport.scrollHeight > skillViewport.clientHeight,
        lastReachable,
        skillViewport: {
          left: skillBox.left,
          right: skillBox.right,
          top: skillBox.top,
          bottom: skillBox.bottom,
        },
        activePanel: {
          left: activeBox.left,
          right: activeBox.right,
          top: activeBox.top,
          bottom: activeBox.bottom,
        },
      });
    });
    return snapshots;
  });
  result.forEach(snapshot => {
    expect(snapshot.rendered, `${snapshot.id} skill count`)
      .toBe(snapshot.expected);
    expect(snapshot.missingIcon, `${snapshot.id} icon`).toBe(false);
    expect(snapshot.missingName, `${snapshot.id} name`).toBe(false);
    expect(snapshot.missingTip, `${snapshot.id} tooltip`).toBe(false);
    expect(snapshot.overflow,
      `${snapshot.id} skill viewport overflow ${JSON.stringify(snapshot)}`)
      .toBe(false);
    if (snapshot.expected > 2) {
      expect(snapshot.scrollable, `${snapshot.id} skill list scroll`)
        .toBe(true);
    }
    expect(snapshot.lastReachable, `${snapshot.id} last skill reachable`)
      .toBe(true);
  });
});
