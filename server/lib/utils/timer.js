exports = module.exports = function timer(inLabel) {
  inLabel = `${inLabel || 'time'}`;

  let label;

  const timer = {
    buildLabel(newLabel) {
      return label = newLabel && `${inLabel}:${newLabel}` || inLabel;
    },
    start(newLabel) {
      label = timer.buildLabel(newLabel);

      console.time(label);

      return timer;
    },
    check(newLabel) {
      console.timeEnd(label);

      label = timer.buildLabel(newLabel);

      console.time(label);

      return timer;
    },
  };
  return timer;
};
