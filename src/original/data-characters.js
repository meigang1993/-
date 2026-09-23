window.GameDataCharacters = [
  ...window.GameDataCharactersCore,
  ...window.GameDataCharactersExtra,
  ...(window.GameDataFutureCharacters || []),
  ...(window.GameDataNewCharacters || []),
];
