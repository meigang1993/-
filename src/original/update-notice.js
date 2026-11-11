window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-11-10", label: "2026年11月10日", badge: "2026.11.10" };
    // 公告条目按「常改 / 归档 / 规则」拆成数据文件，避免单文件超过 189 行硬约束：
  //   update-notice-recent.js  —— 最近几期，新条目一律加到该文件第一期
  //   update-notice-archive.js —— 按期历史归档，条目只增不改
  //   update-notice-rules.js   —— 无日期的规则说明类章节
  // 按期章节按时间由新到旧排列，拼接顺序 recent → archive → rules（与拆分前一致）。
  // 三个数据文件任一漏加载都不允许静默少章节：一律快速失败，msg 与拆分装配护栏同口径。
  if (!window.UpdateNoticeRules) throw new Error("[update-notice-rules] 模块未装配：update-notice-rules.js 必须先于 update-notice.js 加载");
  if (!window.UpdateNoticeRecent) throw new Error("[update-notice-recent] 模块未装配：update-notice-recent.js 必须先于 update-notice.js 加载");
  if (!window.UpdateNoticeArchive) throw new Error("[update-notice-archive] 模块未装配：update-notice-archive.js 必须先于 update-notice.js 加载");
  const updates = [
    ...window.UpdateNoticeRecent,
    ...window.UpdateNoticeArchive,
    ...window.UpdateNoticeRules,
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
        <p class="update-notice-summary">本次更新新增第 34 名可玩角色【怪面诺亚】（淫气改造者），完成角色数据、两张立绘、解锁事件、羁绊任务与管家手册的接入，并实装【淫气改造】【改造副作用】两个技能；同时重做【盖亚妮丝护符】与【圣鹰剑】两件饰品，同步全角色与怪物属性翻倍、四档难度倍率重调。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
