window.UnderwaterTrainTargetSkills = ({
  black, isSlash, singleSlash, stat, consumeStatusByCharm,
}) => {
  const counters = window.UnderwaterTrainTargetCounters({ stat });
  return window.UnderwaterTrainTargetActions({
    black, isSlash, singleSlash, consumeStatusByCharm, counters,
  });
};
