exports = module.exports = {
  toNumber(value) {
    return Number.isNaN(+value) ? -1 : +value;
  },

  opposite(a) {
    return a * -1;
  },

  decimal(n, digit) {
    const pow = Math.pow(10, digit);
    return Math.floor(n * pow) / pow;
  },

  percentage(n, precision = 2) {
    return exports.decimal(n * Math.pow(10, precision), precision);
  },

  percentile(arr, value, precision = 10, min = 0.05, minPrecision = 5) {
    if (!arr || !value) return 'N/A';

    const index = arr.indexOf(value);
    const p = index / arr.length;

    return Math.ceil(p * 100 / (p < min ? minPrecision : precision)) * (p < min ? minPrecision : precision) || 1;
  },
};
