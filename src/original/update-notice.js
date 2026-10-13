window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-10-13", label: "2026年10月13日", badge: "2026.10.13" };
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
        <p class="update-notice-summary">本次更新修复【希特威】解锁事件「贝丝妲的玩具」的「带希特威同行」按钮点了没反应（该事件此前无法完成、角色永远无法解锁），并修复回合结束后出牌区的牌逐张飞入弃牌堆、拖长等待的问题（现整批同时起飞、一次落位）；另已对全部 20 个解锁事件做统一排查，确认仅有此一处遗漏。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
