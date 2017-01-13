const db = require('./lib/database')();
const util = require('util');

const inspect = o => util.inspect(o, { depth: null });

const profiles = require('./profiles/3_bob.json');

const table = db.table({ name: 'profiles' }).put({});

console.time('import');

profiles
  .forEach(profile => {
    table.put(profile, 'profiles', profile.id);
  });

table.save();

console.timeEnd('import');
