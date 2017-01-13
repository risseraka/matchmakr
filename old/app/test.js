const db = require('./lib/database')();
const util = require('util');

const inspect = o => util.inspect(o, { depth: null });

const table = db.table({ name: 'test' });

//table.write({});

console.log('table:', table.get());

table
  .put({ name: 'test', chiens: 'nougat' })
  .post('toto', { name: 'toto', objs: [1] })
  .post({ sub: true });

console.log('table:', table.get());


//process.exit(1);

table
  .post('canards', 'loulou', 'loulou')
  .post('canards', ['riri', { name: 'loulou' }])

  .patch({ name: 'test2' });

const toto = table.get('toto')
        .put({ name: 'toto2', objs: [1] })
        .post('objs', 2);

table.post('toto', { name: 'tata' });

const canards = table.get('canards')
        .post('donald');

console.log('loulou:', canards.get('loulou').get());

table.post('chiens', 'polux');

console.log('table:', inspect(table.get()));

table.save();
