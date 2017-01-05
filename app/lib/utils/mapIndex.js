const { normalize } = require('./string');
const { pushIn, arrayify, mapObject, reduceObject } = require('./object');
const { getDeep } = require('./getDeep');

exports = module.exports = {
  indexObject(obj, format = (k, v) => k) {
    return reduceObject(obj, (r, value, key) => arrayify(value).reduce((r, value) => {
      pushIn(r, value, format(key, value));
      return r;
    }, r), {});
  },

  index(arr, field, unique, format = e => e) {
    if (!arr || !arr.length) return {};

    const formatItem = typeof format === 'function' ? format : e => getDeep(e, format);

    const getKey = field ?
            e => (typeof field === 'function' ? field(e) : getDeep(e, field)) :
          e => e;

    return arr.reduce((r, e) => {
      const key = getKey(e);

      return [...[].concat(key)].reduce((r, key) => {
        if (typeof key === 'string') key = normalize(key);
        pushIn(r, key, formatItem(e), unique);
        return r;
      }, r);
    }, {});
  },

  mapFieldObject(obj, formatItems = e => e) {
    const itemsFormatter = typeof formatItems === 'function' ?
            formatItems :
            (!formatItems ? e => e : items => getDeep(items, formatItems));

    return mapObject(obj, (items, name) => {
      const formatted = itemsFormatter(items, name);

      return {
        name,
        count: formatted.length,
        items: formatted,
      };
    });
  },

  mapField(profiles, field, formatItems = e => e) {
    if (!profiles || !profiles.length) return [];

    const fieldIndex = exports.index(profiles, field, false);

    const map = exports.mapFieldObject(fieldIndex, (items, name) => {
      const formatted = formatItems(items, name);

      // Overwrite index items by formatted ones
      fieldIndex[name] = formatted;

      return formatted;
    });
    map.index = fieldIndex;
    return map;
  },
};
