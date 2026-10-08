// 多角色摸牌事件的合并器。
//
// 背景：多角色各摸 N 张时，draw() 会给每个角色各推一条 drawBatch，动画层
// 逐条串行播放——4 人 ×2 张要连播 4 段飞牌，整手补给拖得很长。本模块把队尾
// 一批「不同角色」的 drawBatch 收成一条 drawGroup，由动画层并行播放。
// 实测 4 人队：4 段串行约 1470ms，合并后约 760ms。
//
// 用法：不必手动调用。battle-session 的 draw() 与 battle-cards-system 的
// put()/putMany() 每次完成后都会自动打包一次，队尾已有的 group 会被展开并
// 卷进新组，因此多名角色的连续摸/弃最终收敛成**一条**组、只播一段动画。
// 只合并队尾连续的同类型事件，避免把之前无关的事件卷进来；单一角色的批次
// 由 battle-session 的 mergeDrawBatch 已按 uid 合并，这里不动。
window.BattleDrawPacker = (() => {
  // 取队尾连续的同类型事件（倒着扫，遇到别的类型就停）。
  // 队尾已有的 group 会被**展开**成原始批次后并入，并继续向前扫——否则
  // 「每完成一次 draw()/put() 就打包一次」只能两两合并：4 人队会得到
  // [G(a0,a1), G(a2,a3)] 两个组，动画仍要串行播两段。展开后 4 人队收敛成
  // 一条组、只播一段，技能与饰品因此完全不必记得调用打包器。
  // consumed 记的是**队列元素个数**（可能少于展开后的 list 长度），
  // 直接拿 list.length 做 splice 起点会切错位置。
  function tailRun(queue, type, groupType) {
    const list = [];
    let consumed = 0;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const event = queue[index];
      if (!event) break;
      if (event.type === type) {
        list.unshift(event);
        consumed += 1;
        continue;
      }
      if (event.type === groupType && Array.isArray(event.batches)) {
        list.unshift(...event.batches);
        consumed += 1;
        continue;
      }
      break;
    }
    return { list, consumed };
  }
  function packAs(queue, type, groupType) {
    if (!Array.isArray(queue)) return 0;
    const { list: run, consumed } = tailRun(queue, type, groupType);
    // 只有一个批次、或所有批次都属于同一名角色时不必成组
    const uids = new Set(run.map(event => event.uid));
    if (run.length < 2 || uids.size < 2) return 0;
    const at = queue.length - consumed;
    queue.splice(at, consumed, {
      id: run[0].id,
      type: groupType,
      batches: run,
      cards: run.reduce((all, event) => all.concat(event.cards || []), []),
    });
    return run.length;
  }
  function packDrawGroup(battle) {
    return packAs(battle?.animQueue, "drawBatch", "drawGroup");
  }
  function packDiscardGroup(battle) {
    return packAs(battle?.animQueue, "discardBatch", "discardGroup");
  }
  return { packDrawGroup, packDiscardGroup, tailRun };
})();
