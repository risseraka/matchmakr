const { normalize } = require('./string');
const { stringify, arrayify, mapObjectToArray } = require('./object');
const { unique, flatMap } = require('./array');
const { index } = require('./map-index');

exports = module.exports = {
  Search(haystack, exclude = []) {
    if (!haystack.index) {
      haystack.index = index(haystack, 'id', true);
    }

    const stringed = haystack.map(p => p.id + '\n' + stringify(p, e => e, exclude));

    const search = needles => {
      const needlesRegEx = arrayify(needles).map(normalize).map(n => new RegExp(`.*:.*${n}.*`, 'gi'));

      return stringed.reduce((r, e) => {
        const matches = needlesRegEx.map((needleRegEx, i) => {
          const match = normalize(e).match(needleRegEx);

          const needle = needles[i];
          if (!match) return { needle, values: [] };

          const values = match.map(match => {
            const [key, value] = match.split(':');
            if (key === 'id') return '';
            return { key, value, needle };
          });

          return { needle, values };
        });

        const realMatches = matches.filter(e => e.values && e.values.length);
        if (!realMatches.length) return r;

        const id = e.match(/^([0-9]+)/)[1];
        const item = haystack.index[id];

        item.matches.q = matches.reduce((r, { needle, values }) => {
          values = unique(values.map(e => e.key));
          if (!values.length) return r;
          r.push({ needle, count: values.length, values });
          return r;
        }, []);

        item.scores.q = [realMatches.length].concat(...matches.map(e => {
          if (!e.values.length) return [0, 0, 0];
          return e.values.reduce((r, e) => {
            if (e.needle === e.value) {
              r[0] += 1;
            } else if (e.value.match(new RegExp(`\\b${e.needle}\\b`))) {
              r[1] += 1;
            } else {
              r[2] += 1;
            }
            return r;
          }, [0, 0, 0]);
        }));

        r.push(item);
        return r;
      }, []);
    };
    search.stringed = stringed;
    return search;
  },
};
