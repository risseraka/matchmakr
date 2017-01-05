exports = module.exports = {
  get(obj, field) {
    return obj[field];
  },

  forEachObject(obj, func) {
    if (!obj) return obj;

    return Object.keys(obj).forEach(key => func(obj[key], key));
  },

  reduceObject(obj, func, acc) {
    if (!obj) return acc;

    return Object.keys(obj).reduce((r, key, i, keys) => {
      return func(r, obj[key], key, keys);
    }, acc);
  },

  mapObject(obj, func) {
    if (!obj) return [];

    return Object.keys(obj).map(key => func(obj[key], key));
  },

  pluck(obj, ...fields) {
    if (!obj) return {};

    return fields.reduce((r, f) => (obj[f] && (r[f] = obj[f]), r), {});
  },

  arrayify(obj) {
    if (Array.isArray(obj)) return obj;

    return [obj];
  },

  pushIn(obj, field, values, unique = false, merge = false) {
    if (unique) {
      obj[field] = values;
      return;
    }

    if (merge) {
      if (!obj[field]) {
        obj[field] = values;
      } else {
        if (Array.isArray(values)) {
          Array.prototype.push.apply(obj[field], values);
        } else if (typeof values === 'object') {
          obj[field] = Object.assign(obj[field], values);
        } else {
          obj[field].push(values);
        }
      }
    } else {
      if (!obj[field]) {
        obj[field] = [];
      }
      obj[field].push(values);
    }
  },

  stringify(obj, exclude = []) {
    if (typeof obj !== 'object') return obj ? obj.toString() : '';
    return exports.mapObject(obj, (v, k) => !exclude.includes(k) ? exports.stringify(v): '');
  },
};
