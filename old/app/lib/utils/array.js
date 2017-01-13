const { compose, curry, applyTo } = require('./function');
const { toNumber, opposite } = require('./math');

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

  applyReduceTo: curry(applyTo)('reduce'),
  applySortTo: curry(applyTo)('sort'),
  applyFilterTo: curry(applyTo)('filter'),

  mapToObject(arr, func) {
    return arr.reduce((r, key) => (r[key] = func(key), r), {});
  },

  sortWith(func, reverse = false) {
    return exports.applySortTo(reverse ? compose(func, opposite) : func);
  },

  sortByField(field, func, reverse = false) {
    return exports.sortWith((a, b) => func(a[field], b[field]), reverse);
  },

  filterBy(field, func) {
    return exports.applyFilterTo(e => func(e[field]));
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

  compareByField(field, compare) {
    return (a, b) => compare(a[field], b[field]);
  },
};
