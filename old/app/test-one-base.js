const { readdir, writeFileSync: write } = require('fs');

const {
  index,
} = require('./lib/utils/map-index');

const {
  mapObjectToArray,
  filterObjectToArray,
} = require('./lib/utils/object');

const {
  deepGet,
} = require('./lib/utils/deep-get');

const jsonpatch = require('fast-json-patch');

readdir('profiles', (err, dbs) => {
  const bases = dbs
          .filter(file => file.match('json'))
          .map(name => {
            const profiles = require(`./profiles/${name}`);

            name = name.split('.')[0].split('_')[1];
            if (name === 'bob') name = 'laura';

            profiles.forEach(profile => profile.contact = name);
            return profiles;
          });
  console.log(bases.length);

  const all = [].concat(...bases);
  console.log(all.length);

  const indexed = index(all, 'id');

  console.log(Object.keys(indexed).length);

  const dupplicates = filterObjectToArray(indexed, values => values.length > 1);

  const filtered = dupplicates
          .map(profiles => ({
            contacts: index(profiles, 'contact', true),
            id: profiles[0].id,
            name: profiles[0].name,
          }))
          .sort((a, b) => b.contacts.length - a.contacts.length)
          .reverse();

  const loup = mapObjectToArray(filtered[1].contacts);
  console.log(loup.map(e => e.skills[0]));
  const patches = jsonpatch.compare(...loup);
  console.log(patches);
  return;

  console.log(filtered.length);

  console.log(filtered.map(profile => `${profile.contacts.length} contacts: [ ${profile.contacts.join(' | ')} ]${[...new Array(4 - profile.contacts.length + 1)].map(e => '\t').join('')}${profile.name}`).sort().join('\n'));

  write('common.json', JSON.stringify(filtered));

  console.log(mapObjectToArray(indexed).slice(0, 1));
});
