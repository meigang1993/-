window.SuccubusCodex = (() => {
  const U = window.UICommon;
  const order = ["lokar", "besta_doll", "angelica", "luka", "nonoka", "loki", "elrana", "little_elrana", "ace", "manny", "miller", "wendy", "cadicis", "flora", "carlos", "bertis", "gerlot", "nanali", "aileng", "ophelia", "besta"];
  const mothers = { lokar: "贝丝妲", angelica: "贝丝妲", nonoka: "贝丝妲", elrana: "贝丝妲", manny: "贝丝妲", wendy: "贝丝妲", flora: "贝丝妲", bertis: "贝丝妲", loki: "诺诺卡", carlos: "芙萝娅", miller: "曼妮", gerlot: "贝尔蒂丝", luka: "安洁莉卡", cadicis: "温蒂", ace: "艾尔拉娜", little_elrana: "艾尔拉娜", nanali: "贝丝妲", aileng: "摩尔妮塔", ophelia: "人鱼女王", besta: "摩尔妮塔" };
  const sons = { angelica: "鲁卡", nonoka: "洛基", elrana: "艾斯", manny: "米勒", wendy: "卡迪西斯", flora: "卡洛斯", bertis: "杰洛特" };
  const nav = ["angelica", "nonoka", "elrana", "manny", "wendy", "flora", "bertis"];
  const grandsonIds = ["loki", "carlos", "miller", "gerlot", "luka", "cadicis", "ace"];
  const roles = { besta_doll: "机械魔偶", cadicis: "智慧之子" };
  let flashTimer = null;
  function render(state) {
    const chars = ordered(state), unlocked = chars.filter(c => !c.locked).length, sisters = count(state, nav), grandsons = count(state, grandsonIds);
    const back = state.view === "hall" ? "返回首页" : "返回孕育殿堂";
    return `<div class="codex-page"><header class="codex-title"><button class="ghost" data-close-succubus-codex="1">${back}</button><div><h2>魅魔图鉴</h2><p>已唤醒：${unlocked} / ${chars.length}</p></div><div class="codex-progress"><span>七位女儿 ${sisters.done}/${sisters.total}</span><span>七位孙子 ${grandsons.done}/${grandsons.total}</span></div>${unlocked === chars.length ? `<small>莉莉丝的血脉已全部苏醒，深渊的命运将由你们改写。</small>` : ""}</header><main class="codex-body"><section class="codex-scroll" data-codex-scroll="1">${chars.map(c => card(state, c)).join("")}</section><aside class="codex-jump">${nav.map(id => jumpButton(state, id)).join("")}</aside></main></div>`;
  }
  function ordered(state) { const known = new Set(order), fixed = order.map(id => state.chars.find(c => c.id === id)).filter(Boolean); return fixed.concat(state.chars.filter(c => !known.has(c.id))); }
  function count(state, ids) { const list = ids.map(id => state.chars.find(c => c.id === id)).filter(Boolean); return { done: list.filter(c => !c.locked).length, total: list.length }; }
  function unlockText(c) { return `${c.locked ? "未解锁" : "已解锁"} · ${U.esc(GameData.unlockHints?.[c.id] || (c.unlockCost ? `消耗精华宝珠 ×${c.unlockCost}` : "特殊剧情解锁"))}`; }
  function jumpButton(state, id) { const c = state.chars.find(x => x.id === id); return c ? `<button class="ghost" data-codex-jump="${id}">${U.esc(c.name)}</button>` : ""; }
  function card(state, c) {
    const data = GameData.characters?.find(x => x.id === c.id) || c, entry = { ...data, locked: c.locked };
    const unlocked = !entry.locked, motherName = entry.mother || mothers[entry.id], mother = motherName ? `<p class="codex-mother">母亲：${U.esc(motherName)}</p>` : "", father = entry.father ? `<p class="codex-mother">父亲：${U.esc(entry.father)}</p>` : "", grandfather = entry.grandfather ? `<p class="codex-mother">爷爷：${U.esc(entry.grandfather)}</p>` : "", son = sons[entry.id] ? `<p class="codex-mother">儿子：${sons[entry.id]}</p>` : "", flash = state.codexFlashId === entry.id ? " flash" : "";
    const skills = skillText(entry);
    return `<article id="codex-${entry.id}" class="codex-char ${unlocked ? "unlocked" : "locked"}${flash}"><div class="codex-portrait" tabindex="0">${entry.art ? art(entry) : silhouette(entry)}</div><div class="codex-skill-pop">${U.esc(skills)}</div><b>${U.esc(entry.name)}</b><p>${U.esc(roleOf(entry))}</p><p class="unlock-line ${unlocked ? "owned" : "locked"}">${unlockText(entry)}</p>${mother}${father}${grandfather}${son}</article>`;
  }
  function roleOf(c) { return roles[c.id] || c.role || "身份未知"; }
  function skillText(c) { const skills = U.skillsOf(c).filter(s => s.source !== "relic" && s.showInSkillInfo !== false).map(s => `${s.icon || s.card?.icon || "⭐"} ${s.name}\n${cleanSkillText(U.skillText(s))}`).join("\n\n") || "暂无技能"; return [U.rolePositionText(c), skills].filter(Boolean).join("\n\n"); }
  function cleanSkillText(text) { return String(text || "").replace(/[。；;]?\s*台词[:：][\s\S]*$/, "").trim(); }
  function art(c) { return c.art ? `<img src="${U.esc(c.art)}" alt="${U.esc(c.name)}" loading="lazy" decoding="async">` : `<span>${U.esc(c.face || c.name[0])}</span>`; }
  function silhouette(c) { return `<span class="codex-silhouette">${U.esc(c.face || c.name[0])}</span>`; }
  function bind(ctx) {
    const root = ctx.$("view"); if (!root || root.dataset.succubusCodex === "1") return;
    root.dataset.succubusCodex = "1"; root.addEventListener("click", e => click(e, ctx));
  }
  function click(e, ctx) {
    const state = ctx.state();
    const open = e.target.closest("[data-open-succubus-codex]"); if (open) return stop(e, () => ctx.update(() => { state.succubusCodex = true; clearFlashSoon(state, ctx); }));
    const close = e.target.closest("[data-close-succubus-codex]"); if (close) return stop(e, () => ctx.update(() => closeAll(state)));
    const jump = e.target.closest("[data-codex-jump]"); if (jump) return stop(e, () => scrollToChar(jump.dataset.codexJump));
  }
  function closeTop(state) {
    if (state.infoUnit) return state.infoUnit = null, state.infoTab = "stats", true;
    if (state.succubusCodex) return closeAll(state), true;
    return false;
  }
  function closeAll(state) { state.succubusCodex = false; state.infoUnit = null; state.infoTab = "stats"; state.codexFlashId = null; }
  function clearFlashSoon(state, ctx) { if (flashTimer) clearTimeout(flashTimer); flashTimer = setTimeout(() => ctx.update(() => { state.codexFlashId = null; flashTimer = null; }), 2600); }
  function stop(e, fn) { e.preventDefault(); e.stopPropagation(); fn(); }
  function scrollToChar(id) { document.getElementById(`codex-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  return { render, bind, closeTop };
})();
