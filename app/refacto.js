'use strict';

const liveReload = `<script type="text/javascript">
function checkReload(etag) {
  fetch(new Request('/livereload')).catch(() => window.location.reload());
}
checkReload();
</script>`;

// http://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
function normalize(str) {
  if (normalize.memo[str]) return normalize.memo[str];
  return normalize.memo[str] = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
normalize.memo = {};

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
    needle = [].concat(needle).map(n => normalize(n));
    return stringed.filter(e => needle.every(n => e.includes(n))).map(e => e.split(' ')[0]);
  };
  search.stringed = stringed;
  return search;
}

function get(obj, fields) {
  if (!obj || !fields) return obj;

  if (typeof fields === 'string') fields = fields.split('.');

  if (fields.length === 1) {
    return obj[fields[0]];
  }

  for (let i = 0, j = fields.length; i < j; i += 1) {
    if (Array.isArray(obj) && !(fields[i] in obj)) {
      return obj.map(o => get(o, fields.slice(i)));
    }
    obj = obj[fields[i]];
  }

  return obj;
}

function filterProfiles(profiles, field, value) {
  const values = [].concat(value).map(e => normalize(e));

  return profiles.filter(
    p => values.filter(
      v => get(p, field).some(s => normalize(s) === v)
    ).length === values.length
  );
}

function index(arr, field, unique) {
  return arr.reduce((r, e) => {
    const key = (field ? (typeof field === 'function' ? field(e) : get(e, field)) : e);

    return [].concat(key)
      .reduce((r, e) => r.concat(e), [])
      .reduce((r, key) => {
        if (typeof key === 'string') key = normalize(key);
        r[key] = unique ? e : (r[key] || []).concat(e);
        return r;
      }, r);
  }, {});
}

function mapField(profiles, field) {
  const fieldIndex = index(profiles, field, false);

  const map = Object.keys(fieldIndex).map(name => ({
    name,
    items: fieldIndex[name],
    count: fieldIndex[name].length,
  }) );
  map.index = fieldIndex;
  return map;
}

function compareStrings(a, b) {
  return a < b ? (a === b ? 0 : 1) : -1;
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

const app = express();

app.use(morgan('dev'));

app.use((req, res, next) => {
  const send = res.send;
  //  res.send = str => send.call(res, liveReload + (str || ''));
  next();
});

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

    const q = req.query.q.map(q => normalize(q));
    results = search(q).map(i => indices.profiles[i]);
  }

  if (req.query.name) {
    const name = normalize(req.query.name);
    results = results.filter(p => normalize(p.name).includes(name));
  }

  if (req.query['skills.name']) {
    req.query['skills.name'] = []
      .concat(req.query['skills.name'])
      .reduce((r, e) => r.concat(e.split(',')), []);

    const skills = [].concat(req.query['skills.name']).map(e => normalize(e));

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

app.get('/profiles/:id', (req, res, next) => {
  const id = req.params.id;

  const profile = indices.profiles[id];

  if (!profile) return res.status(404).send();

  let result = JSON.parse(JSON.stringify(profile));

  result.profileUrl = `<a href="${result.profileUrl}" target=_blank>LinkedIn</a>`;
  const xp1 = result.positions.reduce((r, p) => p.startDate < r.startDate ? p : r);
  result = Object.assign({ id, seniority: xp1 && xp1.startDate ? new Date().getFullYear() - new Date(xp1.startDate).getFullYear() : 'N/A' }, result);
  result.skills.forEach(s => {
    s.name = `<a href="/profiles?skills.name=${encodeURIComponent(s.name)}">${s.name}</a>`;
    if (!s.endorsers.length) {
      delete s.endorsers;
      return;
    }
    s.endorsers = s.endorsers
      .map(e => indices.profiles[e] || e);
    s.endorsers = []
      .concat(
        s.endorsers.filter(e => !Number.isInteger(+e)).sort((a, b) => compareStrings(b.name, a.name)),
        s.endorsers.filter(e => Number.isInteger(+e)).sort()
      )
      .map(p => p.name ? `<a href="/profiles/${p.id}">${p.name}</a>` : p);
  });
  result.positions.forEach(s => {
    if (s.startDate) s.startDate = new Date(s.startDate).toISOString().substr(0, 7);
    if (s.endDate) s.endDate = new Date(s.endDate).toISOString().substr(0, 7);
    s.companyName = `<a href="/profiles?positions.companyName=${encodeURIComponent(s.companyName)}">${s.companyName}</a>`;
    s.title = `<a href="/profiles?positions.title=${encodeURIComponent(s.title)}">${s.title}</a>`;
  });

  res.send(stringifyToHTML(result) + `<code>${JSON.stringify(result)}</code>`);
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

app.listen(port, () => console.info(`running on port ${port}`));
