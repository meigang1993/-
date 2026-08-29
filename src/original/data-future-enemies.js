window.GameDataFutureEnemies = {
  orc_dungeon: [
    ...(window.GameDataFutureOrcEnemies || []),
    ...(window.GameDataBakarEnemy ? [window.GameDataBakarEnemy] : []),
  ],
  ruins_sand_city: window.GameDataRuinsSandCityEnemies || [],
};
