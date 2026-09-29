window.VillaEventRenderer = (() => {
  const ui = window.UICommon;
  const besta = {
    name: "贝丝妲",
    avatar: "./assets/generated/besta-villa-new.3cf7a4f0.webp",
    art: "./assets/generated/besta-villa-new.3cf7a4f0.webp",
    skills: [],
  };

  /* 全部解锁事件改为 ADV 对话框：一次一句、说话者立绘高亮、点击推进，
     结尾才出现解锁按钮。渲染交给 AdvDialogue，各事件只需提供台词与登场角色。 */
  function render(options) {
    return window.AdvDialogue.render(options);
  }

  return { besta, render };
})();
