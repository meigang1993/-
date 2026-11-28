// 【离子导弹】蓄力技图标：勾玉（magatama）造型 + 0/4 计数 + 置灰/点亮。
// 按「行数不够多创建文件」拆成独立模块，加载期零副作用，只依赖注入的 U(esc)。
// 未满 4 点：置灰、按钮 disabled、显示 N/4；满 4：点亮发光、可点击态、显示 4/4。
window.TenriJaminChargeIcon = (() => {
  const MAX = 4;
  // 勾玉：粗头带孔的逗号形玉，细尾内卷。viewBox 40×40。
  const PATH = "M20 3C11 3 4 10 4 19C4 26 9 32 16 33C12 30 10 26 10 21"
    + "C10 15 14 10 21 10C26 10 30 13 32 18C31 9 26 3 20 3Z";
  function svg() {
    return `<svg class="jamin-magatama" viewBox="0 0 40 40" aria-hidden="true" focusable="false">`
      + `<path d="${PATH}" fill="currentColor"/>`
      + `<circle class="jamin-magatama-hole" cx="15.5" cy="19.5" r="3.6"/></svg>`;
  }
  function badge(unit, U) {
    if (!unit || (unit.ai !== "tenri_jamin" && unit.id !== "tenri_jamin")) return "";
    if (!(unit.skills || []).some(skill => skill.name === "离子导弹")) return "";
    const cur = Math.min(MAX, Math.max(0, Number(unit.jaminCharge) || 0));
    const ready = cur >= MAX;
    const title = `离子导弹（蓄力技 ${cur}/${MAX}）：`
      + (ready ? "已蓄满，可发动" : "未满，技能图标置灰");
    const esc = U?.esc ? U.esc(title) : title;
    return `<button type="button" class="jamin-charge-skill ${ready ? "ready" : "dim"}"`
      + ` title="${esc}" data-jamin-charge="${cur}" data-jamin-charge-ready="${ready ? 1 : 0}"`
      + `${ready ? "" : " disabled"}>`
      + `<span class="jamin-charge-art">${svg()}<b class="jamin-charge-num">${cur}/${MAX}</b></span>`
      + `<span class="jamin-charge-label">离子导弹</span></button>`;
  }
  return { MAX, PATH, svg, badge };
})();
