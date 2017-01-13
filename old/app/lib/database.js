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

function loadBase(name) {
  if (!name) {
    throw httpError(400, 'missing parameter');
  }

  const filePath = getFilePath(name);

  const createBase = (input, key) => {
    let data = input || {};

    const base = {
      get(key, id) {
        if (key !== undefined) return data[key];

        if (Array.isArray(data)) return data;
        if (typeof data === 'object') return Object.keys(data).map(k => data[k]);
        return data;
      },

      put(key, value, id) {
        data[key] = value;
        return base;
      },

      post(key, value, id) {
        if (value === undefined) {
          value = key;
          key = undefined;
        }

        if (id !== undefined) {
          if (data[key] === undefined) {
            data[key] = {};
          }
          data[key][id] = (data[key][id] || []).concat(value);
          return base;
        }

        data[key] = (data[key] || []).concat(value);
        return base;
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
        return base;
      },
      delete(key) {
        if (key !== undefined) {
          delete data[key];
        } else {
          data = {};
        }
        return base;
      },

      save() {
        try {
          write(filePath, JSON.stringify(data));
        } catch (e) {
          throw e;
        }

        return base;
      },
      load() {
        let content;

        try {
          content = read(filePath);
        } catch (e) {
          console.warn(`Base ${name}: ${e.message}`);
          data = {};
          base.save();
          return base;
        }

        try {
          data = JSON.parse(content);
        } catch (e) {
          throw e;
        }

        return base;
      },
    };
    return base;
  };

  return createBase().load();
}

exports = module.exports = () => ({
  base({ name }) {
    return loadBase(name);
  },

  set({ base: name, key, value }) {
    if (!name || !key || !value) throw httpError(400, 'missing parameters');

    return loadBase(name)
            .put(key, value)
            .save();
  },

  append({ base: name, key, value }) {
    if (!name || !key || !value) throw httpError(400, 'missing parameters');

    return loadBase(name)
            .post(key, value)
            .save();
  },
});
