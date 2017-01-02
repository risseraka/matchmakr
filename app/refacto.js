'use strict';

const { readdir, readFileSync: read, writeFileSync: write } = require('fs');
const qs = require('querystring');

function pluck(obj/*, ...fields*/) {
  if (!obj) return {};

  const fields = Array.prototype.slice.call(arguments, 1);
  return fields.reduce((r, f) => (obj[f] && (r[f] = obj[f]), r), {});
}

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
    .replace(/[-.,!\/\]\[\(\)]/g, '')
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

function toNumber(value) {
  return Number.isNaN(+value) ? -1 : +value;
}

function sortBy(field, reverse) {
  return arr => arr.sort((a, b) => (toNumber(a[field]) - toNumber(b[field])) * (reverse ? -1 : 1));
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
  if (!obj) return acc;

  return Object.keys(obj).reduce((r, key, i, keys) => {
    return func(r, obj[key], key, keys);
  }, acc);
}

function mapObject(obj, func) {
  if (!obj) return [];

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
      count: items.length,
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
  return flatMap(arrayify(q), e => e.trim().split(' '))
    .reduce((r, e) => {
      e = e.split(':');

      const value = (e[1] || e[0]).split(',');
      const field = !e[1] ? '' : e[0];

      pushIn(r, field, value);
      return r;
    }, { '': [] });
}

const sortByCountDesc = sortBy('count', true);
const filterByCountPositive = filterBy('count', e => e > 0);
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

// Init data

function formatLine(field) {
  return (c, current = '') => s => {
    const name = encodeURIComponent(s.name);
    return {
      href: `/${field}/${name}`,
      title: s.name,
      _links: {
        profile: {
          href: `/profiles?${current}${field}=${name}`,
          count: s.count,
          percentage: c ? percentage(s.count / c) : 'N/A',
        },
      },
    };
  };
}

const format = {
  profile: p => ({ title: p.name, href: `/profiles/${p.id}` }),
  name: formatLine('name'),
  'skills.name': formatLine('skills.name'),
  'positions.companyName': formatLine('positions.companyName'),
  'positions.title': formatLine('positions.title'),
};

function launch(file, port) {
  console.log(`launching '${file}' on port ${port}`);

  const startTimer = timer(`${file} started in`).start();
  const time = timer().start('profiles');

  const profiles = require(`./profiles/${file}`).sort((a, b) => {
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


  const search = Search(profiles, ['profileUrl']);

  const maps = {
    profiles: profiles,
    name: mapField(profiles, 'name', unique),
    'skills.name': mapField(profiles, 'skills.name', unique),
    'positions.companyName': mapField(profiles, 'positions.companyName', unique),
    'positions.title': mapField(profiles, 'positions.title', unique),
  };

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
    name: maps.name.index,
    'skills.name': maps['skills.name'].index,
    'positions.companyName': maps['positions.companyName'].index,
    'positions.title': maps['positions.title'].index,
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
    results.forEach(p => delete p.matches);

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

      results = filterProfiles(results, 'skills.name', skillName, false);

      const skills = skillName.map(normalize);

      results.forEach(p => {
        p.matches = {};

        const matches = skills.map(v => p.skills.find(s => normalize(s.name) === v));
        const count = matches.filter(e => e).length;
        p.matches['skills.name'] = {
          count,
          score: Math.pow(10, count + 6) + matches.reduce((r, e, i) => r + Math.pow(10, matches.length - i) * (e && e.endorsementCount || 0), 0),
          matches,
        };
      });

      results = results.sort((a, b) => b.matches['skills.name'].score - a.matches['skills.name'].score);
    }

    if (query['positions.companyName']) {
      const companyName = query['positions.companyName'];
      results = filterProfiles(results, 'positions.companyName', companyName);
    }

    if (query['positions.title']) {
      const title = query['positions.title'];
      results = filterProfiles(results, 'positions.title', title);
    }

    return Object.assign({
      count: results.length,
    }, {
      _embedded: {
        profile: results.map(({ id, name, matches }) => Object.assign({
          href: `/profiles/${id}`,
          title: name,
        }, matches ? {
          matches: reduceObject(matches, (r, { matches, count, score }, key) => {
            r[key] = {
              count,
              score,
              matches: matches.map(v => pluck(v, 'name', 'endorsementCount')),
            };
            return r;
          }, {}),
        } : {})),
      },
    }, query.q ? {
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
    } : {});
  }

  function getProfile({ id }) {
    const profile = indices.profiles[id];
    if (!profile) return httpError(404, 'no such profile');

    const { friends, endorsees, endorsers, network } = networks.index[id];

    let result = JSON.parse(JSON.stringify(profile));

    const { positions, skills, profileUrl } = result;

    return Object.assign({
      id,
      seniority: closure(
        positions.reduce((r, p) => (p.startDate || 0) < (r.startDate || 0) ? p : r),
        xp1 => xp1 && xp1.startDate ?
          new Date().getFullYear() - new Date(xp1.startDate).getFullYear() :
          'N/A'
      )
    }, result, {
      skills: skills.map(s => {
        s._links = {
          'skills.name': { href: `/skills.name/${encodeURIComponent(normalize(s.name))}` },
        };
        if (s.endorsers && s.endorsers.length) s.endorsers = formatProfileIds(s.endorsers);
        else delete s.endorsers;
        return s;
      }),
      positions: positions.map(s => {
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
        }
        return s;
      }),
      friends: formatProfileIds(friends),
      endorsed: formatProfileIds(endorsees),
      endorsers: formatProfileIds(endorsers),
      network: formatProfileIds(network),
    }, {
      _links: {
        linkedin: {
          href: profileUrl,
          title: 'LinkedIn profile',
        },
      },
    });

    return result;
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

  function getMapCollection(collection) {
    return ({ q }) => {
      let results = maps[collection];

      if (q) {
        q = normalize(q);
        results = results.filter(t => t.name.includes(q));
      }

      const total = maps[collection].length;
      const count = results.length;

      return Object.assign({
        total,
      }, count !== total ? {
        count,
        percentage: percentage(count / total),
      } : {}, {
        _embedded: {
          [collection]: sortByCountDesc(results).map(format[collection](count)),
        },
      });
    };
  }

  function getMapCollectionItem(collection) {
    return ({ name }) => {
      name = normalize(name);

      const profiles = indices[collection][name];
      if (!profiles) throw httpError(404, `No such ${collection}`);

      const count = profiles.length;
      if (!count) return 'No results';

      const current = `${collection}=${name}&`;

      const items = {
        'skills.name': collection === 'skills.name' ?
          getSkillRelatedSkillsMap({ name }) : mapField(profiles, 'skills.name', unique),
        'positions.companyName': mapField(profiles, 'positions.companyName', unique),
        'positions.title': mapField(profiles, 'positions.title', unique),
      };

      return {
        name,
        _links: {
          profile: {
            href: `/profiles?${collection}=${encodeURIComponent(name)}`,
            count,
          },
        },
        _embedded: reduceObject(items, (r, items, collection) => {
          r[collection] = sortByCountDesc(items).map(format[collection](count, current));
          return r;
        }, {}),
      };
    };
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

  function getSkillRelatedSkills({ name }) {
    const related = getSkillRelatedSkillsMap({ name });

    return related.map(({ name, count }) => {
      const relatedCount = indices['skills.name'][name].length;
      return `${name} (${count}/${relatedCount}, ${percentage(count / relatedCount)}%)`;
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

  function getSearches() {
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
      _embedded: {
        profiles: profiles._embedded.profile,
      }
    };
  }

  function getSuggest({ q }) {
    q = normalize(q);

    const fields = [
      'name',
      'skills.name',
      'positions.companyName',
      'positions.title'
    ];

    const matches = fields.reduce((r, field) => {

      const exact = indices[field][q] || [];
      r.exact.push(Object.assign({
        field,
        count: exact.length,
      }, field !== 'name' ? {
        href: `/${field}/${encodeURIComponent(q)}`,
      } : {
        href: `/profiles?name=${encodeURIComponent(q)}`,
        profiles: exact.map(({ name: title, id }) => ({
          title,
          href: `/profiles/${id}`,
        })),
      }));

      const partial = maps[field].filter(e => e.name !== q && e.name.includes(q));
      r.partial.push(Object.assign({
        field,
        count: partial.length,
      }, {
        href: field !== 'name' ?
          `/${field}?q=${encodeURIComponent(q)}` :
          `/profiles?name=${encodeURIComponent(q)}`,
      }, {
        items: sortByCountDesc(partial.map(({ name, count }) => ({
          title: name,
          href: field !== 'name' ?
            `/${field}/${encodeURIComponent(name)}` :
            `/profiles?name=${encodeURIComponent(name)}`,
          count,
        }))).slice(0, 3),
      }));
      return r;
    }, { exact: [], partial: [] });

    matches.exact = filterByCountPositive(sortByCountDesc(matches.exact));

    matches.partial = filterByCountPositive(matches.partial.sort((a, b) => {
      return b.items.reduce((r, e) => Math.max(r, e.count), 0) -
        a.items.reduce((r, e) => Math.max(r, e.count), 0);
    }));

    const searches = getSearches();

    const sresults = sortByCountDesc(searches.reduce((r, { value: { query }, key }) => {
      if (normalize(JSON.stringify(query)).includes(q) || normalize(key).includes(q)) {
        const count = getProfiles(query).count;
        r.push({ title: key, count, href: `/savedSearches/${key}` });
      }
      return r;
    }, []));

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

  app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));
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

      get('/livereload', () => {});
      get('/profiles', callWithReqQuery(getProfiles));
      get('/profiles/:id', callWithReqParams(getProfile));
      get('/profiles/:id/map', callWithReqParams(getProfileMap));
      get('/profilesMap', callWithReqQuery(getProfilesMap));

      get('/skills.name', callWithReqQuery(getMapCollection('skills.name')));
      get('/positions.companyName', callWithReqQuery(getMapCollection('positions.companyName')));
      get('/positions.title', callWithReqQuery(getMapCollection('positions.title')));

      get('/skills.name/:name', callWithReqParams(getMapCollectionItem('skills.name')));
      get('/skills.name/:name/related', callWithReqParams(getSkillRelatedSkills));
      get('/skills.name/:name/top', callWithReqParams(getSkillTopSkills));

      get('/topSkills', callWithReqQuery(getTopSkills));
      get('/topSkillsN2', callWithReqQuery(getTopSkillsN2));

      get('/positions.companyName/:name', callWithReqParams(getMapCollectionItem('positions.companyName')));
      get('/positions.title/:name', callWithReqParams(getMapCollectionItem('positions.title')));

      get('/suggest/:q', callWithReqParams(getSuggest));
      get('/savedSearches', callWithReqQuery(getSearches));
      get('/savedSearches/:name', callWithReqParams(getSearch));
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
//          .slice(0, 1)
//          .slice(1, 2)
          .slice(-1)
          .map(profile => {
            launch(profile, port);
            port += 1;
          });
});
