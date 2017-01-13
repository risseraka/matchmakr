const { flatMap } = require('./array');

exports = module.exports = {
  deepGetRec(obj, fields, flat) {
    if (!obj || !fields) return obj;

    if (typeof fields === 'string') {
      if (!Array.isArray(obj) && fields.indexOf('.') === -1) {
        return obj[fields];
      }

      fields = fields.split('.');
    }

    for (let i = 0, j = fields.length; i < j; i += 1) {
      if (!obj) return null;
      if (Array.isArray(obj) && !(fields[i] in obj)) {
        return flat ?
          flatMap(obj, (o => exports.deepGetRec(o, fields.slice(i)))) :
          obj.map(o => exports.deepGetRec(o, fields.slice(i)));
      }
      try {
        obj = obj[fields[i]];
      } catch(e) {
        console.log(obj, fields);
        throw e;
      }
    }

    return obj;
  },

  deepGet(obj, field, up = false) {
    if (!obj || !field) return undefined;

    if (Array.isArray(obj)) {
      return obj.map(o => exports.deepGet(o, field, up));
    }

    if (field.indexOf('.') === -1) {
      const value = obj[field];
      return up ? { obj, value } : value;
    }

    const [part, ...rest] = field.split('.');
    return exports.deepGet(obj[part], rest, up);
  },
};
