const { readFileSync: read, writeFileSync: write } = require('fs');

const {
  normalize,
} = require('./utils/string');

const {
  arrayify,
} = require('./utils/object');

const {
  httpError,
} = require('./utils/error');

const jsonpatch = require('fast-json-patch');

function getFilePath(file) {
  return `./data/${normalize(file)}.json`;
}

function loadTable(name) {
  if (!name) {
    throw httpError(400, 'missing parameter');
  }

  const filePath = getFilePath(name);

  const createTable = (input, key) => {
    let data = input || {};

    const table = {
      get(key, subKey) {
        if (key !== undefined) return data[key];

        if (Array.isArray(data)) return data;
        if (typeof data === 'object') return Object.keys(data).map(k => data[k]);
        return data;
      },

      put(key, value, subKey) {
        data[key] = value;
        return table;
      },

      post(key, value, subKey) {
        data[key] = (data[key] || []).concat(value);
        return table;
      },

      patch(key, obj) {
        if (obj === undefined) {
          obj = key;
          key = undefined;
        }
        if (key !== undefined) {
          obj = { [key]: obj };
        }

        const patches = jsonpatch.compare(data, obj);
        jsonpatch.apply(data, patches);
        return table;
      },
      delete(key) {
        if (key !== undefined) {
          delete data[key];
        } else {
          data = {};
        }
        return table;
      },

      save() {
        try {
          write(filePath, JSON.stringify(data));
        } catch (e) {
          throw e;
        }

        return table;
      },
      load() {
        let content;

        try {
          content = read(filePath);
        } catch (e) {
          console.warn(`Table ${name}: ${e.message}`);
          data = {};
          table.save();
          return table;
        }

        try {
          data = JSON.parse(content);
        } catch (e) {
          throw e;
        }

        return table;
      },
    };
    return table;
  };

  return createTable().load();
}

exports = module.exports = () => ({
  table({ name }) {
    return loadTable(name);
  },

  set({ table: name, key, value }) {
    if (!name || !key || !value) throw httpError(400, 'missing parameters');

    return loadTable(name)
            .put(key, value)
            .save();
  },

  append({ table: name, key, value }) {
    if (!name || !key || !value) throw httpError(400, 'missing parameters');

    return loadTable(name)
            .post(key, value)
            .save();
  },
});
