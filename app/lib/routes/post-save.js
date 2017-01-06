const { readdir, readFileSync: read, writeFileSync: write } = require('fs');

const {
  normalize,
} = require('../utils/string');

const {
  httpError,
} = require('../middlewares/error-handler');

exports = module.exports = () => {
  function postSave(body) {
    const { table, key, value } = body;
    if (!table || !key || !value) throw httpError(400, 'missing parameters');

    const file = `./data/${normalize(table)}.json`;

    let content;
    try {
      content = JSON.parse(read(file));
    } catch (e) {
      content = {};
    }

    content[key] = value;

    write(file, JSON.stringify(content));

    return 'ok';
  }

  return postSave;
};
