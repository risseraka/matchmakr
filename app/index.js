'use strict';

const { readdir, readFileSync: read, writeFileSync: write } = require('fs');
const qs = require('querystring');

// Utils

function memoize(func) {
  return func;
  const memo = {};
  return (...args) => {
    if (memo[args]) return memo[args];
    return memo[args] = func.apply(this, args);
  };
}

// Math

function toNumber(value) {
  return Number.isNaN(+value) ? -1 : +value;
}

function opposite(a) {
  return a * -1;
}

function decimal(n, digit) {
  const pow = Math.pow(10, digit);
  return Math.floor(n * pow) / pow;
}

function percentage(n, precision = 2) {
  return decimal(n * Math.pow(10, precision), precision);
}

function percentile(arr, value, precision = 10, min = 0.05, minPrecision = 5) {
  if (!arr || !value) return 'N/A';

  const index = arr.indexOf(value);
  const p = index / arr.length;

  return Math.ceil(p * 100 / (p < min ? minPrecision : precision)) * (p < min ? minPrecision : precision) || 1;
}

// Strings

// http://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
function normalizeW(str) {
  return typeof str === 'string' && str
    .normalize('NFD')
    .replace(/[-.,!\/\]\[\(\)]/g, '')
    .replace(/ +/g, ' ')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
const normalize = memoize(normalizeW);

// Objects

function forEachObject(obj, func) {
  if (!obj) return obj;

  return Object.keys(obj).forEach(key => func(obj[key], key));
}

function reduceObject(obj, func, acc) {
  if (!obj) return acc;

  return Object.keys(obj).reduce((r, key, i, keys) => {
    return func(r, obj[key], key, keys);
  }, acc);
}

function mapObject(obj, func) {
  if (!obj) return [];

  return Object.keys(obj).map(key => func(obj[key], key));
}

function pluck(obj, ...fields) {
  if (!obj) return {};

  return fields.reduce((r, f) => (obj[f] && (r[f] = obj[f]), r), {});
}

function arrayify(obj) {
  if (Array.isArray(obj)) return obj;

  return [obj];
}

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

function stringifyToHTML(obj) {
  if (typeof obj !== 'object') {
    return obj !== undefined && obj !== null ? obj.toString() : '';
  }

  const mapped = mapObject(
    obj,
    (v, k) => {
      const length = Array.isArray(v) ? ` (${v.length})`: '';
      const value = k === 'href' ? `<a href="${v}">${v}</a>` : stringifyToHTML(v);
      return `<li>${k}${length}: ${value}</li>`;
    }
  );
  return `<ul>${mapped.join('')}</ul>`;
}

function pushIn(obj, field, values, unique = false, merge = false) {
  if (unique) {
    obj[field] = values;
    return;
  }

  if (merge) {
    if (!obj[field]) {
      obj[field] = values;
    } else {
      if (Array.isArray(values)) {
        Array.prototype.push.apply(obj[field], values);
      } else if (typeof values === 'object') {
        obj[field] = Object.assign(obj[field], values);
      } else {
        obj[field].push(values);
      }
    }
  } else {
    if (!obj[field]) {
      obj[field] = [];
    }
    obj[field].push(values);
  }
}

// Arrays

function uniqueW(arr) {
  if (!arr || !arr.length) return [];
  return [...new Set(arr)];
}

const unique = memoize(uniqueW);

function intersection(arr1, arr2) {
  if (!arr1.length || !arr2.length) return [];
  return arr1.filter(e => arr2.includes(e));
}

function intersects(arr1, arr2) {
  if (!arr1.length || !arr2.length) return false;
  return arr1.some(e => arr2.includes(e));
}

function flatMap(arr, func) {
  return [].concat(...arr.map(func));
}

function sortBy(field, reverse) {
  return arr => arr.sort((a, b) => (toNumber(a[field]) - toNumber(b[field])) * (reverse ? -1 : 1));
}

function filterBy(field, func) {
  return arr => arr.filter(e => func(e[field]));
}

function union(...args) {
  if (!args.length) return [];
  return [].concat(...args);
}

// Comparison

function compareStrings(a, b) {
  return a === b ? 0 : (a < b ? 1 : -1);
}

function compareInts(a, b) {
  return (a || 0) - (b || 0);
}

// Functions

function closure(...args) {
  const func = args.pop();
  return func(...args);
}

function curry(func) {
  return (...first) => {
    return (...then) => func(...first, ...then);
  };
}

function compose(func, ...funcs) {
  return (...args) => {
    const result = func(...args);
    return funcs.reduce((r, func) => func(r), result);
  };
}

function stringify(obj, exclude = []) {
  if (typeof obj !== 'object') return obj ? obj.toString() : '';
  return mapObject(obj, (v, k) => !exclude.includes(k) ? stringify(v): '');
}

// Object and arrays mapping/indices/aggregations

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
      count: formatted.length,
      items: formatted,
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

// Timer module

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

// Middlewares

// Error handler middleware

function httpError(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}

function errorHandler(err, req, res, next) {
  res.status(err.code || 500).format({
    html: () => res.send(`
${err.message}<hr/>
<code>${(err.stack || '').replace(/\n/g, '<br/>')}</code><hr/>
<code>${JSON.stringify(err.data)}</code>
`),
    default: () => res.send(err),
  });
}

// Live reload middleware

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

// Cache middleware

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

function callWithReq(field, func) {
  return (req, res) => {
    const result = func(req[field]);

    res.format({
      html: () => res.send(stringifyToHTML(result)),
      default: () => res.send(result),
    });
  };
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

// Search

function Search(haystack, exclude = []) {
  const stringed = haystack.map(p => normalize(stringify(p, exclude).join(' ')));

  const search = needle => {
    needle = arrayify(needle).map(normalize);
    return stringed.filter(e => needle.every(n => e.includes(n))).map(e => e.split(' ')[0]);
  };
  search.stringed = stringed;
  return search;
}

// Query

function parseRange(str) {
  const range = str.split('..');

  if (range.length === 1) return [range[0], range[0]];

  return [range[0] || -Infinity, range[1] || +Infinity];
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
  return flatMap(arrayify(q), e => e.trim().split(' '))
    .reduce((r, e) => {
      e = e.split(':');

      const value = (e[1] || e[0]).split(',');
      const field = !e[1] ? '' : e[0];

      pushIn(r, field, value, false, true);

      return r;
    }, { '': [] });
}

const sortByCountDesc = sortBy('count', true);
const sortByNameDesc = sortBy('name', true);
const sortByEndorsementCountDesc = sortBy('endorsementCount', true);
const filterByCountPositive = filterBy('count', e => e > 0);
const filterByCountOne = filterBy('count', e => e > 1);

const filterAndSortByCountOne = arr => filterByCountOne(sortByCountDesc(arr));

function filterProfiles(profiles, field, value, greedy = true) {
  const values = arrayify(value).map(normalize);

  return profiles.filter(p => {
    const pValues = get(p, field);

    // match all values
    if (greedy) {
      const matches = values.filter(v => pValues.some(s => normalize(s) === v));
      return matches.length === values.length;
    }

    // match at least one value
    return values.some(v => pValues.some(s => normalize(s) === v));
  });
}

function formatLine(field) {
  return (c, current = '') => s => {
    const name = encodeURIComponent(s.name);
    return {
      href: `/${field}/${name}`,
      title: s.name,
      _links: {
        profile: {
          count: s.count,
          percentage: c ? percentage(s.count / c) : 'N/A',
          href: `/profiles?${current}${field}=${name}`,
        },
      },
    };
  };
}

function formatRelations({ id, count, friends, endorsers, endorsees, network }) {
  return {
    id,
    count,
    endorsers: endorsers.length,
    endorsees: endorsees.length,
    network: network.length,
    friends: friends.length,
  };
}

function formatProfilesMatches(matches) {
  return matches ? {
    matches: reduceObject(matches, (r, match, key) => {
      if (typeof match !== 'object') {
        r[key] = match;
      } else {
        r[key] = match.map(v => Object.assign(
          pluck(v, 'name', 'endorsementCount', 'percentile', 'superEndorsementCount'),
          v ? { _links: { href: `/${key}/${encodeURIComponent(normalize(v.name))}` } } : {}
        ));
      }
      return r;
    }, {}),
  } : {};
}

const format = {
  profile: ({ id, name: title, score, matches }) => Object.assign(
    {
      title,
      score,
      href: `/profiles/${id}`,
    },
    formatProfilesMatches(matches)
  ),
  name: formatLine('name'),
  seniority: formatLine('seniority'),
  location: formatLine('location'),
  'skills.name': formatLine('skills.name'),
  'positions.companyName': formatLine('positions.companyName'),
  'positions.title': formatLine('positions.title'),
  relations: () => formatRelations,
};


function calcSeniority(positions) {
  const xp1 = positions.reduce(
    (r, p) => (p.startDate || 0) < (r.startDate || 0) ? p : r,
    { startDate: Infinity }
  );

  return xp1 && xp1.startDate ?
    new Date().getFullYear() - new Date(xp1.startDate).getFullYear() :
    'N/A';
}

function prepareData(file) {
  const time = timer().start('profiles');

  const profiles = require(`./profiles/${file}`).sort((a, b) => {
    a = normalize(a.name);
    b = normalize(b.name);
    return a > b ? 1 : (a < b ? -1 : 0);
  });
  profiles.forEach(profile => {
    sortByEndorsementCountDesc(profile.skills);

    profile.positions.sort((a, b) => {
      return b.startDate !== a.startDate ? b.startDate - a.startDate : (a.endDate || b.endDate);
    });

    profile.seniority = calcSeniority(profile.positions);
  });

  profiles.index = index(profiles, 'id', true);

  time.check('mapping');

  const search = Search(profiles, ['profileUrl']);

  const maps = {
    profiles: profiles,
    name: mapField(profiles, 'name', unique),
    seniority: mapField(profiles, 'seniority', unique),
    location: mapField(profiles, 'location', unique),
    'skills.name': mapField(profiles, 'skills.name', unique),
    'positions.companyName': mapField(profiles, 'positions.companyName', unique),
    'positions.title': mapField(profiles, 'positions.title', unique),
  };

  time.check('endorsements');

  function buildEndorsements() {
    const endorsements = profiles.reduce(
      (r, p) => p.skills.reduce(
        (r, s) => {
          const name = normalize(s.name);

          pushIn(r.skilled, name, { [p.id]: s }, false, true);

          if (s.endorsementCount) {
            pushIn(r.endorsements, name, s.endorsementCount);
          }

          return s.endorsers.reduce((r, endorser) => {
            pushIn(r.endorsers, endorser, p.id);

            pushIn(r.endorsees, p.id, endorser);
            return r;
          }, r);
        }, r
      ), { endorsements: {}, skilled: {}, endorsers: {}, endorsees: {} }
    );

    forEachObject(endorsements.endorsements, endorsements => endorsements.sort(compose(compareInts, opposite)));

    return endorsements;
  }

  const endorsements = buildEndorsements();

  const fields = [
    'profiles', 'name', 'seniority', 'location',
    'skills.name', 'positions.companyName', 'positions.title'
  ];

  const indices = Object.assign(
    fields.reduce((r, field) => (r[field] = maps[field].index, r), {}),
    endorsements
  );

  time.check('network');

  function buildRelations() {
    const time = timer('network').start('all');

    const allEndorsees = Object.keys(indices.endorsees);
    const allEndorsers = Object.keys(indices.endorsers);
    const all = unique(union(allEndorsees, allEndorsers, get(profiles, 'id')).map(id => +id));

    time.check('map');

    const relations = all.map(a => {
      const profile = indices.profiles[a] || { id: +a };

      const { id, name = '' } = profile;

      const pendorsers = unique(indices.endorsees[id]);
      const pendorsees = unique(indices.endorsers[id]);
      const connecteds = unique(union(pendorsers, pendorsees));
      const friends = intersection(pendorsers, pendorsees);

      const count = connecteds.length;

      return { id, count, name, friends, endorsers: pendorsers, endorsees: pendorsees, connecteds };
    });

    time.check('index');

    relations.index = index(relations, 'id', true);

    time.check('intersection');

    relations.forEach(f => {
      const { id, friends, connecteds } = f;

      const network = connecteds.filter(
        p => intersection(relations.index[p].connecteds, connecteds).length
      );

      f.network = network;
    });

    time.check('sort');

    relations.sort((a, b) => compareInts(b.network.length, a.network.length));

    time.check();

    return relations;
  }

  const relations = buildRelations();

  maps.relations = relations;
  indices.relations = relations.index;

  time.check('skillsMatrice');

  function buildSkillsMatrice() {
    const time = timer('skillsMatrice').start('map');

    const keys = get(filterAndSortByCountOne(maps['skills.name']), 'name');

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

  return { profiles, search, maps, indices };
}

function launch(file, port) {
  console.log(`launching '${file}' on port ${port}`);

  const startTimer = timer(`${file} started in`).start();

  // Init data

  const { profiles, search, maps, indices } = prepareData(file);

  function formatProfileIds(ids, func) {
    if (!ids) return [];

    return [
      ...ids
        .filter(e => indices.profiles[e])
        .map(e => indices.profiles[e])
        .sort((a, b) => compareStrings(b.name, a.name))
        .map(func || format.profile),
      ...ids.filter(e => !indices.profiles[e]).sort(compareInts)
    ];
  }

  function formatProfilePositions(positions) {
    return positions.map(s => {
      if (s.startDate) s.startDate = new Date(s.startDate).toISOString().substr(0, 7);
      if (s.endDate) s.endDate = new Date(s.endDate).toISOString().substr(0, 7);
      s._links = {
        'positions.companyName': {
          title: s.companyName,
          href: `/positions.companyName/${encodeURIComponent(normalize(s.companyName))}`,
        },
        'positions.title': {
          title: s.title,
          href: `/positions.title/${encodeURIComponent(normalize(s.title))}`,
        },
      };
      return s;
    });
  }

  function formatProfileSkills(skills) {
    return skills.map(skill => {
      const name = normalize(skill.name);

      const items = indices['skills.name'][name];

      skill.percentile = percentile(indices.endorsements[name], skill.endorsementCount);

      delete skill.superEndorsementCount;

      const endorsers = formatProfileIds(skill.endorsers, p => {
        const formatted = format.profile(p);

        if (indices.skilled[name][p.id]) {
          formatted.superEndorser = true;
          if (!skill.superEndorsementCount) {
            skill.superEndorsementCount = 0;
          }
          skill.superEndorsementCount += 1;
        }

        return formatted;
      });

      delete skill.endorsers;
      skill.endorsers = endorsers;

      skill._links = {
        'skills.name': { href: `/skills.name/${encodeURIComponent(name)}` },
      };

      return skill;
    }).sort((a, b) => {
      if (a.percentile === 'N/A') return 1;
      if (a.percentile !== b.percentile) return a.percentile - b.percentile;
      return (b.endorsementCount || 0) - (a.endorsementCount || 0);
    });
  }

  function formatProfilesTemplates(query) {
    return query.q ?
      {
        _templates: {
          default: {
            title: 'Save search as',
            method: 'post',
            action: '/save',
            properties: [
              { name: 'table', type: 'hidden', value: 'search' },
              { name: 'key', type: 'text' },
              { name: 'value', type: 'hidden', value: JSON.stringify({ query }) },
            ],
          },
        },
      } : {};
  }

  function computeMatches(results, skillNames) {
    const skills = skillNames.map(normalize);

    results.forEach(profile => {
      if (!profile.matches) {
        profile.matches = {};
      }

      const matches = skills.map(name => {
        const skilled = indices.skilled[name];
        if (!skilled) return undefined;

        const skill = skilled[profile.id];
        if (!skill) return undefined;

        const endorsements = indices.endorsements[name];

        const { endorsementCount } = skill;

        skill.percentile = percentile(endorsements, endorsementCount);

        const superEndorsementCount = (skill.endorsers || []).reduce((r, e) => r + (skilled[e] ? 1 : 0), 0);
        delete skill.superEndorsementCount;
        if (superEndorsementCount) {
          skill.superEndorsementCount = superEndorsementCount;
        }

        return skill;
      });

      const count = matches.filter(e => e).length;

      const score = Math.pow(10, count + 6) +
              matches.reduce(
                (r, e, i) => r + Math.pow(10, matches.length - i) * (e && e.endorsementCount || 0),
                0
              );

      profile.matches['skills.name'] = matches.filter(e => e);
      profile.score = score;
    });

    results = results.sort((a, b) => b.score - a.score);
  }

  function getSearches({ links = false } = {}) {
    const file = `./data/search.json`;

    let content;
    try {
      content = JSON.parse(read(file));
    } catch (e) {
      content = {};
    }

    return mapObject(content, (value, key) => {
      value = JSON.parse(value);

      value.query = JSON.parse(decodeURIComponent(value.query));
      if (links) {
        value.query = reduceObject(
          value.query,
          (r, values, field) => {
            if (field !== 'q') {
              values = values.map(name => ({
                name,
                href: `/${field}/${encodeURIComponent(name)}`,
              }));
            }
            r[field] = values;
            return r;
          },
          {}
        );
      }

      return {
        key,
        value,
        href: `/savedSearches/${key}`,
      };
    });
  }

  function getSearch({ name }) {
    const searches = getSearches();

    const object = searches.filter(e => e.key === name)[0];
    if (!object) return httpError(404, 'no such saved search');

    const profiles = getProfiles(object.value.query);

    return {
      title: name,
      query: object.value.query,
      descrition: object.value.description,
      count: profiles.count,
      _links: {
        profiles: profiles._links.profile,
      }
    };
  }

  function getProfiles(query) {
    let results = profiles;
    results.forEach(p => delete p.matches);

    if (query.savedSearch) {
      const savedSearches = unique(flatMap(
        arrayify(query.savedSearch),
        e => e.split(',')
      )).filter(e => e);

      if (savedSearches.length) {
        const searches = getSearches();
        const filtered = searches.filter(s => savedSearches.includes(s.key)).map(s => s.value.query);
        query = filtered.reduce((r, e) => mergeQueries(e, r), query);
      }
    }

    if (query.q) {
      query = mergeQueries(query, parseQuery(query.q));

      query.q = query.q.map(normalize);

      results = search(query.q).map(id => indices.profiles[id]);
    }

    if (query.name) {
      query.name = arrayify(query.name).map(normalize);
      results = results.filter(p => normalize(p.name).includes(query.name));
    }

    if (query.seniority) {
      const seniority = arrayify(query.seniority).map(parseRange);
      results = results.filter(p => seniority.every(seniority => p.seniority >= seniority[0] && p.seniority <= seniority[1]));
      results.forEach(profile => {
        if (!profile.matches) {
          profile.matches = {};
        }

        profile.matches.seniority = profile.seniority;
      });
    }

    if (query.location) {
      query.location = arrayify(query.location).map(normalize);
      results = results.filter(p => normalize(p.location).includes(query.location));

      results.forEach(profile => {
        if (!profile.matches) {
          profile.matches = {};
        }

        profile.matches.location = profile.location;
      });
    }

    if (query['skills.name']) {
      const skillNames = unique(flatMap(
        arrayify(query['skills.name']),
        e => e.split(',')
      )).filter(e => e);

      query['skills.name'] = skillNames;

      results = filterProfiles(results, 'skills.name', skillNames, false);

      computeMatches(results, skillNames);
    }

    if (query['positions.companyName']) {
      const companyName = query['positions.companyName'];
      results = filterProfiles(results, 'positions.companyName', companyName);
    }

    if (query['positions.title']) {
      const title = query['positions.title'];
      results = filterProfiles(results, 'positions.title', title);
    }

    const total = profiles.length;
    const count = results.length;

    return Object.assign(
      {
        total,
      },
      total !== count ? {
        count,
      } : {},
      {
        _links: {
          profile: results.map(format.profile),
        },
      },
      formatProfilesTemplates(query)
    );
  }

  function getProfile({ id }) {
    const profile = indices.profiles[id];
    if (!profile) return httpError(404, 'no such profile');

    delete profile.matches;

    let result = JSON.parse(JSON.stringify(profile));

    const { seniority, positions, skills, profileUrl } = result;

    return Object.assign(
      {
        id,
        seniority,
      },
      result,
      {
        skills: formatProfileSkills(skills),
        positions: formatProfilePositions(positions),
      },
      ['friends', 'endorsees', 'endorsers', 'network'].reduce((r, field) => {
        r[field] = formatProfileIds(indices.relations[id][field]);
        return r;
      }, {}),
      {
        _links: {
          linkedin: {
            href: profileUrl,
            title: 'LinkedIn profile',
          },
        },
      }
    );

    return result;
  }

  function getSkillRelatedSkillsMap({ name }) {
    const matrice = indices.skillsMatrice[name];
    if (!matrice) return [];

    return matrice.keys
      .sort((a, b) =>
            indices.skillsMatrice[name].skills[b] -
            indices.skillsMatrice[name].skills[a])
      .map(child => {
        const count = indices.skillsMatrice[name].skills[child];
        return { name: child, count };
      });
  }

  function getSkillTopSkills({ name }) {
    const topSkills = indices.topSkills[name];
    if (!topSkills) return [];

    return topSkills
      .sort((a, b) =>
            indices.skillsMatrice[name].skills[b] -
            indices.skillsMatrice[name].skills[a])
      .map(child => {
        const count = indices.skillsMatrice[name].skills[child];
        const childCount = indices['skills.name'][child].length;
        return `${child} (${count}/${childCount}, ${percentage(count / childCount)}%)`;
      });
  }

  function getMapCollection(collection, { q })  {
    let results = maps[collection];

    if (q) {
      q = normalize(q);

      results = results.filter(t => t.name.includes(q));
    }

    const total = maps[collection].length;
    const count = results.length;

    return Object.assign(
      {
        total,
      },
      count !== total ? {
        count,
      } : {},
      {
        _links: {
          [collection]: sortByCountDesc(results).map(format[collection](maps.profiles.length)),
        },
      }
    );
  }

  function getMapCollectionItemRelated(collection, { name, related }) {
    name = normalize(name);

    const profiles = indices[collection][name];
    if (!profiles) throw httpError(404, `No such ${collection}`);

    const count = profiles.length;
    if (!count) return 'No results';

    const current = `${collection}=${encodeURIComponent(name)}&`;

    const items = collection === 'skills.name' ?
            getSkillRelatedSkillsMap({ name }) :
          mapField(profiles, related, unique);

    return {
      field: related,
      count: items.length,
      _links: {
        self: { href: `/${collection}/${name}/related/${related}` },
        [related]: sortByCountDesc(items).map(format[related](maps.profiles.length, current)),
      },
    };
  }

  function getMapCollectionItem(collection, { name }) {
    const getRelated = curry(getMapCollectionItemRelated)(collection);

    name = normalize(name);

    const profiles = indices[collection][name];
    if (!profiles) throw httpError(404, `No such ${collection}`);

    const count = profiles.length;
    if (!count) return 'No results';

    const current = `${collection}=${encodeURIComponent(name)}&`;

    const fields = [
      'seniority',
      'skills.name',
      'positions.companyName',
      'positions.title',
    ];

    const relatedFields = fields.map(field => {
      const related = getRelated({ name, related: field });
      related._links[field] = related._links[field].slice(0, 10);
      return related;
    });

    return {
      name,
      _links: {
        profile: {
          count,
          href: `/profiles?${current}`,
        },
        related: relatedFields.map(({ field, count, _links }) => {
          return {
            field,
            count,
            href: _links.self.href,
          };
        }),
      },
      _embedded: {
        profiles: closure(
          getProfiles({ [collection]: name }),
          profiles => ({
            profile: {
              count: profiles.count,
              href: `/profiles?${current}`,
              _links: {
                profiles: profiles._links.profile.slice(0, 10),
              },
            },
          })
        ),
        related: relatedFields
      },
    };
  }

  function getSuggest({ q }) {
    q = normalize(q);

    const fields = [
      'name',
      'location',
      'skills.name',
      'positions.companyName',
      'positions.title'
    ];

    const matches = fields.reduce((r, field) => {
      const exact = indices[field][q] || [];
      r.exact.push(Object.assign(
        {
          field,
          count: exact.length,
        },
        field !== 'name' ? {
          href: `/${field}/${encodeURIComponent(q)}`,
        } : {
          href: `/profiles?name=${encodeURIComponent(q)}`,
          profiles: exact.map(({ name: title, id }) => ({
            title,
            href: `/profiles/${id}`,
          })),
        }
      ));

      const partial = maps[field].filter(e => e.name !== q && e.name.includes(q));
      r.partial.push(Object.assign(
        {
          field,
          count: partial.length,
        },
        {
          href: field !== 'name' ?
            `/${field}?q=${encodeURIComponent(q)}` :
            `/profiles?name=${encodeURIComponent(q)}`,
        },
        {
          items: sortByCountDesc(partial.map(({ name, count }) => ({
            title: name,
            count,
            href: field !== 'name' ?
              `/${field}/${encodeURIComponent(name)}` :
              `/profiles?name=${encodeURIComponent(name)}`,
          }))).slice(0, 3),
        }
      ));
      return r;
    }, { exact: [], partial: [] });

    matches.exact = filterByCountPositive(sortByCountDesc(matches.exact));

    matches.partial = filterByCountPositive(matches.partial.sort((a, b) => {
      return b.items.reduce((r, e) => Math.max(r, e.count), 0) -
        a.items.reduce((r, e) => Math.max(r, e.count), 0);
    }));

    const searches = getSearches();

    const sresults = searches.reduce((r, { value: { query }, key }) => {
      const splitQ = q.split(' ').map(normalize);
      const normalizedKey = normalize(key).split(' ');
      const normalizedQuery = normalize(JSON.stringify(query));

      const includedInKey = intersection(normalizedKey, splitQ).length === splitQ.length ||
              normalizedQuery.includes(q);
      const includingKey = intersection(normalizedKey, splitQ).length === normalizedKey.length ||
              q.includes(normalizedQuery);

      if (includedInKey || includingKey) {
        if (includedInKey) {
          const count = getProfiles(query).count;
          r.including.push({ title: key, count, href: `/savedSearches/${key}` });
        }

        if (includingKey) {
          const indexOf = q.indexOf(key);
          r.includedIn.push({
            title: key,
            indexOf: indexOf === -1 ? Infinity : indexOf,
          });
        }
      }
      return r;
    }, { including: [], includedIn: [] });

    sresults.including = sortByCountDesc(sresults.including);

    if (sresults.includedIn.length) {
      const titles = get(sresults.includedIn.sort((a, b) => a.indexOf - b.indexOf), 'title');

      sresults.includedIn = {
        title: titles.join(' & '),
        href: `/profiles?savedSearch=${titles.join(',')}`,
      };
    }

    return {
      _links: Object.assign(
        { search: sresults },
        matches
      ),
    };
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

  // App setup

  const express = require('express');
  const bodyParser = require('body-parser');
  const morgan = require('morgan');

  const app = express();

  app.use(morgan('[:date[iso]] :remote-addr :method :url :status :response-time ms - :res[content-length]'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  //  app.use(cache());
  app.use(liveReload());

  const routes = [];

  closure(
    (route, ...middlewares) => {
      routes.push(route);
      return app.get(route, ...middlewares);
    },
    get => {
      get('/', function getIndex(req, res) {
        return res.format({
          json: () => res.send({
            _links: routes.reduce((r, route) => {
              r[route.slice(1) || 'index'] = { href: route };
              return r;
            }, {}),
          }),
          html: () => res.send(`
loaded base: ${file}<hr/>
${mapObject(maps, (items, key) => `total <a href="/${key}">${key}</a>: ${items.length}</a>`).join('<br/>')}<hr/>
routes:<br/>${routes.map(route => `<a href="${route}">${route}</a>`).join('<br/>')}
`),
        });
      });

      routes.push('');

      get('/livereload', () => {});

      routes.push('');

      get('/profiles', callWithReqQuery(getProfiles));
      get('/profiles/:id', callWithReqParams(getProfile));

      routes.push('');

      get('/savedSearches', callWithReqQuery(getSearches));
      get('/savedSearches/:name', callWithReqParams(getSearch));

      routes.push('');

      get('/name', callWithReqQuery(curry(getMapCollection)('name')));
      get('/name/:name', callWithReqParams(curry(getMapCollectionItem)('name')));

      routes.push('');

      get('/seniority', callWithReqQuery(curry(getMapCollection)('seniority')));
      get('/seniority/:name', callWithReqParams(curry(getMapCollectionItem)('seniority')));
      get('/seniority/:name/related/:related', callWithReqParams(curry(getMapCollectionItemRelated)('seniority')));

      routes.push('');

      get('/location', callWithReqQuery(curry(getMapCollection)('location')));
      get('/location/:name', callWithReqParams(curry(getMapCollectionItem)('location')));
      get('/location/:name/related/:related', callWithReqParams(curry(getMapCollectionItemRelated)('location')));

      routes.push('');

      get('/skills.name', callWithReqQuery(curry(getMapCollection)('skills.name')));
      get('/skills.name/:name', callWithReqParams(curry(getMapCollectionItem)('skills.name')));
      get('/skills.name/:name/related/:related', callWithReqParams(curry(getMapCollectionItemRelated)('skills.name')));
      get('/skills.name/:name/top', callWithReqParams(getSkillTopSkills));

      routes.push('');

      get('/positions.companyName', callWithReqQuery(curry(getMapCollection)('positions.companyName')));
      get('/positions.companyName/:name', callWithReqParams(curry(getMapCollectionItem)('positions.companyName')));
      get('/positions.companyName/:name/related/:related', callWithReqParams(curry(getMapCollectionItemRelated)('positions.companyName')));

      routes.push('');

      get('/positions.title', callWithReqQuery(curry(getMapCollection)('positions.title')));
      get('/positions.title/:name', callWithReqParams(curry(getMapCollectionItem)('positions.title')));
      get('/positions.title/:name/related/:related', callWithReqParams(curry(getMapCollectionItemRelated)('positions.title')));

      routes.push('');

      get('/relations', callWithReqQuery(curry(getMapCollection)('relations')));

      routes.push('');

      get('/suggest/:q', callWithReqParams(getSuggest));

      routes.push('');

      app.post('/save', callWithReqBody(saveSomething));

      app.get('/inspect/:variable/:field', callWithReqParams(inspect));
      app.get('/stats', (req, res) => res.send(process.memoryUsage()));
    }
  );

  app.use(errorHandler);

  app.listen(port, () => {
    startTimer.check();
    console.info(`${file} running on port ${port}`);
  });

  return app;
}

let port = 3000;

readdir('profiles', (err, profiles) => {
  const apps = profiles
          .filter(file => file.match('json'))
          .filter(file => file.match('huitre'))
//          .filter(file => file.match('aka'))
//          .filter(file => file.match('bob'))
//          .filter(file => file.match('klad'))
          .map(profile => {
            launch(profile, port);
            port += 1;
          });

  if (!apps.length) {
    console.warn('no apps started');
  }
});
