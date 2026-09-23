window.BattleLineIntro = ({ showMany, showPages, lineOf, lineKeyOf, refsOf }) => {
  const { skillLines, allyIntroLines } = window.BattleLineData;
  const AUTO_INTRO_DURATION = 3600;
  const INTRO_PAUSE_DURATION = 10000;
  let introResolve = null;
  let introAutoTimer = null;

  function edisIntro(angelica, edis) {
    return [
      { unit: angelica, text: "啧，又见面了，伊迪斯。上次输给老子，这次还敢来？" },
      { unit: edis, text: "安洁莉卡！妾身奉魔后之命抓捕罗卡尔，与你无关。识相就闪开！" },
      { unit: angelica, text: "巧了，那个臭小鬼正好是老子的弟弟。想抓他，先过老子这一关。" },
      { unit: edis, text: "你以为妾身还是上次的妾身吗？这次妾身可是带了全新的装备——" },
      { unit: angelica, text: "上次你也这么说。结果呢？还不是被老子打哭在床上。" },
      { unit: edis, text: "闭嘴！那是妾身的耻辱！你这个女人只对女人感兴趣的变态，整个魔族都知道你的特殊癖好——上次把妾身绑在床上整整三天，这次妾身绝不会再让你得逞！" },
      { unit: angelica, text: "说完了？老子是喜欢女人，尤其是你这种嘴硬的。行啊，那换个赌法——老子赢了，你乖乖跟老子回去，做老子的女人。" },
      { unit: edis, text: "你赢了再说！" },
      { unit: angelica, text: "哈哈哈哈！这才像话。来吧，手下败将，让老子看看你长进了多少！" },
    ];
  }

  function risaElranaIntro(risa, elrana) {
    return [
      { unit: risa, text: "艾尔拉娜姐姐，终于又见到你了。跟吾辈走吧，吾辈想死你了，想再次吃你会再生的肉呀，还要和你磨豆腐。这次先放他一马。" },
      { unit: elrana, text: "不行，我还有事，不想跟你动手。让开。" },
      { unit: risa, text: "可是吾辈想和你动手♥想扣你♥，姐姐再爱吾辈一次。要是你输了，跟吾辈结婚吧。" },
      { unit: elrana, text: "你一点都没变。那只能制服你了。" },
      { unit: risa, text: "来吧♥姐姐，试试。" },
    ];
  }

  function bakaarBestaIntro(bakaar, besta) {
    return [
      { unit: bakaar, text: "贝丝妲，你这婊子，也要多管闲事？" },
      { unit: besta, text: "只不过帮妹妹开路而已。要不要再次向我挑战？你上次不到5秒就射了，年轻时候你就是早泄男，赢不过我这个最强斗士。" },
      { unit: bakaar, text: "别说了！那时候我很弱，没有保护好鲁妮，妹妹差点死了。对世界贵族和天界的血海深仇，一辈子都不会忘。先把你这婊子收拾了，把你交给本王的士兵们轮流捅，本王想看你这个高贵魅魔公主变成母猪样子。" },
      { unit: besta, text: "魔王大人好这口？那就看你，能不能把人家战败了。" },
      { unit: bakaar, text: "本王满足你！" },
      { unit: besta, text: "呵呵，你不是喜欢纯爱后宫吗？怎么忍心把自己碰过的女人给别人。" },
    ];
  }

  function pauseItems(state, items) {
    clearTimeout(introAutoTimer);
    const wait = new Promise(resolve => { introResolve = resolve; });
    showMany(state, items, Infinity, { dismissible: true, introPause: true });
    introAutoTimer = setTimeout(() => {
      if (state?.battle?.speech?.introPause) {
        state.battle.speech = null;
        window.render?.();
      }
      resolve();
    }, INTRO_PAUSE_DURATION);
    return wait;
  }

  const showExchange = (state, items) => showPages(state, items.map(item => [item]), AUTO_INTRO_DURATION);

  function start(state) {
    const battle = state.battle;
    const lokar = battle?.allies?.find(unit => unit.ref === "lokar" && unit.hp > 0);
    const unit = battle?.enemies?.find(enemy => enemy.ai === "mechanical_bull_king" && lineKeyOf(skillLines, enemy, "intro"))
      || battle?.enemies?.find(enemy => (enemy.type === "elite" || enemy.type === "boss") && lineKeyOf(skillLines, enemy, "intro"))
      || battle?.enemies?.find(enemy => lineKeyOf(skillLines, enemy, "intro"));
    const angelica = battle?.allies?.find(ally => ally.ref === "angelica" && ally.hp > 0);
    const edis = battle?.enemies?.find(enemy => enemy.ai === "pursuer_edis" && enemy.hp > 0);
    const elrana = battle?.allies?.find(ally => ally.ref === "elrana" && ally.hp > 0);
    const risa = battle?.enemies?.find(enemy => enemy.id === "assassin_sakura_risa" && enemy.hp > 0);
    const besta = battle?.allies?.find(ally => ally.ref === "besta" && ally.hp > 0);
    const bakaar = battle?.enemies?.find(enemy => enemy.id === "demon_king_bakaar" && enemy.hp > 0);
    if (angelica && edis) return showExchange(state, edisIntro(angelica, edis));
    if (besta && bakaar) return showExchange(state, bakaarBestaIntro(bakaar, besta));
    if (elrana && risa) return showExchange(state, risaElranaIntro(risa, elrana));
    const items = battle?.allies?.filter(ally => ally.hp > 0 && allyIntroLines[ally.ref]).slice(0, 4)
      .map(ally => ({ unit: ally, text: allyIntroLines[ally.ref] })) || [];
    const introText = lineOf(skillLines, unit, "intro");
    if (unit && introText) items.unshift({ unit, text: introText });
    if (refsOf(unit).includes("elrana_clone") && lokar) items.push({ unit: lokar, text: skillLines.elrana_clone.lokarIntro });
    if (!items.length) return 0;
    const pause = unit?.type === "elite" || unit?.type === "boss";
    if (!pause) {
      showMany(state, items, AUTO_INTRO_DURATION, { dismissible: true });
      return 0;
    }
    return pauseItems(state, items);
  }

  function resolve() {
    clearTimeout(introAutoTimer);
    introAutoTimer = null;
    const resume = introResolve;
    introResolve = null;
    if (resume) resume();
  }

  function cancel() {
    clearTimeout(introAutoTimer);
    introAutoTimer = null;
    resolve();
  }

  return { start, resolve, cancel };
};
