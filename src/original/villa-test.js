window.VillaTestUI = ({ U, portrait }) => {
  function testBattle(state) {
    const allies = state.chars.map(c => selectable(c, "test-ally", state.testAllies?.includes(c.id), null, c.locked, state)).join("");
    const diff = GameData.difficulties[state.testDifficulty] || GameData.difficulties.normal;
    const enemies = GameData.testEnemies.map((e, i) => selectable(GameData.scaleEnemyStats(e, diff, e.type), "test-enemy", state.testEnemies?.includes(i), i)).join("");
    const ready = (state.testAllies || []).length && (state.testEnemies || []).length;
    return `<h2>测试战斗配置</h2><p class="muted">可选择1-4名我方角色与1-4名敌人。测试难度只缩放敌方属性，不影响正式副本解锁。</p>${testDifficulty(state)}<div class="test-setup"><section><h3>我方角色</h3><div class="team-grid">${allies}</div></section><section><h3>敌方角色</h3><div class="team-grid">${enemies}</div></section></div>${testExtras(state)}<div class="actions test-start"><span class="tag">难度 ${diff.name}</span><span class="tag">怪物属性 ${diff.attrText}</span><span class="tag">我方 ${(state.testAllies || []).length}/4</span><span class="tag">敌方 ${(state.testEnemies || []).length}/4</span><button data-start-test-battle="1" ${ready && !state.testBattleStarting ? "" : "disabled"}>${state.testBattleStarting ? "进入中…" : ready ? "开始战斗" : "请选择双方"}</button></div>`;
  }
  function testDifficulty(state) {
    const current = state.testDifficulty || "normal";
    return `<div class="test-difficulty"><h3>测试难度</h3><div class="actions">${Object.entries(GameData.difficulties).map(([id, d]) => `<button class="ghost ${current === id ? "active" : ""}" data-test-difficulty="${id}">${d.name}</button>`).join("")}</div></div>`;
  }
  function testExtras(state) {
    const ownedCards = new Set([...(state.deck || []).map(c => c.name), ...(GameData.baseCardNames || [])]), pickedCards = new Set(state.testCards || []);
    const cardButtons = (GameData.cardCodex || []).filter(c => !ownedCards.has(c.name)).map(c => testPick(c.name, "test-card", pickedCards.has(c.name))).join("") || `<span class="muted">没有可添加卡牌。</span>`;
    const ownedRelics = new Set([...(state.relicCollection || []), ...(state.resources?.relics || []), ...Object.values(state.equipment || {}).flat()]), pickedRelics = new Set(state.testRelics || []);
    const relicButtons = RelicSystem.all(state).filter(r => !ownedRelics.has(r.name)).map(r => testPick(r.name, "test-relic", pickedRelics.has(r.name))).join("") || `<span class="muted">没有未获得饰品。</span>`;
    const skinRows = (state.testAllies || []).map(id => testSkinRow(state, id)).join("") || `<span class="muted">请先选择我方角色。</span>`;
    return `<div class="test-extra"><section><h3>临时卡牌配置</h3><p class="muted">当前公共牌库默认可用，勾选后仅在本次测试战斗中追加。</p><div class="actions"><button data-test-cards-all="add">添加全部卡牌</button><button class="ghost" data-test-cards-all="remove">移除全部卡牌</button></div><div class="test-pick-list">${cardButtons}</div></section><section><h3>临时饰品配置</h3><p class="muted">添加后可在测试角色卡的饰品列表中自由穿戴。</p><div class="actions"><button data-test-relics-all="add">添加全部饰品</button><button class="ghost" data-test-relics-all="remove">移除全部饰品</button></div><div class="test-pick-list">${relicButtons}</div></section><section class="test-skins"><h3>测试皮肤</h3><p class="muted">测试战斗可试用未拥有的普通皮肤；等级特殊立绘需达到等级解锁。</p>${skinRows}</section></div>`;
  }
  function testSkinRow(state, id) {
    const c = state.chars.find(x => x.id === id), current = state.testSkins?.[id] || state.equippedSkins?.[id];
    if (!c) return "";
    return `<div class="test-skin-row"><b>${U.esc(c.name)}</b><div class="test-pick-list">${SkinSystem.forChar(id).map(s => {
      return `<button class="test-pick ${current === s.id ? "selected" : ""}" data-test-skin-char="${U.esc(id)}" data-test-skin="${U.esc(s.id)}">${U.esc(s.name)}</button>`;
    }).join("")}</div></div>`;
  }
  function testPick(name, key, selected) { return `<button class="test-pick ${selected ? "selected" : ""}" data-${key}="${U.esc(name)}">${U.esc(name)}</button>`; }
  function selectable(u, key, selected, index, locked = false, state = null) {
    const id = index ?? u.id, stats = u.testStats || u.stats || u, info = key === "test-ally" ? testRelicSlots(state, id) : "", picker = key === "test-ally" ? window.RelicUI?.picker?.(state, id) || "" : "", shown = key === "test-ally" ? SkinSystem.applyToChar(state, u, true) : u;
    return `<div class="card team-card test-choice ${selected ? "selected" : ""} ${locked ? "test-locked" : ""}" data-${key}="${U.esc(id)}">${locked ? `<span class="corner-tag">未解锁</span>` : ""}${portrait(shown)}<b>${U.esc(u.name)}</b>${u.role ? `<p class="role-line">${U.esc(u.role)}</p>` : ""}<span class="tag">${selected ? "已选择" : "点击选择"}</span><p class="muted">HP ${U.esc(stats.maxHp || u.hp)} · 攻击 ${U.esc(stats.attack ?? u.attack)}</p>${info}${picker}</div>`;
  }
  function testRelicSlots(state, id) {
    if (!state) return "";
    const eq = state.testEquipment?.[id] || [];
    return `<div class="relic-lines relic-slot-links test-relic-links">${[0, 1].map(i => `<button class="ghost relic-slot-link" data-open-relic-equip="${U.esc(id)}" data-open-relic-slot="${i}">${eq[i] ? U.relicLabel(eq[i], `${i + 1}. `) : `${i + 1}. 空槽`}</button>`).join("")}</div>`;
  }
  return { testBattle };
};
