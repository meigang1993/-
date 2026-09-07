window.RelicUI = {
  picker: (...args) => window.RelicUIPicker.picker(...args),
  bind: (...args) => window.RelicUIBindings.bind(...args),
  closeCodex: (...args) => window.RelicUICodexInteractions.close(...args),
  handleKeydown: (...args) =>
    window.RelicUICodexInteractions.handleKeydown(...args),
};
