const { reduceObject, arrayify, pushIn } = require('./object');
const { flatMap } = require('./array');

exports = module.exports = {
  mergeQueries(target, query) {
    return reduceObject(query, (r, value, field) => {
      if (field == '') {
        r.q = value;
      } else {
        r[field] = (value || []).concat(r[field] || []);
      }
      return r;
    }, target);
  },
  parseQuery(q) {
    return flatMap(arrayify(q), e => e.trim().split(' '))
      .reduce((r, e) => {
        e = e.split(':');

        const value = (e[1] || e[0]).split(',');
        const field = !e[1] ? '' : e[0];

        pushIn(r, field, value, false, true);

        return r;
      }, { '': [] });
  },
};
