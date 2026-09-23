// 隔离对比：卡牌转移动画的起终点计算（battle-effect-card-transfers.js）
// 关注点：
//   1) 正常路径（起终点都能取到）：新版与旧版必须完全一致，不能改变行为
//   2) 回退路径（手牌区/头像都取不到）：旧版 to=null → 动画静默不播；
//      新版必须回退到 publicZone / drawOrigin，保证动画必播
//   3) 回退后起终点不能退化成同一个点（否则原地飞，视觉上仍是异常）
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const https = require("https");

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

function fetchRemote() {
  return new Promise((resolve, reject) => {
    const url = "https://raw.githubusercontent.com/meigang1993/-/main/"
      + "src/original/battle-effect-card-transfers.js";
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

(async () => {
  let total = 0, pass = 0;
  const localSrc = fs.readFileSync(LOCAL, "utf8");
  let remoteSrc = null;
  try {
    remoteSrc = await fetchRemote();
  } catch (err) {
    console.log("⚠️ 远端源码拉取失败，跳过新旧对比：", err.message);
  }

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

  if (remoteSrc) {
    console.log("\n【5】与远端旧版对比：确认只改回退、未改正常行为");
    const oldT = loadTransfers(remoteSrc, "远端旧版");
    const apiOld = oldT.factory(makeU());
    await apiOld.stealCard({
      type: "stealCard", fromUid: "a1", fromSide: "ally",
      toUid: "e1", toSide: "enemy", count: 1, cards: [{}],
    }, () => {}, () => true);
    total++; pass += check("旧版正常路径起终点与新版完全一致",
      oldT.calls[0].from?.tag === "active-hand"
      && oldT.calls[0].to?.tag === "enemy-art",
      { from: oldT.calls[0].from, to: oldT.calls[0].to });

    oldT.calls.length = 0;
    await apiOld.stealCard({
      type: "stealCard", fromUid: "a1", fromSide: "ally",
      toUid: "ghost", toSide: "enemy", count: 1, cards: [{}],
    }, () => {}, () => true);
    total++; pass += check("旧版回退路径终点为 null（即原来动画会静默跳过）",
      oldT.calls[0].to === null, { to: oldT.calls[0].to });
  }

  console.log(`\n${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
