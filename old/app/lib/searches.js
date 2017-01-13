const { readFileSync: read } = require('fs');

const {
  reduceObject,
  mapObjectToArray,
} = require('./utils/object');

exports = module.exports = function getSearches({ links = false } = {}) {
  const file = `./data/search.json`;

  let content;
  try {
    content = JSON.parse(read(file));
  } catch (e) {
    content = {};
  }

  return mapObjectToArray(content, (value, key) => {
    value = JSON.parse(value);

    value.query = JSON.parse(decodeURIComponent(value.query));
    if (links) {
      value.query = reduceObject(
        value.query,
        (r, values, field) => {
          if (field !== 'q') {
            values = values.map(name => ({
              name,
              href: `/${field}/${encodeURIComponent(name)}`,
            }));
          }
          r[field] = values;
          return r;
        },
        {}
      );
    }

    return {
      key,
      value,
      href: `/savedSearches/${key}`,
    };
  });
};
