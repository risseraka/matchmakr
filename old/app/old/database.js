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
    const collections = {};

    let data = input || {};

    const table = {
      get(key, subKey) {
        if (key !== undefined) {
          if (collections[key]) {
            if (subKey !== undefined) {
              return collections[key].get(subKey);
            }
            return collections[key];
          }
          return data[key];
        }

        if (key != undefined) {
          if (subKey !== undefined) {
            return data[key][subKey];
          }
          return data[key];
        }

        return Object.keys(collections).reduce((r, key) => {
          r[data] = collections[key].get();
          return data;
        }, data);
      },
      put(key, value, subKey) {
        if (value === undefined) {
          value = key;
          key = undefined;
        }

        if (key !== undefined) {
          return table.putCollection(key, value, subKey);
        }

        data = value;
        return table;
      },
      post(key, value, subKey) {
        if (value === undefined) {
          value = key;
          key = undefined;
        }

        if (key !== undefined) {
          return table.postCollection(key, value, subKey);
        }

        if (!Array.isArray(data)) {
          data = [data];
        }
        data = data.concat(value);
        return table;
      },
      patch(obj) {
        const patches = jsonpatch.compare(data, obj);
        jsonpatch.apply(data, patches);
        return patches;
        return table;
      },
      delete() {
        data = {};
        return table;
      },

      putCollection(key, value, subKey) {
        let sub = collections[key];
        if (!sub) {
          sub = collections[key] = createTable(data && data[key], key);
        }

        if (subKey !== undefined) {
          sub.put(subKey, value);
        } else {
          sub.put(value);
        }

        data[key] = sub.get();
        return table;
      },

      postCollection(key, value, subKey) {
        let sub = collections[key];
        if (!sub) {
          sub = collections[key] = createTable(data && data[key], key);
        }

        if (subKey !== undefined) {
          sub.post(subKey, value);
        } else if (data[key]) {
          sub.post(value);
        } else {
          sub.put(value);
        }

        data[key] = sub.get();
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
