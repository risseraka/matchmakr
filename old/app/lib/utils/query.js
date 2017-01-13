const { reduceObject, arrayify, pushIn } = require('./object');
const { flatMap } = require('./array');

exports = module.exports = {
  mergeQueries(target, source) {
    return reduceObject(source, (r, value, field) => {
      if (field == '') {
        r.q = value;
      } else {
        r[field] = (arrayify(r[field])).concat(value);
      }
      return r;
    }, target);
  },
  parseQuery(q) {
    return flatMap(arrayify(q), e => e.trim().split(' '))
      .reduce((r, e) => {
        e = e.split(':');

        const raw = (e[1] || e[0]);
        if (!raw) return r;

        const value = raw.split(',');

        const field = !e[1] ? '' : e[0];

        pushIn(r, field, value, false, true);

        return r;
      }, { '': [] });
  },
};
