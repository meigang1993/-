window.VillaEventRenderer = (() => {
  const ui = window.UICommon;
  const besta = {
    name: "贝丝妲",
    avatar: "./assets/generated/besta-villa-new.webp",
    art: "./assets/generated/besta-villa-new.webp",
    skills: [],
  };

  function portrait(character, extraClass) {
    const art = character.avatar || character.art;
    const title = ui.esc(ui.skillSummary(character));
    const className = `portrait${extraClass ? ` ${extraClass}` : ""}`;
    if (!art) {
      return `<div class="${className}" title="${title}">${character.face}</div>`;
    }
    return `<div class="${className}" title="${title}" data-art-src="${ui.esc(art)}" data-art-name="${ui.esc(character.name || "")}"><img src="${ui.esc(art)}" alt="${ui.esc(character.name || "角色")}" loading="lazy" decoding="async"></div>`;
  }

  function render({
    title, cast, lines, note, buttonAttribute, buttonText,
  }) {
    const portraits = cast.filter(item => item.character)
      .map(item => portrait(item.character, item.className)).join("");
    const dialogue = lines.map(([name, text]) =>
      `<div class="vn-line"><b>${ui.esc(name)}</b><span>${ui.esc(text)}</span></div>`)
      .join("");
    return `<div class="first-defeat-event"><h2>${title}</h2><div class="vn-stage">${portraits}</div><div class="vn-lines">${dialogue}</div><p class="muted">${note}</p><div class="actions"><button ${buttonAttribute}="1">${buttonText}</button></div></div>`;
  }

  return { besta, render };
})();
