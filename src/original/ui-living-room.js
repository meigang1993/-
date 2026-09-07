window.GameUILivingRoom = U => {
  function render(state) {
    const cards = state.chars.filter(character => !character.locked)
      .map(characterCard).join("");
    return `<div class="villa-page living-room"><header class="villa-page-head page-head-actions"><div><h2>别墅客厅</h2><p class="muted">出战角色会在战斗结算时获得经验。每次升级自动提升生命、攻击、魔力和速度，等级上限为${window.CharacterProgression.maxLevel}级。</p></div><button class="ghost page-back" data-view="hall">返回首页</button></header><div class="villa-page-scroll"><div class="card-grid">${cards || '<p class="muted">暂无已解锁角色。</p>'}</div></div></div>`;
  }

  function characterCard(character) {
    const required = window.CharacterProgression.need(character.level);
    const exp = required ? Math.min(required, character.exp || 0) : 0;
    const percent = required ? Math.round(exp / required * 100) : 100;
    const expText = required ? `${exp} / ${required}` : "已满级";
    const portrait = U.face(character);
    const stats = ["maxHp", "attack", "magic", "speed"].map(key => {
      const name = GameData.statDefs.find(item => item[0] === key)?.[1] || key;
      return `<span><small>${name}</small><b>${U.formatStat(character.stats?.[key])}</b></span>`;
    }).join("");
    return `<button class="card portrait-card living-room-card" data-active-info="${U.esc(character.id)}" aria-label="查看${U.esc(character.name)}成长详情">${portrait}<span class="living-room-identity"><b>${U.esc(character.name)}</b><small>${U.esc(character.role || "")}</small></span><span class="tag">Lv.${character.level}</span><span class="exp-label"><small>经验</small><b>${expText}</b></span><span class="exp-track" aria-hidden="true"><i style="width:${percent}%"></i></span><span class="living-room-stats">${stats}</span></button>`;
  }

  return { render };
};
