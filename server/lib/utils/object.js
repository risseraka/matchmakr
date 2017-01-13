exports = module.exports = {
  get(obj, field) {
    return obj[field];
  },

  getFrom(obj) {
    return field => obj[field];
  },

  forEachObject(obj, func) {
    if (!obj) return undefined;

    return Object.keys(obj).forEach(key => func(obj[key], key));
  },

  reduceObject(obj, func, acc) {
    if (!obj) return acc;

    return Object.keys(obj).reduce((r, key, i, keys) => func(r, obj[key], key, obj), acc);
  },

  mapObject(obj, func = e => e) {
    if (!obj) return {};

    return exports.reduceObject(obj, (r, value, key, obj) => (r[key] = func(value, key, obj), r), {});
  },

  mapObjectToArray(obj, func = e => e) {
    if (!obj) return [];

    return exports.reduceObject(obj, (r, value, key, obj) => (r.push(func(value, key, obj)), r), []);
  },

  filterObject(obj, func) {
    return exports.reduceObject(obj, (r, value, key, obj) => (func(value, key, obj) && (r[key] = value), r), {});
  },

  filterObjectToArray(obj, func) {
    return exports.reduceObject(obj, (r, value, key, obj) => (func(value, key, obj) && r.push(value), r), []);
  },

  pluck(obj, ...fields) {
    if (!obj) return {};

    return fields.reduce((r, f) => (obj[f] && (r[f] = obj[f]), r), {});
  },

  arrayify(obj) {
    if (obj === undefined || obj === null) return [];

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

  stringify(obj, formatter = e => e, exclude = [], key = '') {
    if (typeof obj !== 'object') {
      if (!obj) return '';
      const value = formatter(obj, key);
      if (!value) return '';
      return `${key}:${value.toString()}`;
    }

    const isArray = Array.isArray(obj);

    return exports.reduceObject(
      obj,
      (r, v, k) => {
        if (!exclude.includes(k)) {
          if (key) {
            k = (isArray ? key : key + '.' + k);
          }
          r.push(exports.stringify(v, formatter, exclude, k));
        }
        return r;
      },
      []
    ).filter(e => e).join('\n');
  },
};
