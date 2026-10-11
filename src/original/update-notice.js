window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-10-11", label: "2026年10月11日", badge: "2026.10.11" };
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
        <p class="update-notice-summary">本次更新不再支持旧版存档（启动自动清除并严格防误删），修复云端存档的三处故障隐患，排除副本难度解锁的最后一处隐患并逐副本复查；【安洁莉卡】【力量爆发】倍率上调为 1.5 倍起。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
