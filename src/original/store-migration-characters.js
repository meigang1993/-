window.StoreCharacterMigrations = (() => {
  const {
    makeCharacter, applyProgression, cleanLevel,
  } = window.GameStoreStateFactory;
  const { cardKey, repairCard } = window.StoreRepairs;

  function cleanResource(value) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function legacyMaxHp(old, template) {
    const stored = Number(old?.stats?.maxHp);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const allocations = Math.max(0, Math.floor(Number(old?.spent?.maxHp) || 0));
    return Math.max(1, (Number(template?.stats?.maxHp) || 10) + allocations * 3);
  }

  function previousGrowthMaxHp(old, template, growthVersion) {
    const stored = Number(old?.stats?.maxHp);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const base = Number(template?.stats?.maxHp) || 10;
    const total = Number(window.CharacterProgression.profile(template?.id).maxHp) || 0;
    const previousTotal = growthVersion >= 2 ? total : total / 2;
    return Math.max(1, Math.round(base
      + previousTotal * cleanLevel(old?.level) / window.CharacterProgression.maxLevel));
  }

  function migrateCharacter(template, oldCharacters, options = {}) {
    const migrateProgression = !!options.migrateProgression;
    const migrateGrowth = !!options.migrateGrowth;
    const old = oldCharacters.find(character => character.id === template.id);
    const oldHp = Number(old?.hp);
    const oldMaxHp = migrateGrowth && !migrateProgression
      ? previousGrowthMaxHp(old, template, options.previousGrowthVersion)
      : legacyMaxHp(old, template);
    const character = {
      ...makeCharacter(template), ...(old || {}),
      id: template.id, name: template.name, gender: template.gender, role: template.role,
      face: template.face, art: template.art, avatar: template.avatar, skill: template.skill,
      skills: template.skills, combatRoles: template.combatRoles,
      evaluation: template.evaluation, unlockCost: template.unlockCost,
    };
    const oldLevel = character.level;
    character.level = cleanLevel(character.level);
    character.exp = migrateProgression
      ? 0 : window.CharacterProgression.cleanExp(character.exp, character.level);
    const hadSpent = !!old?.spent && Object.keys(old.spent).length > 0;
    applyProgression(character, template);
    const hpRatio = Number.isFinite(oldHp)
      ? Math.max(0, Math.min(1, oldHp / oldMaxHp)) : 1;
    character.hp = !Number.isFinite(oldHp)
      ? character.stats.maxHp
      : oldHp <= 0
        ? 0
        : Math.max(1, Math.min(character.stats.maxHp, Math.round(
          migrateProgression || migrateGrowth
            ? character.stats.maxHp * hpRatio : oldHp)));
    character.progressionRepaired = character.level !== oldLevel
      || migrateProgression || migrateGrowth || hadSpent || old?.exp !== character.exp;
    delete character.weak;
    character.stats.bloodlust = Math.min(99, Math.max(1, character.stats.bloodlust || 1));
    character.stats.drawPerTurn = Math.max(
      template.stats?.drawPerTurn ?? 0,
      character.stats.drawPerTurn || 0,
    );
    return character;
  }

  function migrateDeck(state, oldCharacters) {
    const before = JSON.stringify({ deck: state.deck, deckVersion: state.deckVersion });
    const currentDeck = Array.isArray(state.deck) && state.deck.length ? state.deck : [];
    const legacyDeck = oldCharacters.find(character =>
      Array.isArray(character.deck) && character.deck.length)?.deck || [];
    const oldDeck = currentDeck.length ? currentDeck : legacyDeck;
    if (state.deckVersion !== GameData.deckVersion) {
      state.deck = mergeDeckWithBase(oldDeck);
      state.deckVersion = GameData.deckVersion;
    } else {
      state.deck = oldDeck.length
        ? oldDeck.map(repairCard).filter(Boolean)
        : GameData.baseDeck.map(card => ({ ...card }));
    }
    return before !== JSON.stringify({ deck: state.deck, deckVersion: state.deckVersion });
  }

  function migrateBondiShopUnlock(state) {
    if ((state.flags.bondiShopUnlockVersion || 0) >= 2) return;
    state.unlockedShopCards = [...new Set([
      ...state.unlockedShopCards,
      ...(GameData.initialShopCardNames || []),
    ])];
    state.flags.bondiShopUnlockVersion = 2;
    Object.defineProperty(state, "_needsSaveAfterMigration", {
      value: true, configurable: true,
    });
  }

  function mergeDeckWithBase(oldDeck) {
    const base = GameData.baseDeck.map(card => ({ ...card }));
    const counts = base.reduce((map, card) => {
      const key = cardKey(card);
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const extra = (oldDeck || []).filter(card => {
      const key = cardKey(card);
      if (counts[key] > 0) {
        counts[key] -= 1;
        return false;
      }
      return true;
    }).map(repairCard).filter(Boolean);
    return [...base, ...extra];
  }

  function syncCardTexts(state) {
    const texts = new Map((GameData.cardCodex || []).map(card => [card.name, card.text]));
    (state.deck || []).forEach(card => {
      if (texts.has(card.name)) card.text = texts.get(card.name);
    });
  }

  return {
    cleanResource, migrateCharacter, migrateDeck, migrateBondiShopUnlock, syncCardTexts,
  };
})();
