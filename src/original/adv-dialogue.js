window.AdvDialogue = (() => {
  const U = () => window.UICommon;

  const artOf = item => item?.art || item?.character?.avatar || item?.character?.art || "";
  const nameOf = item => item?.name || item?.character?.name || "";

  function portrait(item, extra = "") {
    const art = artOf(item), name = nameOf(item);
    const title = item?.character ? U().esc(U().skillSummary(item.character)) : U().esc(name);
    const className = `portrait ${item?.className || "vn-loki"}${extra ? ` ${extra}` : ""}`;
    if (!art) return `<div class="${className}" title="${title}">${U().esc(item?.face || name.slice(0, 1) || "?")}</div>`;
    return `<div class="${className}" title="${title}" data-art-src="${U().esc(art)}" data-art-name="${U().esc(name)}"><img src="${U().esc(art)}" alt="${U().esc(name || "角色")}" loading="lazy" decoding="async"></div>`;
  }

  /* 登场角色：字符串按 id 查角色栏，对象用于剧情人物（普雷希、兽人王邦迪等不在角色栏的角色）。 */
  function castOf(state, items) {
    return (items || []).filter(Boolean).map(item => {
      if (typeof item !== "string") return { name: item.name, art: item.art, className: item.className || "vn-loki" };
      const character = state.chars?.find(c => c.id === item) || null;
      return { character, className: item === "besta" ? "vn-besta" : "vn-loki" };
    }).filter(item => item.character || item.art || item.name);
  }

  /* 进度记在 state.adv：key 变化即归零，故切换事件不会串台；读档后能从上次那句继续。 */
  function cursor(state, key, total) {
    const adv = state.adv;
    if (!adv || adv.key !== key) return 0;
    const n = Number(adv.index);
    if (!Number.isSafeInteger(n)) return 0;
    return Math.min(Math.max(n, 0), Math.max(total - 1, 0));
  }

  function view({
    key = "", title = "", cast = [], lines = [], note = "", buttonAttribute = "", buttonText = "继续",
  }) {
    const state = window.state;
    const total = lines.length;
    const i = state ? cursor(state, key, total) : 0;
    if (state) state.adv = { key, index: i, total };
    const [speaker, text] = lines[i] || ["", ""];
    const stage = cast.filter(Boolean).map(item =>
      portrait(item, nameOf(item) && nameOf(item) === speaker ? "is-speaking" : "is-muted")).join("");
    const last = i >= total - 1;
    const footer = last
      ? `<p class="muted">${U().esc(note)}</p><div class="actions"><button ${U().esc(buttonAttribute)}="1">${U().esc(buttonText)}</button></div>`
      : `<p class="muted adv-hint">点击对话框或按空格继续</p><div class="adv-actions">
           <button data-adv-prev="1"${i === 0 ? " disabled" : ""}>◂ 上一句</button>
           <span class="adv-progress">${i + 1} / ${total}</span>
           <button class="primary" data-adv-next="1">继续 ▸</button>
           <button data-adv-skip="1">跳到结尾</button>
         </div>`;
    return `<div class="first-defeat-event adv-event"><h2>${U().esc(title)}</h2>`
      + `<div class="vn-stage adv-stage">${stage}</div>`
      // tabindex 让渲染后能把焦点收到对话框：否则焦点常留在关闭/继续按钮上，
      // 空格会被该按钮吃掉（实测首屏按空格无反应）。
      + `<div class="adv-box" data-adv-advance="1" tabindex="-1"><b class="adv-name">${U().esc(speaker)}</b>`
      + `<p class="adv-text">${U().esc(text)}</p></div>${footer}</div>`;
  }

  function step(delta) {
    const adv = window.state?.adv;
    if (!adv) return false;
    const target = delta === "end" ? Math.max(adv.total - 1, 0) : adv.index + delta;
    const next = Math.min(Math.max(target, 0), Math.max(adv.total - 1, 0));
    if (next === adv.index) return false;
    adv.index = next;
    return true;
  }

  function go(delta) { if (step(delta)) window.render?.(); }

  return {
    render: view,
    cast: castOf,
    next: () => go(1),
    prev: () => go(-1),
    skip: () => go("end"),
    artOf,
    nameOf,
  };
})();
