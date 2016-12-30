'use strict';

const { readFileSync: read, writeFileSync: write } = require('fs');
const qs = require('querystring');

const startTimer = timer('started in').start();

function timer(inLabel) {
  inLabel = `${inLabel || 'time'}`;

  let label;

  const timer = {
    buildLabel(newLabel) {
      return label = newLabel && `${inLabel}:${newLabel}` || inLabel;
    },
    start(newLabel) {
      label = timer.buildLabel(newLabel);

      console.time(label);

      return timer;
    },
    check(newLabel) {
      console.timeEnd(label);

      label = timer.buildLabel(newLabel);

      console.time(label);

      return timer;
    },
  };
  return timer;
}

function liveReload() {
  const scriptTag = `<script type="text/javascript">
function checkReload(etag) {
  fetch(new Request('/livereload')).catch(() => window.location.reload());
}
checkReload();
</script>`;

  return (req, res, next) => {
    const send = res.send.bind(res);
    //  res.send = str => send(liveReload + (str || ''));
    next();
  };
}

function cache() {
  const memo = {};
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const send = res.send.bind(res);

    if (!('nocache' in req.query) && memo[req.url]) {
      return send(memo[req.url]);
    }

    res.send = result => {
      if (!memo[req.url]) memo[req.url] = result;

      send(result);
    };

    next();
  };
}

function httpError(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}

function callWithReq(field, func) {
  return (req, res) => res.send(func(req[field]));
}

function callWithReqParams(func) {
  return callWithReq('params', func);
}

function callWithReqQuery(func) {
  return callWithReq('query', func);
}

function callWithReqBody(func) {
  return callWithReq('body', func);
}

function memoize(func) {
  return func;
  const memo = {};
  return (...args) => {
    if (memo[args]) return memo[args];
    return memo[args] = func.apply(this, args);
  };
}

function decimal(n, digit) {
  const pow = Math.pow(10, digit);
  return Math.floor(n * pow) / pow;
}

function percentage(n) {
  return decimal(n * 100, 2);
}

// http://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
function normalizeW(str) {
  return typeof str === 'string' && str
    .normalize('NFD')
    .replace(/[-.,!\/]/g, '')
    .replace(/ +/g, ' ')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
const normalize = memoize(normalizeW);

function get(obj, fields, flat) {
  if (!obj || !fields) return obj;

  if (typeof fields === 'string') fields = fields.split('.');

  for (let i = 0, j = fields.length; i < j; i += 1) {
    if (!obj) return null;
    if (Array.isArray(obj) && !(fields[i] in obj)) {
      return flat ?
        flatMap(obj, (o => get(o, fields.slice(i)))) :
        obj.map(o => get(o, fields.slice(i)));
    }
    try {
      obj = obj[fields[i]];
    } catch(e) {
      console.log(obj, fields);
      throw e;
    }
  }

  return obj;
}

function uniqueW(arr) {
  if (!arr || !arr.length) return [];
  return [...new Set(arr)];
}

const unique = memoize(uniqueW);

function closure(...args) {
  const func = args.pop();
  return func(...args);
}

function intersection(arr1, arr2) {
  if (!arr1.length || !arr2.length) return [];
  return arr1.filter(e => arr2.includes(e));
}

function intersects(arr1, arr2) {
  if (!arr1.length || !arr2.length) return false;
  return arr1.some(e => arr2.includes(e));
}

function union(...args) {
  if (!args.length) return [];
  return [].concat(...args);
}

function arrayify(obj) {
  if (Array.isArray(obj)) return obj;

  return [obj];
}

function compareStrings(a, b) {
  return a === b ? 0 : (a < b ? 1 : -1);
}

function compareInts(a, b) {
  return (a || 0) - (b || 0);
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
  return [].concat(...arr.map(func));
}

function pushIn(obj, field, values, unique) {
  if (unique) {
    obj[field] = values;
    return;
  }

  if (!obj[field]) {
    obj[field] = [];
  }
  if (Array.isArray(values)) {
    Array.prototype.push.apply(obj[field], arrayify(values));
  } else {
    obj[field].push(values);
  }
}

function reduceObject(obj, func, acc) {
  return Object.keys(obj).reduce((r, key, i, keys) => {
    return func(r, obj[key], key, keys);
  }, acc);
}

function mapObject(obj, func) {
  return Object.keys(obj).map(key => func(obj[key], key));
}

function indexObject(obj, format = (k, v) => k) {
  return reduceObject(obj, (r, value, key) => arrayify(value).reduce((r, value) => {
    pushIn(r, value, format(key, value));
    return r;
  }, r), {});
}

function index(arr, field, unique, format = e => e) {
  if (!arr || !arr.length) return {};

  const formatItem = typeof format === 'function' ? format : e => get(e, format);

  return arr.reduce((r, e) => {
    const key = !field ?
            e :
            (typeof field === 'function' ? field(e) : get(e, field));

    return [...[].concat(key)].reduce((r, key) => {
      if (typeof key === 'string') key = normalize(key);
      pushIn(r, key, formatItem(e), unique);
      return r;
    }, r);
  }, {});
}

function mapFieldObject(obj, formatItems = e => e) {
  const itemsFormatter = typeof formatItems === 'function' ?
          formatItems :
          (!formatItems ? e => e : items => get(items, formatItems));

  return mapObject(obj, (items, name) => {
    const formatted = itemsFormatter(items, name);

    return {
      name,
      items: formatted,
      count: items.length,
    };
  });
}

function mapField(profiles, field, formatItems = e => e, formatItem) {
  if (!profiles || !profiles.length) return [];

  const fieldIndex = index(profiles, field, false, formatItem);

  const map = mapFieldObject(fieldIndex, (items, name) => {
    const formatted = formatItems(items, name);

    // Overwrite index items by formatted ones
    fieldIndex[name] = formatted;

    return formatted;
  });
  map.index = fieldIndex;
  return map;
}

function stringifyToHTML(obj) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return `<ul>${mapObject(obj, (v, k) => `<li>${k}${Array.isArray(v) ? ` (${v.length})`: ''}: ${stringifyToHTML(v)}</li>`).join('')}</ul>`;
}

function stringify(obj, exclude = []) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return mapObject(obj, (v, k) => !exclude.includes(k) ? stringify(v): '');
}

function Search(haystack, exclude = []) {
  const stringed = haystack.map(p => normalize(stringify(p, exclude).join(' ')));

  const search = needle => {
    needle = arrayify(needle).map(normalize);
    return stringed.filter(e => needle.every(n => e.includes(n))).map(e => e.split(' ')[0]);
  };
  search.stringed = stringed;
  return search;
}

function mergeQueries(target, query) {
  return reduceObject(query, (r, value, field) => {
    if (field == '') {
      r.q = value;
    } else {
      r[field] = (value || []).concat(r[field] || []);
    }
    return r;
  }, target);
}

function parseQuery(q) {
  return q.trim().split(' ').reduce((r, e) => {
    e = e.split(':');

    const value = (e[1] || e[0]).split(',');
    const field = !e[1] ? '' : e[0];

    pushIn(r, field, value);
    return r;
  }, { '': [] });
}

const sortByCountDesc = sortBy('count', true);
const filterByCountOne = filterBy('count', e => e > 1);

function filterField(arr, field, value) {
  const values = arrayify(value);

  return values.reduce((r, value) => {
    const item = arr.skills.find(i => normalize(i.name) === value);
    if (item) r.push(item);
    return r;
  }, []);
}

const filterAndSortByCountOne = arr => filterByCountOne(sortByCountDesc(arr));

const time = timer().start('profiles');

// Init data

function formatLine(field) {
  return (c, current = '') => s => {
    const name = encodeURIComponent(s.name);
    return `<a href="/${field}/${name}">${s.name}</a>: <a href="/profiles?${current}${field}=${name}">${s.count} profile(s)</a> ${c ? `(${percentage(s.count / c)}%)` : ''}`;
  };
}

const format = {
  profile: p => `<a href="/profiles/${p.id}">${p.name}</a>`,
  skill: formatLine('skills.name'),
  company: formatLine('positions.companyName'),
  title: formatLine('positions.title'),
};

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

time.check('mapping');

function filterProfiles(profiles, field, value) {
  const values = arrayify(value).map(normalize);

  return profiles.filter(
    p => values.filter(
      v => get(p, field).some(s => normalize(s) === v)
    ).length === values.length
  );
}


const search = Search(profiles, ['profileUrl']);

const skills = mapField(profiles, 'skills.name', unique);
const positions = mapField(profiles, 'positions.companyName', unique);
const titles = mapField(profiles, 'positions.title', unique);

time.check('endorsers');

function buildEndorsements() {
  const endorsements = profiles.reduce(
    (r, p) => p.skills.reduce(
      (r, s) => s.endorsers.reduce(
        (r, endorser) => {
          pushIn(r.endorsers, endorser, p.id);

          pushIn(r.endorsees, p.id, endorser);
          return r;
        }, r), r
    ), { endorsers: {}, endorsees: {} }
  );

  return endorsements;
}

const { endorsers, endorsees } = buildEndorsements();

const indices = {
  profiles: profiles.index,
  'name': index(profiles, 'name'),
  'skills.name': skills.index,
  'positions.companyName': positions.index,
  'positions.title': titles.index,
  endorsers,
  endorsees,
};

time.check('network');

function buildNetwork() {
  const time = timer('network').start('all');

  const allEndorsees = Object.keys(endorsees);
  const allEndorsers = Object.keys(endorsers);
  const all = unique(union(allEndorsees, allEndorsers, get(profiles, 'id')).map(id => +id));

  time.check('map');

  const networks = all.map(a => {
    const profile = indices.profiles[a] || { id: +a };

    const { id, name = '' } = profile;

    const pendorsers = unique(indices.endorsees[id]);
    const pendorsees = unique(indices.endorsers[id]);
    const connecteds = unique(union(pendorsers, pendorsees));
    const friends = intersection(pendorsers, pendorsees);

    return { id, name, friends, endorsers: pendorsers, endorsees: pendorsees, connecteds };
  });

  time.check('index');

  networks.index = index(networks, 'id', true);

  time.check('intersection');

  networks.forEach(f => {
    const { id, friends, connecteds } = f;

    const network = connecteds.filter(
      p => intersection(networks.index[p].connecteds, connecteds).length
    );

    f.network = network;
  });

  time.check('sort');

  networks.sort((a, b) => compareInts(b.network.length, a.network.length));

  time.check();

  return networks;
}

const networks = buildNetwork();

indices.networks = networks.index;

time.check('skillsMatrice');

function buildSkillsMatrice() {
  const time = timer('skillsMatrice').start('map');

  const keys = get(filterAndSortByCountOne(skills), 'name');

  const skillsMap = keys.map(name => ({
    name,
    items: flatMap(get(indices['skills.name'][name], 'skills.name'), e => e.map(normalize)),
  }));

  time.check('add reduce');

  const skillsMatrice = skillsMap.reduce(
    (r, { name: s1, items }) => {
      const skills = {};
      const top = { name: '', count: 0 };
      const rs1 = r[s1] = { skills, top };

      return items.reduce((r, s2) => {
        if (s1 === s2) return r;
        const rs2 = (skills[s2] || 0) + 1;

        skills[s2] = rs2;

        if (rs2 > top.count) {
          top.count = rs2;
          if (s2 !== top.name) {
            top.name = s2;
          }
        }
        return r;
      }, r);
    },
    {}
  );

  time.check('top map');

  const tops = keys.map(name => ({
    name,
    top: skillsMatrice[name].top.name,
  }));

  time.check('invert');

  const topSkillsIndex = indexObject(
    index(tops, 'name', true, 'top')
  );

  time.check('keys');

  keys.forEach(name => {
    const matrice = skillsMatrice[name];
    matrice.keys = Object.keys(matrice.skills);
  });

  time.check();

  return { skillsMatrice, topSkillsIndex };
}

const { skillsMatrice, topSkillsIndex } = buildSkillsMatrice();

indices.skillsMatrice = skillsMatrice;
indices.topSkills = topSkillsIndex;

time.check('skillsMap');

// App setup

const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const app = express();

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

function formatProfile(profile) {
  const { id, name } = profile;
  return name ? `${id}: ${name}` : id;
}

function getProfiles(query) {
  let results = profiles;
  results.forEach(p => delete p.filtered);

  if (query.q) {
    query = mergeQueries(query, parseQuery(query.q));

    query.q = query.q.map(normalize);

    results = search(query.q).map(i => indices.profiles[i]);
  }

  if (query.name) {
    query.name = normalize(query.name);
    results = results.filter(p => normalize(p.name).includes(query.name));
  }

  if (query['skills.name']) {
    const skillName = unique(flatMap(
      arrayify(query['skills.name']),
      e => e.split(',')
    ));

    query['skills.name'] = skillName;

    results = filterProfiles(results, 'skills.name', skillName);

    const skills = skillName.map(normalize);

    results.forEach(p => {
      p.filtered = {};

      if (!p.filtered['skills.name']) {
        p.filtered['skills.name'] = skills.map(v => p.skills.find(s => normalize(s.name) === v));
      }
    });

    results = results.sort((a, b) => {
      return b.filtered['skills.name'].reduce((r, p, i) => {
        if (r !== null) return r;
        const diff = (p.endorsementCount || 0) - (a.filtered['skills.name'][i].endorsementCount || 0);
        return diff !== 0 ? diff : null;
      }, null);
    });
  }

  if (query['positions.companyName']) {
    const companyName = query['positions.companyName'];
    results = filterProfiles(results, 'positions.companyName', companyName);
  }

  if (query['positions.title']) {
    const title = query['positions.title'];
    results = filterProfiles(results, 'positions.title', title);
  }

  const resultsHTML = results.map(p => `<li>${format.profile(p)} ${p.filtered ?
 `(${p.filtered['skills.name'].map(f => `${f.name}: ${f.endorsementCount || 'N/A'}`).join(', ')})` :
''
}</li>`);

  return [
    `total profiles: ${results.length}`,
    query.q ? `Save search as
<form action="/save" method="POST">
<input type="hidden" name="table" value="search"/>
<input type="text" name="key"/>
<input type="hidden" name="value" value="${encodeURIComponent(JSON.stringify(query))}"/>
<input type="submit" value="OK"/>
</form>` : '',
    resultsHTML.join('')
  ].join('<hr/>');
}

function getProfile({ id }) {
  const profile = indices.profiles[id];
  if (!profile) return res.status(404).send();

  const { friends, endorsees, endorsers, network } = networks.index[id];

  let result = JSON.parse(JSON.stringify(profile));

  result = closure(
    result,
    ({ positions, skills, profileUrl, }) => Object.assign({
      id,
      seniority: closure(
        positions.reduce((r, p) => (p.startDate || 0) < (r.startDate || 0) ? p : r),
        xp1 => xp1 && xp1.startDate ?
          new Date().getFullYear() - new Date(xp1.startDate).getFullYear() :
          'N/A'
      )
    }, result, {
      profileUrl: `<a href="${profileUrl}" target=_blank>LinkedIn</a>`,
      skills: skills.map(s => {
        s.name = `<a href="/skills.name/${encodeURIComponent(normalize(s.name))}">${s.name}</a>`;
        if (s.endorsers && s.endorsers.length) s.endorsers = formatProfileIds(s.endorsers);
        else delete s.endorsers;
        return s;
      }),
      positions: positions.map(s => {
        if (s.startDate) s.startDate = new Date(s.startDate).toISOString().substr(0, 7);
        if (s.endDate) s.endDate = new Date(s.endDate).toISOString().substr(0, 7);
        s.companyName = `<a href="/positions.companyName/${encodeURIComponent(normalize(s.companyName))}">${s.companyName}</a>`;
        s.title = `<a href="/positions.title/${encodeURIComponent(normalize(s.title))}">${s.title}</a>`;
        return s;
      }),
      friends: formatProfileIds(friends),
      endorsed: formatProfileIds(endorsees),
      endorsers: formatProfileIds(endorsers),
      network: formatProfileIds(network),
    })
  );

  return stringifyToHTML(result) + `<code>${JSON.stringify(result)}</code>`;
}

function getProfileMap({ id }) {
  const profile = indices.profiles[id];
  if (!profile) return res.status(404).send();

  const { name } = profile;

  const { friends, endorsees, endorsers, connecteds, network } = networks.index[id];

  const ndir = intersection(
    connecteds,
    flatMap(connecteds, p => indices.networks[p].connecteds)
  ).concat(connecteds).sort();

  const inter = sortByCountDesc(mapField(ndir, null));

  return {
    id,
    name,
    endorsers: formatProfileIds(endorsers, formatProfile),
    endorsees: formatProfileIds(endorsees, formatProfile),
    connecteds: formatProfileIds(connecteds, formatProfile),
    friends: formatProfileIds(friends, formatProfile),
    network: formatProfileIds(network, formatProfile),
    ndir: formatProfileIds(ndir, formatProfile),
    inter,
  };
}

function getProfilesMap({ sort, size = 10 }) {
  let results = networks.slice();
  if (sort) {
    const reverse = sort.match(/^-/);
    const field = reverse ? sort.slice(1) : sort;
    results.sort((a, b) => closure(
      get(a, field),
      get(b, field),
      (a, b) =>
        (reverse ? -1 : 1) *
        (Number.isInteger(a - b) ?
         compareInts(b, a) :
         compareStrings(b, a))
    ));
  }
  return results.slice(0, size);
}

function getSkills({ q }) {
  let results = skills;

  if (q) {
    q = normalize(q);
    results = results.filter(s => s.name.includes(q));
  }

  return `total skills: ${results.length}<hr/><ul><li>` +
    sortByCountDesc(results).map(format.skill(results.length)).join('</li><li>') +
    '</li></ul>';
}

function getCompanyNames({ q }) {
  let results = positions;

  if (q) {
    q = normalize(q);
    results = results.filter(s => s.name.includes(q));
  }

  return `total companies: ${results.length}<hr/><ul><li>` +
    sortByCountDesc(results).map(format.company(results.length)).join('</li><li>') +
    '</li></ul>';
}

function getTitles({ q }) {
  let results = titles;

  if (q) {
    q = normalize(q);
    results = results.filter(t => t.name.includes(q));
  }

  return `total titles: ${results.length}<hr/>` +
    sortByCountDesc(results).map(format.title(results.length)).join('<br/>');
}

function getSkillRelatedSkillsMap({ skill }) {
  const matrice = indices.skillsMatrice[skill];
  if (!matrice) return [];

  return matrice.keys
    .sort((a, b) =>
          indices.skillsMatrice[skill].skills[b] -
          indices.skillsMatrice[skill].skills[a])
    .map(name => {
      const count = indices.skillsMatrice[skill].skills[name];
      return { name, count };
    });
}

function getSkillRelatedSkills({ skill }) {
  const related = getSkillRelatedSkillsMap({ skill });

  return related.map(({ name, count }) => {
    const relatedCount = indices['skills.name'][name].length;
    return `${name} (${count}/${relatedCount}, ${percentage(count / relatedCount)}%)`;
  });
}

function getSkillTopSkills({ skill }) {
  const topSkills = indices.topSkills[skill];
  if (!topSkills) return [];

  return topSkills
    .sort((a, b) =>
          indices.skillsMatrice[skill].skills[b] -
          indices.skillsMatrice[skill].skills[a])
    .map(name => {
      const count = indices.skillsMatrice[skill].skills[name];
      const topCount = indices['skills.name'][name].length;
      return `${name} (${count}/${topCount}, ${percentage(count / topCount)}%)`;
    });
}

function getTopSkills() {
  const topSkills = filterAndSortByCountOne(
    mapField(
      flatMap(
        Object.keys(indices.skillsMatrice),
        skill => {
          const matrice = indices.skillsMatrice[skill];
          const skills = Object.keys(matrice.skills);
          return skills;
        }
      ),
      null,
      e => null
    )
  );

  return index(topSkills, 'name', true, e => e.count);
}

function getTopSkillsN2({ c = 2 }) {
  const topSkills = reduceObject(indices.skillsMatrice, (r, matrice, name) => {
    const topRelated = flatMap(
      matrice.keys.filter(key => matrice.skills[key] > c),
      skill => {
        const skillMatrice = indices.skillsMatrice[skill];
        if (!skillMatrice) return false;

        return skillMatrice.keys.filter(key => matrice.skills[key] > c);
      }
    );

    const items = unique(topRelated).filter(e => e);

    if (items.length) {
      r.push({ name, items });
    }

    return r;
  }, []);

  return topSkills;
}

function getCommonSkills({ index }) {
  const all = get(skills, 'name').sort();

  const pskills = profiles.map(
    p => unique(get(p, 'skills.name').map(normalize))
      .map(s => index ? all.indexOf(s) : s)
      .sort(compareInts)
  );

  const stats = pskills.reduce((r, s) => {
    const { length } = s;

    r.mean += length;
    r.max = Math.max(r.max, length);
    r.min = Math.min(r.min, length);
    return r;
  }, { mean: 0, max: 0, min: 0 });

  console.log(stats.mean / pskills.length);
  console.log(`max: ${stats.max}`);
  console.log(`min: ${stats.min}`);

  return pskills;
}

function getSkill({ skill }) {
  const items = indices['skills.name'][skill];
  if (!items) throw httpError(404, 'No such skill name');
  if (!items.length) return 'No result';

  const current = `skills.name=${skill}&`;

  const skills = filterAndSortByCountOne(getSkillRelatedSkillsMap({ skill }));

  const count = items.length;
  const skillHTML = `${skill}: <a href="/profiles?skills.name=${encodeURIComponent(skill)}">${count} profile(s)</a>`;
  const relatedSkills = '<details><summary>related skills:</summary><ul><li>' +
          skills.map(format.skill(count, current)).join('</li><li>') +
          '</li></ul></details>';

  const companies = filterAndSortByCountOne(mapField(items, 'positions.companyName', unique));
  const relatedCompanies = '<details><summary>related companies:</summary><ul><li>' +
          companies.map(format.company(count, current)).join('</li><li>') +
          '</li></ul></details>';

  return [skillHTML, relatedSkills, relatedCompanies].join('<hr/><hr/>');
}

function getCompanyName({ companyName }) {
  const items = indices['positions.companyName'][companyName];
  if (!items) throw httpError(404, 'No such skill name');
  if (!items.length) return 'No result';

  const current = `positions.companyName=${companyName}&`;

  const companyNames = filterAndSortByCountOne(mapField(items, 'positions.companyName', unique));

  const count = items.length;
  const companyHTML = `${companyName}: ${count}`;
  const relatedCompanyNames = 'related companies:<hr/><ul><li>' +
          companyNames.slice(1).map(format.company(count, current)).join('</li><li>') +
          '</li></ul>';

  const skills = filterAndSortByCountOne(mapField(items, 'skills.name', unique));
  const relatedSkills = 'related skills:<hr/><ul><li>' +
          skills.map(format.skill(count, current)).join('</li><li>') +
          '</li></ul>';

  return [companyHTML, relatedCompanyNames, relatedSkills].join('<hr/><hr/>');
}

function getTitle({ title }) {
  const items = indices['positions.title'][title];
  if (!items) return httpError(404, 'No such title');
  if (!items.length) return 'No result';

  const current = `positions.title=${title}&`;

  const titles = filterAndSortByCountOne(mapField(items, 'positions.title', unique));

  const count = items.length;
  const titleHTML = `${title}: ${count}`;
  const relatedTitles = 'related titles:<hr/>' +
          titles.slice(1).map(format.title(count, current)).join('<br/>');

  const skills = filterAndSortByCountOne(mapField(items, 'skills.name', unique));
  const relatedSkills = 'related skills:<hr/><ul><li>' +
          skills.map(format.skill(count, current)).join('</li><li>') +
          '</li></ul>';

  return [titleHTML, relatedTitles, relatedSkills].join('<hr/><hr/>');
}

function getSearches() {
  const file = `./data/search.json`;

  let content;
  try {
    content = JSON.parse(read(file));
  } catch (e) {
    content = {};
  }
  return mapObject(content, (value, key) => ({
    key,
    value: decodeURIComponent(value),
  }));
}

function getSuggest({ q }) {
  q = normalize(q);

  const searches = getSearches();

  const counts = profiles.reduce(
    (r, p) => {
      r.name += normalize(p.name).includes(q);
      r['skills.name'] += p.skills.some(e => normalize(e.name).includes(q));
      r['positions.title'] += p.positions.some(e => normalize(e.title).includes(q));
      r['positions.companyName'] += p.positions.some(e => normalize(e.companyName).includes(q));
      return r;
    },
    {
      q: 0,
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

  const sresults = searches.reduce((r, { value, key }) => {
    if (value.includes(q) || normalize(key).includes(q)) {
      value = JSON.parse(value);
      r.push(`${key}: <a href="/profiles?${qs.stringify(value)}">${stringify(value)}</a>`);
    }
    return r;
  }, []);

  result.searches = (sresults.length) ? '<ul><li>' + sresults.join('</li><li>') + '</li></ul>' : '';

  return [
    'saved searches:<br/>' + result.searches,
    'exact matches:<br/>' + stringifyToHTML(result.matches),
    'profiles matches:<br/>' + stringifyToHTML(result.results)
  ].join('<hr/>');
}

function saveSomething(body) {
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

function inspect({ variable, field }) {
  return { [field]: get(eval(variable.replace(/[^a-zA-Z0-9.\[\]']/g, '')), field) };
}

app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cache());
app.use(liveReload());

const routes = [];

closure(
  (route, ...middlewares) => {
    routes.push(route);
    return app.get(route, ...middlewares);
  },
  get => {
    get('/', function getIndex(req, res) {
      return res.send(`
total <a href="/profiles">profiles</a>: ${profiles.length}<br/>
total <a href="/skills.name">skills</a>: ${skills.length}<br/>
total <a href="/positions.companyName">companies</a>: ${positions.length}<br/>
total <a href="/positions.title">titles</a>: ${titles.length}<hr/>
routes:<br/>${routes.map(route => `<a href="${route}">${route}</a>`).join('<br/>')}
`);
    });

    get('/livereload', () => {});
    get('/profiles', callWithReqQuery(getProfiles));
    get('/profiles/:id', callWithReqParams(getProfile));
    get('/profiles/:id/map', callWithReqQuery(getProfileMap));
    get('/profilesMap', callWithReqQuery(getProfilesMap));

    get('/skills.name', callWithReqQuery(getSkills));
    get('/positions.companyName', callWithReqQuery(getCompanyNames));
    get('/positions.title', callWithReqQuery(getTitles));

    get('/skills.name/:skill', callWithReqParams(getSkill));
    get('/skills.name/:skill/related', callWithReqParams(getSkillRelatedSkills));
    get('/skills.name/:skill/top', callWithReqParams(getSkillTopSkills));

    get('/topSkills', callWithReqQuery(getTopSkills));
    get('/topSkillsN2', callWithReqQuery(getTopSkillsN2));
    get('/commonSkills', callWithReqQuery(getCommonSkills));

    get('/positions.companyName/:companyName', callWithReqParams(getCompanyName));
    get('/positions.title/:title', callWithReqParams(getTitle));

    get('/suggest/:q', callWithReqParams(getSuggest));
    get('/savedSearches', callWithReqQuery(getSearches));
    app.post('/save', callWithReqBody(saveSomething));

    app.get('/inspect/:variable/:field', callWithReqParams(inspect));
    app.get('/stats', (req, res) => res.send(process.memoryUsage()));
  }
);

app.use((err, req, res, next) => res.status(err.code || 500).send(`
${err.message}<hr/>
<code>${(err.stack || '').replace(/\n/g, '<br/>')}</code><hr/>
<code>${JSON.stringify(err.data)}</code>
`));

const port = 3000;

app.listen(port, () => startTimer.check() || console.info(`running on port ${port}`));
