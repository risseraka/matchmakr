'use strict';

const liveReload = `<script type="text/javascript">
function checkReload(etag) {
  fetch(new Request('/livereload')).catch(() => window.location.reload());
}
checkReload();
</script>`;

function stringifyToHTML(obj) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return `<ul>${Object.keys(obj).map(k => `<li>${k}${Array.isArray(obj[k]) ? ` (${obj[k].length})`: ''}: ${stringifyToHTML(obj[k])}</li>`).join('')}</ul>`;
}

function stringify(obj) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return Object.keys(obj).map(k => stringify(obj[k]));
}

function Search(haystack) {
  const stringed = haystack.map(p => stringify(p).join(',').toLowerCase());

  return (needle) => {
    needle = [].concat(needle).map(n => n.toLowerCase());
    return stringed.filter(e => needle.every(n => e.match(n))).map(e => e.split(',')[0]);
  };
}

function filterProfiles(profiles, field, key, value) {
  const values = [].concat(value).map(p => p.toLowerCase());

  return profiles.filter(
    p => {
      const hash = p[field].map(s => s[key].toLowerCase()).join('|');
      return values.filter(v => hash.includes(v)).length === values.length;
    }
  );
}

function index(arr, field, unique, split) {
  return arr.reduce((r, e) => {
    const key = (field ? (typeof field === 'function' ? field(e) : e[field]) : e);

    return [].concat(key)
      .reduce((r, key) => split ? r.concat(key.split(split)) : r.concat(key), [])
      .reduce((r, key) => {
        key = key.toLowerCase();
        r[key] = unique ? e : (r[key] || []).concat(e);
        return r;
      }, r);
  }, {});
}

function mapField(profiles, field, key, split) {
  const fieldIndex = index(profiles, e => e[field].map(e => e[key]), false, split);

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
  a = a.name.toLowerCase();
  b = b.name.toLowerCase();
  return a > b ? 1 : (a < b ? -1 : 0);
});
profiles.forEach(p => {
  p.skills.sort((a, b) => (b.endorsementCount || 0) - (a.endorsementCount || 0));
  p.positions.sort((a, b) => {
    return b.startDate !== a.startDate ? b.startDate - a.startDate : (a.endDate || b.endDate);
  });
});

profiles.index = index(profiles, 'id', true);

const search = Search(profiles);

const skills = mapField(profiles, 'skills', 'name');
const positions = mapField(profiles, 'positions', 'companyName');
const titles = mapField(profiles, 'positions', 'title');

const indices = {
  profiles: profiles.index,
  'name': index(profiles, 'name'),
  'skills.name': skills.index,
  'positions.companyName': positions.index,
  'positions.title': titles.index,
};

const app = express();

app.use(morgan('dev'));

app.use((req, res, next) => {
  const send = res.send;
  //  res.send = str => send.call(res, liveReload + (str || ''));
  next();
});

app.get('/livereload', () => {});

app.get('/', (req, res) => {
  res.send(`
total profiles: ${profiles.length}<br/>
total skills: ${skills.length}</br/>
total companies: ${positions.length}</br/>
total titles: ${titles.length}</br/>
`);
});

app.get('/profiles', (req, res) => {
  let results = profiles;

  if (req.query.q) {
    results = search(req.query.q).map(i => indices.profiles[i]);
  }

  if (req.query.name) {
    results = results.filter(p => p.name.toLowerCase().match(req.query.name.toLowerCase()));
  }

  if (req.query['skills.name']) {
    results = filterProfiles(results, 'skills', 'name', req.query['skills.name']);
  }

  if (req.query['positions.companyName']) {
    results = filterProfiles(results, 'positions', 'companyName', req.query['positions.companyName']);
  }

  if (req.query['positions.title']) {
    results = filterProfiles(results, 'positions', 'title', req.query['positions.title']);
  }

  results = results.map(p => `<li><a href="/profiles/${p.id}">${p.name}</a></li>`);

  res.send(`total: ${results.length}<br/>${results.join('')}`);
});

app.get('/profiles/:id', (req, res, next) => {
  const id = req.params.id;

  const profile = indices.profiles[id];

  if (!profile) return res.status(404).send();

  const result = JSON.parse(JSON.stringify(profile));

  result.profileUrl = `<a href="${result.profileUrl}" target=_blank>LinkedIn</a>`;
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
    results = results.filter(s => s.name.match(req.query.q.toLowerCase()));
  }

  res.send(
    `total skills: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.skill).join('<br/>')
  );
});

app.get('/positions.companyName', (req, res) => {
  let results = positions;

  if (req.query.q) {
    results = results.filter(s => s.companyName.match(req.query.q.toLowerCase()));
  }

  res.send(
    `total companies: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.company).join('<br/>')
  );
});

app.get('/positions.title', (req, res) => {
  let results = titles;

  if (req.query.q) {
    results = results.filter(s => s.title.match(req.query.q.toLowerCase()));
  }

  res.send(
    `total companies: ${results.length}<hr/>` +
      sortByCountDesc(results).map(format.title).join('<br/>')
  );
});

const format = {
  skill: s => `<a href="/skills.name/${s.name}">${s.name}</a>: ${s.count}`,
  company: s => `<a href="/positions.companyName/${s.name}">${s.name}</a>: ${s.count}`,
  title: s => `<a href="/positions.title/${s.name}">${s.name}</a>: ${s.count}`,
};

app.get('/skills.name/:skill', (req, res) => {
  const skill = req.params.skill.toLowerCase();
  const presults = indices['skills.name'][skill];
  if (!presults) return res.status(404).send('No such skill name');
  if (!presults.length) return res.send('No result');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills', 'name'));

  const skillHTML = `${skills[0].name}: ${skills[0].count}`;
  const relatedSkills = 'related skills:<hr/>' + skills.slice(1).map(format.skill).join('<br/>');

  const companies = filterAndSortByCountOne(mapField(presults, 'positions', 'companyName'));
  const relatedCompanies = 'related companies:<hr/>' + companies.map(format.company).join('<br/>');

  res.send([skillHTML, relatedSkills, relatedCompanies].join('<hr/><hr/>'));
});

app.get('/positions.companyName/:companyName', (req, res) => {
  const companyName = req.params.companyName.toLowerCase();
  const presults = indices['positions.companyName'][companyName];
  if (!presults) return res.status(404).send('No such company name');
  if (!presults.length) return res.send('No result');

  const companyNames = filterAndSortByCountOne(mapField(presults, 'positions', 'companyName'));

  const companyHTML = `${companyNames[0].name}: ${companyNames[0].count}`;
  const relatedCompanyNames = 'related companies:<hr/>' + companyNames.slice(1).map(format.company).join('<br/>');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills', 'name'));
  const relatedSkills = 'related skills:<hr/>' + skills.map(format.skill).join('<br/>');

  res.send([companyHTML, relatedCompanyNames, relatedSkills].join('<hr/><hr/>'));
});

app.get('/positions.title/:title', (req, res) => {
  const title = req.params.title.toLowerCase();
  const presults = indices['positions.title'][title];
  if (!presults) return res.status(404).send('No such title');
  if (!presults.length) return res.send('No result');

  const titles = filterAndSortByCountOne(mapField(presults, 'positions', 'title'));

  const titleHTML = `${titles[0].name}: ${titles[0].count}`;
  const relatedTitles = 'related titles:<hr/>' + titles.slice(1).map(format.title).join('<br/>');

  const skills = filterAndSortByCountOne(mapField(presults, 'skills', 'name'));
  const relatedSkills = 'related skills:<hr/>' + skills.map(format.skill).join('<br/>');

  res.send([titleHTML, relatedTitles, relatedSkills].join('<hr/><hr/>'));
});

app.get('/suggest/:q', (req, res) => {
  const q = req.params.q.toLowerCase();

  const counts = profiles.reduce(
    (r, p) => {
      r.name += p.name.toLowerCase().includes(q);
      r['skills.name'] += p.skills.some(e => e.name.toLowerCase().includes(q));
      r['positions.title'] += p.positions.some(e => e.title.toLowerCase().includes(q));
      r['positions.companyName'] += p.positions.some(e => e.companyName.toLowerCase().includes(q));
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
${err.message}<br/>
<code>${err.stack.replace(/\n/g, '<br/>')}</code>
<code>${JSON.stringify(err.data)}</code>
`));

const port = 3000;

app.listen(port, () => console.info(`running on port ${port}`));
