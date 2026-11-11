// 怪面诺亚【改造副作用】1~4 人 × 全性别组合严格检查，含与【淫气改造】联动
//   A 每个队伍人数 n=1..4、2^n 种性别组合：手牌上限 = 4 + 存活男性队友数
//   B 结束阶段：只对「其他存活男性」各造成攻击力伤害；女性/自己/敌方/死者不受
//   C 无存活男性 -> 狂暴虚拟【咬杀】+ skipPlayPhase；有男性则不狂暴
//   D 联动：人数决定上限 -> balanceHand 摸至上限 / 溢出挂起玩家弃置
//   E 死亡变体：男性阵亡后上限实时下降，伤害不再打到死者
//   F 狂暴回合 enterPlayPhase 不得进入 phase4（淫气改造整回合不生效）
// 反向：REVERT=gender|self|frenzy|limit 时对应断言必须变红。
// 支持 SIDE_GENDER=A,B,C,D,E,F 分批。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = f => path.join(__dirname, "..", "src", "original", f);
const REVERT = process.env.REVERT || "";
const SEGS = (process.env.SIDE_GENDER || "A,B,C,D,E,F").split(",").filter(Boolean);
let rawSide = fs.readFileSync(SRC("noa-side-effect-skills.js"), "utf8");
if (REVERT === "gender") rawSide = rawSide.replace('unit.gender === "male"', "true");
// 反向「排除自己」：强行把诺亚塞进伤害名单。诺亚是女性，malesOf 本就不含她，
// 所以单纯去掉 filter 不会打红（该过滤在真实模板下是冗余的）。
if (REVERT === "self") rawSide = rawSide.replace(
  "const males = malesOf(b).filter(target => target.uid !== unit.uid);",
  "const males = [...malesOf(b), unit];");

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const logs = [], lines = [], virtuals = [], damageLog = [], discarded = [];
const NOA_SKILLS = [
  { name: "淫气改造", text: "锁定技，出牌阶段内手牌数始终等于手牌上限；使用【杀】牌不消耗杀意。" },
  { name: "改造副作用", text: "锁定技，结束阶段对其他存活男性造成攻击力伤害；每名存活男性手牌上限+1；无存活男性时随机虚拟咬杀并跳过出牌阶段。" },
];
const mkUnit = (ref, gender, hp = 50, extra = {}) => ({
  uid: ref, ref, name: ref, gender, hp, maxHp: 130, side: "ally",
  hand: [], stats: { attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 1, handLimit: 4 },
  skills: [], ...extra,
});
const card = (name = "试牌") => ({ name, type: "tactic", suit: "♠" });
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", suit: "♠", ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(t) };
ctx.BattleLines = { skill: (s, u, name) => lines.push({ unit: u?.uid, name }) };
ctx.BattleCards = {
  put: (b, u, c, pile) => discarded.push({ u: u?.uid, card: c?.name, pile }),
  putMany: () => {}, queueResponse: () => {}, visibleHandCount: u => u?.hand?.length || 0,
};
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.BattleSystem = {
  useVirtualKill: (s, a, t, c) => virtuals.push({ actor: a?.uid, target: t?.uid, card: c }),
  draw: (u, n) => { for (let i = 0; i < n; i++) u.hand.push(card("摸牌" + i)); },
};
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };

vm.runInContext(rawSide, ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(fs.readFileSync(SRC("noa-charm-discard.js"), "utf8"), ctx, { filename: "noa-charm-discard.js" });
 vm.runInContext(fs.readFileSync(SRC("noa-charm-skills.js"), "utf8"), ctx,
  { filename: "noa-charm-skills.js" });
const Side = ctx.NoaSideEffectSkills, Charm = ctx.NoaCharmSkills;
if (REVERT === "frenzy") Side.beginPlayPhase = () => false;
if (REVERT === "limit") Side.handLimit = () => null;

// n 名队友，mask 的 bit=1 表示 male，bit=0 表示 female。
// 敌方固定 1 名男性，用于验证敌方不计入上限/伤害。
function combo(n, mask, deadIndex = -1) {
  const noa = mkUnit("noa", "female", 50, { skills: NOA_SKILLS });
  const mates = [];
  for (let i = 0; i < n; i++) {
    const g = (mask >> i) & 1 ? "male" : "female";
    mates.push(mkUnit("m" + i, g, deadIndex === i ? 0 : 50));
  }
  const enemies = [mkUnit("e0", "male", 50, { side: "enemy" })];
  const battle = {
    allies: [noa, ...mates], enemies, phase: 4, turn: 1,
    activeUid: "noa", locked: false, log: [], played: [],
  };
  const state = { battle, settings: {}, battleLog: logs };
  ctx.state = state;
  return { state, battle, noa, mates, enemies };
}
const label = (n, mask) => {
  const g = [];
  for (let i = 0; i < n; i++) g.push((mask >> i) & 1 ? "男" : "女");
  return `${n}人[${g.join("")}]`;
};
const expectM = (n, mask, deadIndex = -1) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (((mask >> i) & 1) && deadIndex !== i) c++;
  return c;
};

// ---------- A / B / C：1~4 人全性别组合 ----------
if (SEGS.includes("A") || SEGS.includes("B") || SEGS.includes("C")) {
  for (let n = 1; n <= 4; n++) {
    for (let mask = 0; mask < (1 << n); mask++) {
      const { state, battle, noa, mates } = combo(n, mask);
      const m = expectM(n, mask);
      const nm = `${label(n, mask)}`;
      if (SEGS.includes("A")) {
        T(`A ${nm} 上限=4+${m}=${4 + m}`, Side.handLimit(noa) === 4 + m,
          { got: Side.handLimit(noa), m });
      }
      if (SEGS.includes("B")) {
        logs.length = 0; lines.length = 0; damageLog.length = 0;
        Side.endTurn(state, noa, {
          damage: (s, target, amount, reason, source) =>
            damageLog.push({ uid: target.uid, amount, reason, source: source?.uid }),
        });
        const hitUids = damageLog.map(d => d.uid).sort().join(",");
        const wantUids = mates.filter(u => u.gender === "male").map(u => u.uid).sort().join(",");
        T(`B ${nm} 仅存活男性各掉攻击力6`, hitUids === wantUids
          && damageLog.every(d => d.amount === 6 && d.reason === "改造副作用"
            && d.source === "noa"),
        { hitUids, wantUids, damageLog });
        T(`B ${nm} 有男性才播台词/日志`, (m > 0) === lines.some(l => l.name === "改造副作用")
          && (m > 0) === logs.some(t => t.includes("各造成6点伤害")),
        { lines: lines.length, logs });
      }
      if (SEGS.includes("C")) {
        virtuals.length = 0;
        delete noa.skipPlayPhase; delete noa.skipPlayReason;
        battle.phase = 3; battle.turn = 7;
        const frenzy = Side.beginPlayPhase(state, noa);
        if (m === 0) {
          T(`C ${nm} 无存活男性 -> 狂暴咬杀+跳过出牌`, frenzy === true
            && noa.skipPlayPhase === true && virtuals.length === 1
            && virtuals[0].card?.name === "咬杀"
            && virtuals[0].card?.noIntentCost === true,
          { frenzy, skip: noa.skipPlayPhase, virtuals });
        } else {
          T(`C ${nm} 有存活男性 -> 不狂暴`, frenzy === false
            && !noa.skipPlayPhase && virtuals.length === 0,
          { frenzy, skip: noa.skipPlayPhase, virtuals: virtuals.length });
        }
      }
    }
  }
}

// ---------- D：人数 -> 上限 -> 淫气改造联动 ----------
if (SEGS.includes("D")) {
  for (let n = 1; n <= 4; n++) {
    for (let mask = 0; mask < (1 << n); mask++) {
      const { state, battle, noa } = combo(n, mask);
      const m = expectM(n, mask), limit = 4 + m;
      battle.phase = 4;
      const drawn = Charm.balanceHand(state, noa, ctx.BattleSystem.draw, { onlySelf: true });
      T(`D ${label(n, mask)} 摸至上限${limit}`, drawn === limit && noa.hand.length === limit,
        { drawn, hand: noa.hand.length, limit });
      // 溢出 2 张 -> 挂起玩家弃置（弃牌阶段同款），不自动弃
      noa.hand.push(card("多1"), card("多2"));
      battle.noaCharmDiscard = null;
      logs.length = 0;
      Charm.balanceHand(state, noa, ctx.BattleSystem.draw, { onlySelf: true });
      T(`D ${label(n, mask)} 溢出2张 -> 挂起need=2且不自动弃`,
        battle.noaCharmDiscard?.need === 2 && noa.hand.length === limit + 2,
        { charm: battle.noaCharmDiscard, hand: noa.hand.length });
    }
  }
}

// ---------- E：死亡变体（3 人，逐一让一名男性阵亡） ----------
if (SEGS.includes("E")) {
  for (const mask of [0b111, 0b110, 0b101, 0b011]) {
    for (let dead = 0; dead < 3; dead++) {
      if (!((mask >> dead) & 1)) continue; // 只让原本是男性的阵亡
      const { state, battle, noa, mates } = combo(3, mask, dead);
      const aliveM = expectM(3, mask, dead);
      T(`E ${label(3, mask)} 男${dead}阵亡 -> 上限降为${4 + aliveM}`,
        Side.handLimit(noa) === 4 + aliveM, { got: Side.handLimit(noa), aliveM });
      damageLog.length = 0;
      Side.endTurn(state, noa, {
        damage: (s, t, a) => damageLog.push({ uid: t.uid, a }),
      });
      T(`E ${label(3, mask)} 男${dead}阵亡 -> 不再打死者、其余男性各掉6`,
        !damageLog.some(d => d.uid === "m" + dead)
        && damageLog.length === aliveM && damageLog.every(d => d.a === 6),
        { damageLog, aliveM });
      // 上限下降后，原手牌数溢出 -> 触发玩家弃置
      battle.phase = 4;
      noa.hand = Array.from({ length: 4 + aliveM + 1 }, () => card());
      battle.noaCharmDiscard = null;
      Charm.balanceHand(state, noa, ctx.BattleSystem.draw, { onlySelf: true });
      T(`E ${label(3, mask)} 男${dead}阵亡 -> 下回合溢出触发弃置need=1`,
        battle.noaCharmDiscard?.need === 1, { charm: battle.noaCharmDiscard });
    }
  }
}

// ---------- F：狂暴回合不得进 phase4（两技能联动的守门） ----------
if (SEGS.includes("F")) {
  for (const mask of [0b00, 0b01, 0b11]) {
    const { state, battle, noa } = combo(2, mask);
    battle.phase = 3; battle.turn = 11;
    Side.beginPlayPhase(state, noa);
    const allow = Charm.enterPlayPhase(state, noa, ctx.BattleSystem.draw, () => {});
    const m = expectM(2, mask);
    if (m === 0) {
      T(`F ${label(2, mask)} 狂暴回合不进phase4、淫气改造不生效`,
        allow === false && battle.phase !== 4 && Charm.noIntentCost(noa, { name: "杀", type: "slash" }) === false,
        { allow, phase: battle.phase });
    } else {
      T(`F ${label(2, mask)} 有男性正常进phase4并做手牌平衡`,
        allow === true && battle.phase === 4 && noa.hand.length === 4 + m,
        { allow, phase: battle.phase, hand: noa.hand.length });
    }
  }
  // 真实模板口径：诺亚自己是女性，不能把自己算进「男性」上限
  const c = combo(1, 1);
  T("F4 诺亚自己是女性，不算男性上限", c.noa.gender === "female"
    && Side.handLimit(c.noa) === 5, { got: Side.handLimit(c.noa) });
}

// ---------- G：性别边界观察（真实模板不可达，只记录口径，不做断言） ----------
if (SEGS.includes("G")) {
  const c = combo(2, 0b01); // 1 男 1 女
  const asFemale = Side.handLimit(c.noa);
  c.noa.gender = "male";
  const asMale = Side.handLimit(c.noa);
  damageLog.length = 0;
  Side.endTurn(c.state, c.noa, { damage: (s, t, a) => damageLog.push({ uid: t.uid, a }) });
  console.log(`OBSERVE 若 noa.gender 变为 male：handLimit ${asFemale}->${asMale}`
    + `（+1，把自己算进去了），endTurn 命中=[${damageLog.map(d => d.uid).join(",")}]（仍不含自己）`);
}

console.log(`\nRESULT ${pass}/${total}${REVERT ? " REVERT=" + REVERT : ""}`);
if (pass !== total) process.exitCode = 1;
