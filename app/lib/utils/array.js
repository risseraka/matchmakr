const { composeArrayArgs, mapArgs } = require('./function');
const { toNumber } = require('./math');

exports = module.exports = {
  unique(arr) {
    if (!arr || !arr.length) return [];
    return [...new Set(arr)];
  },

  intersection(arr1, arr2) {
    if (!arr1.length || !arr2.length) return [];
    return arr1.filter(e => arr2.includes(e));
  },

  intersects(arr1, arr2) {
    if (!arr1.length || !arr2.length) return false;
    return arr1.some(e => arr2.includes(e));
  },

  union(...args) {
    if (!args.length) return [];
    return [].concat(...args);
  },

  flatten(arr) {
    return exports.union(...arr);
  },

  flatMap(arr, func) {
    return exports.flatten(arr.map(func));
  },

  sortWith(func, reverse = false) {
    const coef = reverse ? -1 : 1;
    return arr => arr.sort((a, b) => func(a, b) * coef);
  },

  sortBy(field, func, reverse = false) {
    const getField = typeof field === 'function' ? field : e => e[field];

    return exports.sortWith(composeArrayArgs(mapArgs(getField), func), reverse);
  },

  filterWith(func) {
    return arr => arr.filter(func);
  },

  mapWith(func) {
    return arr => arr.map(func);
  },

  filterBy(field, func) {
    return exports.filterWith(e => func(e[field]));
  },

  compareStrings(a, b) {
    return a === b ? 0 : (a < b ? -1 : 1);
  },

  compareInts(a, b) {
    return toNumber(a) - toNumber(b);
  },

  compareDates(a, b) {
    return b[0] !== a[0] ? b[0] - a[0] : (a[1] || b[1]);
  },
};
