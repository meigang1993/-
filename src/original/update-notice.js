window.UpdateNotice = (() => {
  // 最新更新日期：公告标题、页脚时间与大厅按钮徽标统一以此为准，修改时只改这里。
  const latest = { iso: "2026-11-19", label: "2026年11月19日", badge: "2026.11.19" };
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
        <p class="update-notice-summary">本次更新统一数值口径：冒险 / 勇士 / 王者 / 英雄四档难度的生命、攻击、魔力、速度按 +50% / +100% / +150% / +200% 加成，所有副本莉莉丝元获得下调 30%；全部属性与技能百分比改为按「当前属性」计算（含角色强化、装备等已写回加成，多来源同一快照线性叠加、不链式累乘），回复生命值统一按施术者当前最大生命值结算，34 名可玩角色与全部怪物的属性统一取整；出牌资源全库统一更名为【淫气】，含历史公告在内的全部面向玩家文案一并同步。【增援部队】改为满血复活并弃置旧手牌、摸至手牌上限，【飘浮掩体】改在温蒂自己的结束阶段触发，【暴走杀】每使用一次按首次发动时的当前攻击力 +10%、本场战斗内线性叠加。角色详情面板的【角色强化】每次消耗 5000 莉莉丝元只永久提升所选一项属性，四项各最多强化 50 次；诺亚主动技【终极刀魔】令下一张实体单体【杀】按本回合已用实体单体杀数额外结算，目标阵亡可转移给另一名存活敌方。</p>
        <div class="update-notice-list">${sections}</div>
      </section>
    `;
  }
  return { render, latest: () => latest.badge, latestDate: () => latest };
})();
