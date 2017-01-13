const db = require('./lib/database')();
const util = require('util');

const jsonpatch = require('fast-json-patch');

const inspect = o => util.inspect(o, { depth: null });

const profiles = require('./profiles/3_bob.json');

const table = db.table({ name: 'profile' });

console.time('import');

const profile = profiles[0];

let patches = [];

for (let i = 0; i < 11; i += 1) {
  profile.available = !profile.available;

  let temp = table.patch(profile);

  console.log('temp:', temp);

  patches = patches.concat(temp);
}

console.log('patches\n', patches);

const result = {};
jsonpatch.apply(result, patches);

console.log('result\n', result);

const compacted = jsonpatch.compare({}, result);

console.log('compacted\n', compacted);

table.save();

console.timeEnd('import');
