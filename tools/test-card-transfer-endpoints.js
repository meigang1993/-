// 隔离验证：卡牌转移动画的起终点计算（battle-effect-card-transfers.js）
// 关注点：
//   1) 正常路径（起终点都能取到）保持手牌区与头像作为起终点
//   2) 缺少头像或公共区时回退到 publicZone / drawOrigin，避免动画静默跳过
//   3) 回退后起终点不能退化成同一个点（否则原地飞，视觉上仍是异常）
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const LOCAL = path.join(__dirname, "..", "src", "original",
  "battle-effect-card-transfers.js");

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 用假的 flight 记录每次 transfer 收到的起终点，不真正播放动画
function loadTransfers(source, label) {
  const sandbox = { window: {}, console };
  sandbox.window.BattleEffectCardMotion = () => ({
    transfer: (event, from, to, className) => {
      sandbox.__calls.push({ type: event.type, from, to, className });
      return Promise.resolve();
    },
  });
  sandbox.__calls = [];
  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx, { filename: label });
  const factory = sandbox.window.BattleEffectCardTransfers;
  return { factory, calls: sandbox.__calls };
}

// 构造 U：ghost 这个 uid 既没有 .active-hand 也没有 .unit-art
function makeU() {
  const allyArt = { tag: "ally-art" };
  const enemyArt = { tag: "enemy-art" };
  const publicEl = { tag: "public-zone" };
  const deckEl = { tag: "deck" };
  const centerEl = { tag: "battle-center" };
  return {
    publicZone: () => publicEl,
    drawOrigin: () => deckEl,
    pileZone: () => deckEl,
    unitArt: uid => (uid === "a1" ? allyArt
      : uid === "e1" ? enemyArt : null),
    handSpot: (uid) => (uid === "a1" ? { tag: "active-hand" }
      : uid === "e1" ? enemyArt : null),
    hideLine: () => {},
    __els: { allyArt, enemyArt, publicEl, deckEl, centerEl },
  };
}

(async () => {
  let total = 0, pass = 0;
  const localSrc = fs.readFileSync(LOCAL, "utf8");

  const u = makeU();
  const els = u.__els;
  const newT = loadTransfers(localSrc, "本地新版");
  const apiNew = newT.factory(u);

  console.log("【1】正常路径：友方手牌区 → 敌方头像（偷窃）");
  await apiNew.stealCard({
    type: "stealCard", fromUid: "a1", fromSide: "ally",
    toUid: "e1", toSide: "enemy", count: 1, cards: [{}],
  }, () => {}, () => true);
  let c = newT.calls[0];
  total++; pass += check("起点 = 友方手牌区（未被回退链改动）",
    c.from?.tag === "active-hand", { from: c.from });
  total++; pass += check("终点 = 敌方头像（未被回退链改动）",
    c.to === els.enemyArt, { to: c.to });

  console.log("\n【2】回退路径：接收方 ghost（无手牌区也无头像）");
  newT.calls.length = 0;
  await apiNew.stealCard({
    type: "stealCard", fromUid: "a1", fromSide: "ally",
    toUid: "ghost", toSide: "enemy", count: 1, cards: [{}],
  }, () => {}, () => true);
  c = newT.calls[0];
  total++; pass += check("新版终点回退到公共区（不再为 null）",
    c.to === els.publicEl, { to: c.to });
  total++; pass += check("新版起点仍为友方手牌区，起终点不同（不会原地飞）",
    c.from?.tag === "active-hand" && c.from !== c.to,
    { from: c.from, to: c.to });

  console.log("\n【3】极端回退：两端都取不到，且无公共区");
  const u2 = makeU();
  u2.publicZone = () => null;
  u2.drawOrigin = () => els.deckEl;
  const t2 = loadTransfers(localSrc, "本地新版2");
  const api2 = t2.factory(u2);
  await api2.stealCard({
    type: "stealCard", fromUid: "ghost", fromSide: "ally",
    toUid: "ghost2", toSide: "enemy", count: 1, cards: [{}],
  }, () => {}, () => true);
  c = t2.calls[0];
  total++; pass += check("无公共区时回退到摸牌堆", c.to === els.deckEl,
    { to: c.to });

  console.log("\n【4】给牌路径：giveCards 正常与回退");
  const t3 = loadTransfers(localSrc, "本地新版3");
  const api3 = t3.factory(makeU());
  await api3.giveCards({
    type: "giveCards", fromUid: "a1", fromSide: "ally",
    toUid: "e1", toSide: "enemy", count: 1, cards: [{}],
  }, () => {}, () => true);
  total++; pass += check("giveCards 正常路径起点=手牌区、终点=敌方头像",
    t3.calls[0].from?.tag === "active-hand" && t3.calls[0].to?.tag === "enemy-art",
    { from: t3.calls[0].from, to: t3.calls[0].to });

  console.log(`\n${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
