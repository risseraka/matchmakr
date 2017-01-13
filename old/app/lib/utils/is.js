exports = module.exports = {
  isInRange(range, value) {
    return value >= range[0] && value <= range[1];
  },
  isIncludedIn(a, b) {
    return b.includes(a);
  },

  isEqual(a, b) {
    return a === b;
  },
};
