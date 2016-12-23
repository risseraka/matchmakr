'use strict';

console.time('started in');

const liveReload = `<script type="text/javascript">
function checkReload(etag) {
  fetch(new Request('/livereload')).catch(() => window.location.reload());
}
checkReload();
</script>`;

function memoize(func) {
  return func;
  const memo = {};
  return (...args) => {
    if (memo[args]) return memo[args];
    return memo[args] = func.apply(this, args);
  };
}

// http://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
function normalizeW(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
const normalize = memoize(normalizeW);

function get(obj, fields) {
  if (!obj || !fields) return obj;

  if (typeof fields === 'string') fields = fields.split('.');

  for (let i = 0, j = fields.length; i < j; i += 1) {
    if (Array.isArray(obj) && !(fields[i] in obj)) {
      return obj.map(o => get(o, fields.slice(i)));
    }
    obj = obj[fields[i]];
  }

  return obj;
}

function uniqueW(arr) {
  if (!arr) return [];
  return [...new Set(arr)];
}

const unique = memoize(uniqueW);

function closure(...args) {
  const func = args.pop();
  return func(...args);
}

function intersection(arr1, arr2) {
  return arr1.filter(e => arr2.includes(e));
}

function intersects(arr1, arr2) {
  return arr1.some(e => arr2.includes(e));
}

function union(...args) {
  return [].concat(...args);
}

function arrayify(obj) {
  return [].concat(obj);
}

function compareStrings(a, b) {
  return a === b ? 0 : (a < b ? 1 : -1);
}

function compareInts(a, b) {
  return (a | 0) - (b | 0);
}

function sortBy(field, reverse) {
  return arr => arr.sort((a, b) => (a[field] - b[field]) * (reverse ? -1 : 1));
}

function sortWith(arr, func, reverse) {
  return arr.sort((a, b) => (func(a) - func(b)) * (reverse ? -1 : 1));
}

function filterBy(field, func) {
  return arr => arr.filter(e => func(e[field]));
}

function flatMap(arr, func) {
  return [...arr.map(func)];
}

function index(arr, field, unique, format) {
  const formatItems = typeof format !== 'function' ? e => get(e, format) : format;

  return arr.reduce((r, e) => {
    const key = !field ?
            e :
            (typeof field === 'function' ? field(e) : get(e, field));

    return [...[].concat(key)]
      .reduce((r, key) => {
        if (typeof key === 'string') key = normalize(key);
        e = formatItems(e);
        r[key] = unique ? e : (r[key] || []).concat(e);
        return r;
      }, r);
  }, {});
}

function mapField(profiles, field, formatItems = e => e) {
  const fieldIndex = index(profiles, field, false);

  const map = Object.keys(fieldIndex).map(name => closure(
    fieldIndex[name],
    items => ({
      name,
      items: typeof formatItems === 'function' ?
        formatItems(items) :
        get(items, formatItems),
      count: items.length,
    })
  ));
  map.index = fieldIndex;
  return map;
}

function stringifyToHTML(obj) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return `<ul>${Object.keys(obj).map(k => `<li>${k}${Array.isArray(obj[k]) ? ` (${obj[k].length})`: ''}: ${stringifyToHTML(obj[k])}</li>`).join('')}</ul>`;
}

function stringify(obj, exclude = []) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return Object.keys(obj).map(k => !exclude.includes(k) ? stringify(obj[k]): '');
}

function Search(haystack, exclude = []) {
  const stringed = haystack.map(p => normalize(stringify(p, exclude).join(' ')));

  const search = (needle) => {
    needle = arrayify(needle).map(normalize);
    return stringed.filter(e => needle.every(n => e.includes(n))).map(e => e.split(' ')[0]);
  };
  search.stringed = stringed;
  return search;
}

const sortByCountDesc = sortBy('count', true);
const filterByCountOne = filterBy('count', e => e > 1);

const filterAndSortByCountOne = arr => filterByCountOne(sortByCountDesc(arr));

const express = require('express');
const morgan = require('morgan');

const profiles = require('./profiles/all.json').sort((a, b) => {
  a = normalize(a.name);
  b = normalize(b.name);
  return a > b ? 1 : (a < b ? -1 : 0);
});
profiles.forEach(p => {
  p.skills.sort((a, b) => (b.endorsementCount || 0) - (a.endorsementCount || 0));
  p.positions.sort((a, b) => {
    return b.startDate !== a.startDate ? b.startDate - a.startDate : (a.endDate || b.endDate);
  });
});

profiles.index = index(profiles, 'id', true);

function filterProfiles(profiles, field, value) {
  const values = arrayify(value).map(normalize);

  return profiles.filter(
    p => values.filter(
      v => get(p, field).some(s => normalize(s) === v)
    ).length === values.length
  );
}

const search = Search(profiles, ['profileUrl']);

const skills = mapField(profiles, 'skills.name');
const positions = mapField(profiles, 'positions.companyName');
const titles = mapField(profiles, 'positions.title');

const indices = {
  profiles: profiles.index,
  'name': index(profiles, 'name'),
  'skills.name': skills.index,
  'positions.companyName': positions.index,
  'positions.title': titles.index,
};

const endorsers = index(profiles.reduce(
  (r, p) => p.skills.reduce(
    (r, s) => s.endorsers.reduce(
      (r, endorser) => (r.push({
        id: p.id,
        name: s.name,
        endorser,
      }), r), r
    ), r
  ), []
), 'endorser');

const endorsees = index(profiles.reduce(
  (r, p) => p.skills.reduce(
    (r, s) => s.endorsers.reduce(
      (r, endorser) => (r.push({
        id: endorser,
        name: s.name,
        endorsee: p.id,
      }), r), r
    ), r
  ), []
), 'endorsee');

const app = express();

app.use(morgan('dev'));

app.use((req, res, next) => {
  const send = res.send;
  //  res.send = str => send.call(res, liveReload + (str || ''));
  next();
});

app.memo = {};
function sendCache(req, res, next) {
  const resSend = res.send.bind(res);

  if (app.memo[req.url]) {
    return resSend(app.memo[req.url]);
  }

  res.send = result => {
    app.memo[req.url] = result;
    resSend(result);
  };

  next();
}
app.use(sendCache);

app.get('/search', (req,res) => res.send(search.stringed));

app.get('/livereload', () => {});

app.get('/', (req, res) => {
  res.send(`
total <a href="/profiles">profiles</a>: ${profiles.length}<br/>
total <a href="/skills.name">skills</a>: ${skills.length}</br/>
total <a href="/positions.companyName">companies</a>: ${positions.length}</br/>
total <a href="/positions.title">titles</a>: ${titles.length}</br/>
`);
});

const format = {
  profile: p => `<a href="/profiles/${p.id}">${p.name}</a>`,
  skill: c => s => `<a href="/skills.name/${encodeURIComponent(s.name)}">${s.name}</a>: ${s.count} ${c ? `(${Math.round(s.count * 100 / c * 100) / 100}%)` : ''}`,
  company: c => s => `<a href="/positions.companyName/${encodeURIComponent(s.name)}">${s.name}</a>: ${s.count} ${c ? `(${Math.round(s.count * 100 / c * 100) / 100}%)` : ''}`,
  title: c => s => `<a href="/positions.title/${encodeURIComponent(s.name)}">${s.name}</a>: ${s.count} ${c ? `(${Math.round(s.count * 100 / c * 100) / 100}%)` : ''}`,
};

function mergeQueries(req, query) {
  return Object.keys(query).reduce((r, field) => {
    if (field == '') {
      r.q = query[field];
    } else {
      r[field] = (query[field] || []).concat(r[field] || []);
    }
    return r;
  }, req.query);
}

function parseQuery(q) {
  return q.trim().split(' ').reduce((r, e) => {
    e = e.split(':');

    const value = (e[1] || e[0]).split(',');
    const field = !e[1] ? '' : e[0];

    r[field] = (r[field] || []).concat(value);
    return r;
  }, { '': [] });
}

app.get('/profiles', (req, res) => {
  let results = profiles;
  results.forEach(p => delete p.filtered);

  if (req.query.q) {
    req.query = mergeQueries(req, parseQuery(req.query.q));

    const q = req.query.q.map(normalize);
    results = search(q).map(i => indices.profiles[i]);
  }

  if (req.query.name) {
    const name = normalize(req.query.name);
    results = results.filter(p => normalize(p.name).includes(name));
  }

  if (req.query['skills.name']) {
    req.query['skills.name'] = flatMap(
      arrayify(req.query['skills.name']),
      e => e.split(',')
    );

    const skills = arrayify(req.query['skills.name']).map(normalize);

    results = filterProfiles(results, 'skills.name', req.query['skills.name']);

    results.forEach(p => {
      p.filtered = {};

      if (!p.filtered['skills.name']) {
        p.filtered['skills.name'] = skills.map(v => p.skills.find(s => normalize(s.name) === v));
      }
    });

    results = results.sort((a, b) => {
      return b.filtered['skills.name'].reduce((r, s, i) => {
        if (r !== null) return r;
        try {
          const diff = (s.endorsementCount | 0) - (a.filtered['skills.name'][i].endorsementCount | 0);
          return diff !== 0 ? diff : null;
        } catch (e) {
          e.data = [r, i, s, a];
          throw e;
        }
      }, null);
    });
  }

  if (req.query['positions.companyName']) {
    results = filterProfiles(results, 'positions.companyName', req.query['positions.companyName']);
  }

  if (req.query['positions.title']) {
    results = filterProfiles(results, 'positions.title', req.query['positions.title']);
  }

  const resultsHTML = results.map(p => `<li>${format.profile(p)} ${p.filtered ?
 `(${p.filtered['skills.name'].map(f => `${f.name}: ${f.endorsementCount || 'N/A'}`).join(', ')})` :
''
}</li>`);

  res.send(`total: ${results.length}<br/>${resultsHTML.join('')}`);
});

function formatProfileIds(ids, func) {
  if (!ids) return [];

  return [
    ...ids
      .filter(e => indices.profiles[e])
      .map(e => indices.profiles[e])
      .sort((a, e) => compareStrings(e.name, a.name))
      .map(func || format.profile),
    ...ids.filter(e => !indices.profiles[e]).sort(compareInts)
  ];
}

app.get('/profiles/:id', (req, res) => {
  const id = req.params.id;

  const profile = indices.profiles[id];
  if (!profile) return res.status(404).send();

  const { friends, endorsees, endorsers, network } = networks.index[id];

  let result = JSON.parse(JSON.stringify(profile));

  result = closure(
    result,
    ({ positions, skills, profileUrl, }) => Object.assign({
      id,
      seniority: closure(
        positions.reduce(
          (r, p) => (p.startDate | 0) < (r.startDate | 0) ? p : r
        ),
        xp1 => xp1 && xp1.startDate ?
          new Date().getFullYear() - new Date(xp1.startDate).getFullYear() :
          'N/A'
      )
    }, result, {
      profileUrl: `<a href="${profileUrl}" target=_blank>LinkedIn</a>`,
      skills: skills.map(s => {
        s.name = `<a href="/profiles?skills.name=${encodeURIComponent(s.name)}">${s.name}</a>`;
        if (s.endorsers && s.endorsers.length) s.endorsers = formatProfileIds(s.endorsers);
        else delete s.endorsers;
        return s;
      }),
      positions: positions.map(s => {
        if (s.startDate) s.startDate = new Date(s.startDate).toISOString().substr(0, 7);
        if (s.endDate) s.endDate = new Date(s.endDate).toISOString().substr(0, 7);
        s.companyName = `<a href="/profiles?positions.companyName=${encodeURIComponent(s.companyName)}">${s.companyName}</a>`;
        s.title = `<a href="/profiles?positions.title=${encodeURIComponent(s.title)}">${s.title}</a>`;
        return s;
      }),
      friends: formatProfileIds(friends),
      endorsed: formatProfileIds(endorsees),
      endorsers: formatProfileIds(endorsers),
      network: formatProfileIds(network),
    })
  );

  res.send(stringifyToHTML(result) + `<code>${JSON.stringify(result)}</code>`);
});

function formatProfile(profile) {
  const { id, name } = profile;
  return name ? `${id}: ${name}` : id;
}

app.get('/profiles/:id/map', (req, res) => {
  const profile = indices.profiles[req.params.id];
  if (!profile) return res.status(404).send();

  const { id, name } = profile;

  const pendorsers = unique(get(endorsees[id], 'id'));
  const pendorsees = unique(get(endorsers[id], 'id'));
  const connecteds = unique(union(pendorsers, pendorsees));
  const friends = intersection(pendorsers, pendorsees);

  if (false) {
    const ndir = connecteds
            .filter(p => intersection(union(
              unique(get(endorsees[p], 'id')),
              unique(get(endorsers[p], 'id'))
            ), connecteds).length)
            .sort();

    const network = unique(ndir);
  }

  const ndir = flatMap(connecteds, p => (
    intersection(
      unique(union(
        unique(get(endorsees[p], 'id')),
        unique(get(endorsers[p], 'id'))
      )),
      connecteds
    )
      .map(id => ({ id: +id, from: p }))
  )).sort();

  const network = unique(get(ndir, 'from'));

  const mapped = mapField(ndir, 'id', 'from');
  const inter = index(
    sortByCountDesc(mapped.filter(e => e.count > 1)),
    'items',
    true,
    ({ name, items, count }) => ({
      name: closure(indices.profiles[name], p => p ? p.name : name),
      items: formatProfileIds(items, formatProfile),
      count,
    })
  );

  console.log('sending');

  res.send({
    id,
    name,
    pendorsers: formatProfileIds(pendorsers, formatProfile),
    pendorsees: formatProfileIds(pendorsees, formatProfile),
    connecteds: formatProfileIds(connecteds, formatProfile),
    friends: formatProfileIds(friends, formatProfile),
    network: formatProfileIds(network, formatProfile),
    mapped,
    inter,
  });
});

const allEndorsees = Object.keys(endorsees);
const allEndorsers = Object.keys(endorsers);
const all = unique(union(allEndorsees, allEndorsers, get(profiles, 'id')).map(id => +id));
const networks = all.map(a => {
  const profile = indices.profiles[a] || { id: +a };

  const { id, name = '' } = profile;

  const pendorsers = unique(get(endorsees[id], 'id'));
  const pendorsees = unique(get(endorsers[id], 'id'));
  const connecteds = unique(union(pendorsers, pendorsees));
  const friends = intersection(pendorsers, pendorsees);

  return { id, name, friends, endorsers: pendorsers, endorsees: pendorsees, connecteds };
});
networks.index = index(networks, 'id', true);

networks.forEach(f => {
  const { id, friends, connecteds } = f;

  const network = connecteds
          .filter(p => {
            if (!networks.index[p]) {
              console.log(f, p);
            }
            return intersection(networks.index[p].connecteds, connecteds).length;
          });

  f.network = network;
});
networks.sort((a, b) => compareInts(b.network.length, a.network.length));

app.get('/map', (req, res) => {
  const { sort } = req.query;

  let results = networks.slice();
  if (sort) {
    const reverse = sort.match(/^-/);
    const field = reverse ? sort.slice(1) : sort;
    console.log(field);
    results.sort((a, b) => closure(
      get(a, field),
      get(b, field),
      (a, b) =>
        (reverse ? -1 : 1) *
        (Number.isInteger(a - b) ?
          compareInts(b, a)
          : compareStrings(b, a))
    ));
  }
  res.send(results.slice(0, +req.query.size || 10));
});

app.get('/skills.name', (req, res) => {
  let results = skills;

  if (req.query.q) {
    const q = normalize(req.query.q);
    results = results.filter(s => s.name.includes(q));
  }

  res.send(
    `total skills: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.skill()).join('<br/>')
  );
});

app.get('/positions.companyName', (req, res) => {
  let results = positions;

  if (req.query.q) {
    const q = normalize(req.query.q);
    results = results.filter(s => s.companyName.includes(q));
  }

  res.send(
    `total companies: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.company).join('<br/>')
  );
});

app.get('/positions.title', (req, res) => {
  let results = titles;

  if (req.query.q) {
    const q = normalize(req.query.q);
    results = results.filter(s => s.title.includes(q));
  }

  res.send(
    `total companies: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.title).join('<br/>')
  );
});

app.get('/skills.name/:skill', (req, res) => {
  const skill = normalize(req.params.skill);
  const presults = indices['skills.name'][skill];
  if (!presults) return res.status(404).send('No such skill name');
  if (!presults.length) return res.send('No result');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills.name'));

  const count = presults.length;
  const skillHTML = `${skill}: ${count}`;
  const relatedSkills = 'related skills:<hr/>' + skills.slice(1).map(format.skill(count)).join('<br/>');

  const companies = filterAndSortByCountOne(mapField(presults, 'positions.companyName'));
  const relatedCompanies = 'related companies:<hr/>' + companies.map(format.company(count)).join('<br/>');

  res.send([skillHTML, relatedSkills, relatedCompanies].join('<hr/><hr/>'));
});

app.get('/positions.companyName/:companyName', (req, res) => {
  const companyName = normalize(req.params.companyName);
  const presults = indices['positions.companyName'][companyName];
  if (!presults) return res.status(404).send('No such company name');
  if (!presults.length) return res.send('No result');

  const companyNames = filterAndSortByCountOne(mapField(presults, 'positions.companyName'));

  const count = presults.length;
  const companyHTML = `${companyName}: ${count}`;
  const relatedCompanyNames = 'related companies:<hr/>' + companyNames.slice(1).map(format.company(count)).join('<br/>');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills.name'));
  const relatedSkills = 'related skills:<hr/>' + skills.map(format.skill(count)).join('<br/>');

  res.send([companyHTML, relatedCompanyNames, relatedSkills].join('<hr/><hr/>'));
});

app.get('/positions.title/:title', (req, res) => {
  const title = normalize(req.params.title);
  const presults = indices['positions.title'][title];
  if (!presults) return res.status(404).send('No such title');
  if (!presults.length) return res.send('No result');

  const titles = filterAndSortByCountOne(mapField(presults, 'positions.title'));

  const count = presults.length;
  const titleHTML = `${title}: ${count}`;
  const relatedTitles = 'related titles:<hr/>' + titles.slice(1).map(format.title(count)).join('<br/>');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills.name'));
  const relatedSkills = 'related skills:<hr/>' + skills.map(format.skill(count)).join('<br/>');

  res.send([titleHTML, relatedTitles, relatedSkills].join('<hr/><hr/>'));
});

app.get('/endorsers/:endorserId', (req, res) => {
  res.send(endorsers[req.params.endorserId]);
});

app.get('/suggest/:q', (req, res) => {
  const q = normalize(req.params.q);

  const counts = profiles.reduce(
    (r, p) => {
      r.name += normalize(p.name).includes(q);
      r['skills.name'] += p.skills.some(e => normalize(e.name).includes(q));
      r['positions.title'] += p.positions.some(e => normalize(e.title).includes(q));
      r['positions.companyName'] += p.positions.some(e => normalize(e.companyName).includes(q));
      return r;
    },
    {
      name: 0,
      'skills.name': 0,
      'positions.title': 0,
      'positions.companyName': 0,
    }
  );

  const getFieldCount = f => counts[f];

  const fields = sortWith(Object.keys(counts).filter(getFieldCount), getFieldCount, true);

  const result = fields.reduce(
    (r, field) => {
      r.results[field] = `<a href="/profiles?${field}=${q}">(${counts[field]})</a>`;

      const p = indices[field][q];
      if (p) {
        r.matches[field] = field === 'name' ?
          (p.length > 1 ? '<ul><li>' : '') +
          p.map(p => `<a href="/profiles/${p.id}">${p.name}</a>`).join('</li><li>') +
          (p.length > 1 ? '</li></ul>' : '') :
        `<a href="/${field}/${q}">${q}</a>`;
      }
      return r;
    },
    { results: {}, matches: {} }
  );

  res.send('exact matches:<br/>' + stringifyToHTML(result.matches) + '<hr/>' +
           'profiles matches:<br/>' + stringifyToHTML(result.results));
});

app.use((err, req, res, next) => res.send(`
${err.message}<hr/>
<code>${err.stack.replace(/\n/g, '<br/>')}</code><hr/>
<code>${JSON.stringify(err.data)}</code>
`));

const port = 3000;

app.listen(port, () => console.timeEnd('started in') || console.info(`running on port ${port}`));
