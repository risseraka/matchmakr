const { mapObjectToArray } = require('../utils/object');

exports = module.exports = {
  stringifyToHTML(obj) {
    if (typeof obj !== 'object') {
      return obj !== undefined && obj !== null ? obj.toString() : '';
    }

    const mapped = mapObjectToArray(
      obj,
      (v, k) => {
        const length = Array.isArray(v) ? ` (${v.length})`: '';
        const value = k === 'href' ? `<a href="${v}">${v}</a>` : exports.stringifyToHTML(v);
        return `<li>${k}${length}: ${value}</li>`;
      }
    );
    return `<ul>${mapped.join('')}</ul>`;
  },

  callWithReq(field, func) {
    return (req, res) => {
      const result = func(req[field]);

      res.format({
        html: () => res.send(exports.stringifyToHTML(result)),
        default: () => res.send(result),
      });
    };
  },

  callWithReqQuery(func) {
    return exports.callWithReq('query', func);
  },

  callWithReqParams(func) {
    return exports.callWithReq('params', func);
  },

  callWithReqBody(func) {
    return exports.callWithReq('body', func);
  },
};
