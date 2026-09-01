window.HoshinoKaiichiShare = ({ alive, allUnits }) => {
  const queue = window.HoshinoKaiichiShareQueue({ alive, allUnits });
  return {
    queueShare: queue.queueShare,
    scheduleBloodCaption: queue.scheduleBloodCaption,
    activateShare: queue.activateShare,
    shareVisible: queue.shareVisible,
    ...window.HoshinoKaiichiShareResolution({ alive, allUnits, queue }),
  };
};
