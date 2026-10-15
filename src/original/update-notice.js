window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-10-15", label: "2026年10月15日", badge: "2026.10.15" };
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
        <p class="update-notice-summary">本次更新修复被【机械牛头王】【电磁反制装置】反制致死时战斗卡在弃牌阶段、回合不再推进的问题，并排查确认弹反、鬼牌狂欢、机尾机枪、【死亡音波】、【外神之眼】等其它回合外伤害机制均不受影响；修复群体攻击（AOE）即将打死角色时整段动画变慢的问题（打死 1 人多花约 700 毫秒，打死 2 人多花约 1350 毫秒）；优化战斗界面偶发卡顿的两处强制同步重排（台词气泡位置校正与手牌滚动条读取）；另将【普雷希】【女王威压】触发「不可响应」时的台词改为「女王的力量，你躲不开的。都给我跪下」。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
