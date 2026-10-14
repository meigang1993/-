window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-10-14", label: "2026年10月14日", badge: "2026.10.14" };
    // 公告条目按「常改 / 归档」拆成两个数据文件，避免单文件超过 200 行硬约束：
  //   update-notice-recent.js  —— 最近几期，新条目一律加到该文件第一期
  //   update-notice-archive.js —— 历史归档，条目只增不改
  // 两者均按时间由新到旧排列，拼接时 recent 在前。
  const updates = [
    ...(window.UpdateNoticeRecent || []),
    ...(window.UpdateNoticeArchive || []),
  ];
  const esc = value => String(value ?? "").replace(/[&<>"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char]));

  function render() {
    const sections = updates.map(section => `
      <section class="update-notice-section">
        <h3>${esc(section.title)}</h3>
        <ul>${section.items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>
      </section>
    `).join("");
    return `
      <section class="update-notice" aria-labelledby="update-notice-title">
        <header class="update-notice-head">
          <div>
            <span class="update-notice-kicker">版本更新</span>
            <h2 id="update-notice-title">更新公告</h2>
          </div>
        <time datetime="${latest.iso}">更新至${latest.label}</time>
      </header>
        <p class="update-notice-summary">本次更新新增可玩角色【普雷希】（魅魔女王，第 31 名可培养职业），自带【女王威压】与【女王榨取】两个技能，首次击败机械AI龙返回别墅即可解锁；并修复四处技能与饰品的实际效果问题：【女王榨取】目标选择“能点但点了没反应”、【狙击】可选没有手牌的敌方角色、【格林机枪】误把群体杀计入且会展示手牌、AI 使用【拆解】【偷窃】时替对手清掉负面状态牌；另修正【妖刀村雨】绕过【暗幕隐身】锁定、【女王威压】翻倍改为只认实体牌、【心血之咒】改为受实体牌或虚拟牌伤害才触发。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
