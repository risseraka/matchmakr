const { normalize } = require('./string');
const { stringify, arrayify } = require('./object');
const { index } = require('./mapIndex');

exports = module.exports = {
  Search(haystack, exclude = []) {
    if (!haystack.index) {
      haystack.index = index(haystack, 'id', true);
    }

    const stringed = haystack.map(p => normalize(stringify(p, exclude).join(' ')));

    const search = needle => {
      needle = arrayify(needle).map(normalize);
      return stringed
        .filter(e => needle.every(n => e.includes(n))).map(e => e.split(' ')[0])
        .map(id => haystack.index[id]);
    };
    search.stringed = stringed;
    return search;
  },
};
