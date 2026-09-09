window.BattleVictory = (() => {
  const art = (u) => window.UICommon.artBox(u, "victory-art", u.art || u.avatar, u.face || u.name?.[0] || "?");
  const metric = (label, value) => `<span><i>${label}</i><b>${value}</b></span>`;
  function mvpRow(entry) {
    if (!entry) return "";
    const { unit, stats, score, title } = entry;
    return `<div class="mvp-row" data-mvp-row="1">${art(unit)}<div class="mvp-copy"><div><strong>MVP</strong><b>${unit.name}</b><em>${title}</em></div><p>${metric("伤害", stats.damage)}${metric("治疗", stats.healing)}${metric("击杀", stats.kills)}${metric("评分", score)}</p></div></div>`;
  }
  function memberRows(ranking) {
    return ranking.map(({ unit, stats, score, rank, title, isMvp }) => `<div class="member-row${isMvp ? " is-mvp" : ""}" data-mvp-rank="${rank}"><b class="rank-no">${rank}</b>${art(unit)}<p><strong>${unit.name}</strong><em>${title}</em></p><div class="member-metrics">${metric("伤害", stats.damage)}${metric("治疗", stats.healing)}${metric("击杀", stats.kills)}${metric("出牌", stats.cards)}${metric("响应", stats.responses)}${metric("评分", score)}</div></div>`).join("");
  }
  function experienceReward(state, battle) {
    if (battle?.test || !battle?.exploration || !state.explore
      || !["normal", "elite", "boss"].includes(battle.nodeType)) return 0;
    const difficulty = GameData.difficulties[state.explore.difficultyId];
    return window.CharacterProgression?.rewardFor?.(battle.nodeType, difficulty) || 0;
  }
  function render(state) {
    const b = state.battle;
    if (!b) return "";
    const ranking = window.BattleStats?.ranking?.(b) || [];
    const special = unit => window.MannyGunSkinFX?.active?.(unit) || window.NonokaIdolSkinFX?.active?.(unit) || window.BertisQueenSkinFX?.active?.(unit) || window.FloraSonicSkinFX?.active?.(unit) || window.WendyTeacherSkinFX?.active?.(unit) || window.ElranaFallenPhysicianSkinFX?.active?.(unit) || window.AngelicaBerserkerSkinFX?.active?.(unit);
    const featured = ranking.map(entry => entry.unit).find(special) || b.allies.find(special);
    const gunner = window.MannyGunSkinFX?.active?.(featured) ? featured : null;
    const idol = window.NonokaIdolSkinFX?.active?.(featured) ? featured : null;
    const queen = window.BertisQueenSkinFX?.active?.(featured) ? featured : null;
    const sonic = window.FloraSonicSkinFX?.active?.(featured) ? featured : null;
    const teacher = window.WendyTeacherSkinFX?.active?.(featured) ? featured : null;
    const physician = window.ElranaFallenPhysicianSkinFX?.active?.(featured) ? featured : null;
    const berserker = window.AngelicaBerserkerSkinFX?.active?.(featured) ? featured : null;
    const sonicVictory = sonic ? { ...sonic, ref: "", id: "" } : null;
    const idolShow = idol ? `<div class="idol-victory-show">${window.UICommon.artBox(idol, "idol-victory-art", idol.art || idol.avatar, idol.face || idol.name?.[0])}<div class="idol-victory-fireworks"><i></i><i></i><i></i></div><span class="idol-victory-kiss">♥</span></div>` : "";
    const gunShow = gunner ? `<div class="manny-gun-victory-show">${window.UICommon.artBox(gunner, "manny-gun-victory-art", gunner.art || gunner.avatar, gunner.face || gunner.name?.[0])}<div class="manny-victory-arsenal">${Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div><div class="manny-victory-shells"></div></div>` : "";
    const queenShow = queen ? `<div class="bertis-queen-victory-show">${window.UICommon.artBox(queen, "bertis-queen-victory-art", queen.art || queen.avatar, queen.face || queen.name?.[0])}<div class="bertis-victory-crown"><i></i></div><div class="bertis-victory-roses"><i></i><i></i><i></i><i></i><i></i></div><span class="bertis-victory-whip"></span></div>` : "";
    const sonicShow = sonic ? `<div class="flora-sonic-victory-show">${window.UICommon.artBox(sonicVictory, "flora-sonic-victory-art", sonic.skinVictoryArt || sonic.art || sonic.avatar, sonic.face || sonic.name?.[0])}<div class="flora-sonic-victory-echoes"><i></i><i></i><i></i><i></i></div><span class="flora-sonic-victory-arcs"></span></div>` : "";
    const teacherStats = teacher ? ranking.find(entry => entry.unit === teacher)?.stats : null;
    const teacherShow = teacher ? `<div class="wendy-teacher-victory-show">${window.UICommon.artBox(teacher, "wendy-teacher-victory-art", teacher.art || teacher.avatar, teacher.face || teacher.name?.[0])}<div class="wendy-teacher-board"><b>下课</b><i></i><i></i><i></i></div><div class="wendy-teacher-summary"><span>伤害 <b>${teacherStats?.damage || 0}</b></span><span>护甲 <b>${teacher.skinTeacherArmor || 0}</b></span><span>摸牌 <b>${teacher.skinTeacherDrawn || 0}</b></span></div></div>` : "";
    const physicianShow = physician ? `<div class="elrana-fallen-physician-victory-show">${window.UICommon.artBox(physician, "elrana-fallen-physician-victory-art", physician.art || physician.avatar, physician.face || physician.name?.[0])}<div class="elrana-fallen-physician-organs"><i></i><i></i><i></i></div><span class="elrana-fallen-physician-heart"></span><b class="elrana-fallen-physician-motto">再生的尽头，是永生。</b></div>` : "";
    const berserkerShow = berserker ? `<div class="angelica-berserker-victory-show">${window.UICommon.artBox(berserker, "angelica-berserker-victory-art", berserker.art || berserker.avatar, berserker.face || berserker.name?.[0])}<span class="angelica-victory-sword"></span><div class="angelica-victory-embers"><i></i><i></i><i></i><i></i><i></i></div><b class="angelica-victory-motto">帝血未冷，下一场继续。</b></div>` : "";
    const retrying = !!b.settlementError;
    const experience = experienceReward(state, b);
    const experienceItem = experience
      ? `<span data-victory-experience="1">队伍经验 +${experience}</span>` : "";
    const actions = retrying ? `<button data-victory-hall="1">重试结算</button>` : b.test ? `<button data-victory-test="1">返回配置</button>` : b.exploration ? `<button data-victory-continue="1">继续探索</button>` : `<button data-victory-hall="1">返回据点</button>`;
    const hint = retrying ? `<small class="victory-error">任务奖励数据异常，奖励未写入。请重试结算。</small>` : "<small>点击屏幕继续</small>";
    return `<div class="victory-screen ready ${idol ? "idol-victory" : ""} ${gunner ? "manny-gun-victory" : ""} ${queen ? "bertis-queen-victory" : ""} ${sonic ? "flora-sonic-victory" : ""} ${teacher ? "wendy-teacher-victory" : ""} ${physician ? "elrana-fallen-physician-victory" : ""}" data-victory-screen="1">${idolShow}${gunShow}${queenShow}${sonicShow}${teacherShow}${physicianShow}<div class="petals"><i></i><i></i><i></i><i></i><i></i><i></i></div><section class="victory-stats"><div class="victory-heading"><h3>战斗结算</h3><div class="victory-summary"><b>胜利</b><span>敌人 ${b.enemyCount || b.enemies.length} 名</span><span>回合 ${Math.max(1, b.turn + 1)}</span>${experienceItem}</div></div>${mvpRow(ranking[0])}<div class="member-list">${memberRows(ranking)}</div><div class="victory-actions">${hint}${actions}</div></section></div>`;
  }
  function open(state) { const b = state.battle; if (!b) return; b.victoryScreen = true; b.victoryAt = Date.now(); b.locked = true; }
  function close(state) { if (state.battle) state.battle.victoryScreen = false; }
  return { render, open, close };
})();
