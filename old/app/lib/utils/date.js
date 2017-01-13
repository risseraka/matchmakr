const { decimal } = require('./math');

exports = module.exports = {
  DAY: 24 * 60 * 60 * 1000,
  YEAR: 365.25 * 24 * 60 * 60 * 1000,

  diffDateFromNow(date) {
    return Date.now() - new Date(date || Date.now());
  },

  diffDates(a, b) {
    return new Date(b || Date.now()) - new Date(a || Date.now());
  },

  toYear(date) {
    return decimal(new Date(date + exports.DAY) / exports.YEAR, 1);
  },
};
