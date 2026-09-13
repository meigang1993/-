window.GameUIBattleUnits = (U, I) => {
  const targeting = window.GameUIBattleTargeting;

  function unit(unitData, battle) {
    const active = battle.activeUid === unitData.uid ? "active-unit" : "";
    const broken = battle.lastArmorBreakUid === unitData.uid
      ? unitData.ai === "mechanical_bull_king" ? "defense-broken" : "armor-broken"
      : "";
    const thinking = battle.thinkingUid === unitData.uid ? "thinking" : "";
    const actor = BattleSystem.active(battle);
    const rawPickedCard = battle.selectedSkillCard || actor?.hand?.[battle.selectedCardIndex];
    const pickedCard = window.WithererSkills?.displayCard?.(actor, rawPickedCard) || rawPickedCard;
    const canTarget = targeting.targetAllowed(unitData, battle, actor, pickedCard);
    const shownHp = unitData.visualHp ?? unitData.hp;
    const isDead = shownHp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unitData);
    const dead = isDead ? "dead" : "";
    const deathAnim = isDead && !unitData.deathShown ? "death-anim" : "";
    if (isDead) unitData.deathShown = true;
    else delete unitData.deathShown;
    const ready = targeting.prepareTargetReady(unitData, battle);
    const target = (canTarget || ready) && unitData.hp > 0 ? "selectable-target" : "";
    const chosen = battle.pendingTargetUid === unitData.uid || battle.comboPartnerUid === unitData.uid
      || battle.opheliaGuardUid === unitData.uid
      || (battle.pendingTargetUids || []).includes(unitData.uid) ? "chosen-target" : "";
    const sideClass = unitData.side === "enemy" ? "enemy" : "ally";
    const fullName = unitData.label ? `${unitData.name} ${unitData.label}` : unitData.name;
    return `<div class="unit ${sideClass}-unit ${active} ${broken} ${thinking} ${target} ${chosen} ${dead} ${deathAnim}" data-target="${U.esc(unitData.uid)}" aria-label="${U.esc(`${fullName}；${U.statTitle(unitData).replace(/\n/g, "；")}`)}">${unitBody(unitData, battle)}</div>`;
  }

  function unitSpeech(unitData, battle) {
    if (battle.speech?.global) return "";
    const line = battle.speech?.lines?.find(entry => entry.uid === unitData.uid)
      || (battle.speech?.uid === unitData.uid ? battle.speech : null);
    const dismiss = battle.speech?.dismissible ? ` data-dismiss-speech="1" title="点击关闭"` : "";
    return line?.text ? `<div class="unit-speech-bubble"${dismiss}>${U.esc(line.text)}</div>` : "";
  }

  function conquerMark(unitData) {
    const active = unitData?.ref === "aileng"
      && (unitData.skills || []).some(skill => skill.name === "征服欲望");
    return active
      ? `<span class="conquer-count" title="征服欲望：本回合造成伤害次数 ${unitData.ailengDamageHits || 0}/8">${Math.min(99, unitData.ailengDamageHits || 0)}</span>`
      : "";
  }

  function unitBody(unitData, battle) {
    const status = statusIcons(unitData);
    const intentMax = Math.min(99, Math.max(1, (unitData.stats?.bloodlust || 1) + (unitData.intentMaxBonus || 0)));
    const intent = `<span class="intent-flame ${(unitData.intent || 0) <= 0 ? "empty" : ""}" title="杀意：${unitData.intent || 0}/${intentMax}">${unitData.intent || 0}/${intentMax}</span>`;
    const moonSuits = (unitData.newMoonSuits || []).map(U.esc).join(" ");
    const moon = unitData.newMoonSuits?.length
      ? `<div class="target-mark moon-suits" title="新月之歌记录花色：${moonSuits}">${moonSuits}</div>`
      : "";
    const mimic = unitData.mimicName
      ? `<div class="target-mark mimic-name" title="模仿之音记录：${U.esc(unitData.mimicName)}">仿：${U.esc(unitData.mimicName)}</div>`
      : "";
    const command = unitData.cadicisPlanName
      ? `<div class="target-mark command-name" title="战场指挥官记录：${U.esc(unitData.cadicisPlanName)}">指挥：${U.esc(unitData.cadicisPlanName)}</div>`
      : "";
    const relicTip = unitData.battleRelics?.map(name => RelicSystem.statText(name)).join("\n\n");
    const relics = unitData.battleRelics?.length
      ? `<span class="enemy-relic-badge" title="${U.esc(relicTip)}">饰×${unitData.battleRelics.length}</span>`
      : "";
    const marks = `${status}${moon}${mimic}${command}${targetButtons(battle, unitData)}`;
    const gender = unitData.gender === "female" ? "♀" : unitData.gender === "male" ? "♂" : "";
    const count = (unitData.actionCount || 0)
      + (battle.activeUid === unitData.uid && battle.phase > 0 && battle.phase < 6 ? 1 : 0);
    const action = `<span class="action-count" title="本场行动数">${count}</span>`;
    const speech = unitSpeech(unitData, battle);
    return `<div class="unit-frame"><div class="unit-main ${unitData.side === "ally" ? "ally-main" : "enemy-main"}">${speech}${U.artBox(unitData, "unit-art", unitData.avatar || unitData.art, unitData.face)}${I.greenHatMark(unitData)}${I.foodMark(unitData)}${I.rageMark(unitData)}${I.missionMark(unitData)}${I.idolSuitMark(unitData)}${I.domeSuitMark(unitData)}${I.artinaSuitMark(unitData)}${I.mariaNumberMark(unitData)}${I.mariaBlessingMark(unitData)}${I.jokerSuitMark(unitData)}${conquerMark(unitData)}${action}${unitData.label ? `<span class="duplicate-label">${U.esc(unitData.label)}</span>` : ""}${gender ? `<span class="gender-mark">${gender}</span>` : ""}${relics}${marks}${intent}<span class="hand-count unit-hand"><i></i>${U.handCount(unitData)}/${U.handLimit(unitData)}<i></i></span>${battle.thinkingUid === unitData.uid ? `<span class="thinking-label">思考中</span>` : ""}</div>${U.combatBar(unitData)}</div><div class="unit-name"><b>${U.esc(unitData.name)}</b></div>`;
  }

  function statusIcons(unitData) {
    const timerCount = status => /^计时(\d+)$/.exec(status)?.[1] || "";
    const statusTip = status => status === "毒" ? `毒：${unitData.poison || 0}层`
      : status === "感电" ? `感电：${unitData.shock || 0}层`
        : status === "歼灭" ? "歼灭模式"
          : status === "锁魂" ? "锁魂：杀牌伤害会传导给另一名锁魂目标"
            : timerCount(status) ? `自爆倒计时：${timerCount(status)}` : status;
    const statusText = status => status === "毒" ? `毒${unitData.poison || 0}`
      : status === "感电" ? `电${unitData.shock || 0}`
        : status === "锁魂" ? "锁"
          : timerCount(status) ? `计${timerCount(status)}` : status[0];
    const statusClass = status => `${status === "感电" ? "shock" : ""} ${timerCount(status) ? "timer" : ""}`;
    const burning = (unitData.hand || []).some(card => card.burning && !card._pendingDraw)
      ? `<span class="status-icon burning-hand" title="燃烧：每个准备阶段按燃烧牌数量失去生命，受到火属性伤害翻倍">火</span>`
      : "";
    const lock = unitData.lockSuit
      ? `<span class="status-icon lock-suit" title="锁定标记：${U.esc(unitData.lockSuit)}">${U.esc(unitData.lockSuit)}</span>`
      : "";
    const statuses = (unitData.statuses || []).filter(status => status !== "妒火")
      .map(status => `<span class="status-icon ${statusClass(status)}" title="${U.esc(statusTip(status))}">${U.esc(statusText(status))}</span>`)
      .join("");
    return `<div class="status-icons">${burning}${lock}${statuses}</div>`;
  }

  function targetButtons(battle, unitData) {
    if (battle.comboPartnerUid === unitData.uid) return `<div class="target-mark">配合</div>`;
    if ((battle.pendingTargetUids || []).includes(unitData.uid)) return `<div class="target-mark">锁魂</div>`;
    return battle.pendingTargetUid === unitData.uid ? `<div class="target-mark">目标</div>` : "";
  }

  function activeInfo(state) {
    const battle = state.battle;
    const shown = BattleSystem.active(battle);
    if (!shown) return `<aside class="active-info"><span class="muted">暂无行动角色</span></aside>`;
    const reference = state.chars.find(character => character.id === shown.ref);
    if (reference && window.RelicSystem) reference.relicStats = RelicSystem.statsOf(state, reference.id);
    const skillSource = shown.side === "ally" && reference
      ? { ...reference, ...shown, skills: shown.skills || reference.skills }
      : shown;
    const skills = U.skillsOf(skillSource)
      .filter(skill => skill.source !== "relic" && skill.source !== "derived")
      .map((skill, index) => {
        const skillState = U.skillState(shown, skill, battle);
        return U.skillName(
          skill, index, skillState.usable, battle.selectedSkillCard?.name === skill.card?.name,
          true, shown.side === "ally" && skill.type === "active" && !skillState.usable,
          skillState, shown
        );
      });
    const mimic = shown.mimicName
      ? `<div class="target-mark mimic-name" title="模仿之音记录：${U.esc(shown.mimicName)}">仿：${U.esc(shown.mimicName)}</div>`
      : "";
    const command = shown.cadicisPlanName
      ? `<div class="target-mark command-name" title="战场指挥官记录：${U.esc(shown.cadicisPlanName)}">指挥：${U.esc(shown.cadicisPlanName)}</div>`
      : "";
    return `<aside class="active-info">${skills.length ? `<div class="skill-list active-skills">${skills.join("")}</div>` : ""}<div class="active-portrait-shell" data-active-info="${U.esc(shown.uid)}" role="button" tabindex="0" aria-label="查看${U.esc(shown.name)}角色详情">${U.artBox(shown, "portrait large", shown.art, shown.face || shown.name[0])}${I.greenHatMark(shown)}${I.foodMark(shown)}${I.rageMark(shown)}${I.missionMark(shown)}${I.idolSuitMark(shown)}${I.domeSuitMark(shown)}${I.artinaSuitMark(shown)}${I.mariaNumberMark(shown)}${I.mariaBlessingMark(shown)}${I.jokerSuitMark(shown)}${conquerMark(shown)}${mimic}${command}<span class="hand-count unit-hand"><i></i>${U.handCount(shown)}/${U.handLimit(shown)}<i></i></span></div>${U.combatBar(shown)}</aside>`;
  }

  return { unit, activeInfo };
};
