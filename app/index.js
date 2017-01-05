'use strict';

const { readdir, readFileSync: read, writeFileSync: write } = require('fs');
const qs = require('querystring');

const {
  toNumber,
  opposite,
  decimal,
  percentage,
  percentile,
} = require('./lib/utils/math');

const {
  get,
  forEachObject,
  reduceObject,
  mapObject,
  pluck,
  arrayify,
  pushIn,
} = require('./lib/utils/object');

const {
  unique,
  intersection,
  intersects,
  union,
  flatten,
  flatMap,
  sortWith,
  sortBy,
  filterWith,
  mapWith,
  filterBy,
  compareInts,
  compareStrings,
  compareDates,
} = require('./lib/utils/array');

const {
  normalize,
  parseRange,
} = require('./lib/utils/string');

const {
  YEAR,
  diffDateFromNow,
  diffDates,
  toYear,
} = require('./lib/utils/date');

const {
  negate,
  closure,
  mapArgs,
  curry,
  compose,
  composeArrayArgs,
} = require('./lib/utils/function');

const {
  getDeepRec,
  getDeep,
} = require('./lib/utils/getDeep');

const {
  indexObject,
  index,
  mapField,
} = require('./lib/utils/mapIndex');

const timer = require('./lib/utils/timer');
const { Search } = require('./lib/utils/search');

const { errorHandler, httpError } = require('./lib/middlewares/error-handler');
const { liveReload } = require('./lib/middlewares/live-reload');
const { cache } = require('./lib/middlewares/cache');
const {
  callWithReqQuery,
  callWithReqParams,
  callWithReqBody,
} = require('./lib/middlewares/call-with-req');

const {
  mergeQueries,
  parseQuery,
} = require('./lib/utils/query');

const {
  isInRange,
  isIncludedIn,
  isEqual,
} = require('./lib/utils/is');

const compareIntsDesc = compose(compareInts, opposite);
const compareStringsDesc = compose(compareStrings, opposite);
const compareNames = composeArrayArgs(mapArgs(e => e.name), compareStrings);
const compareNormalized = composeArrayArgs(mapArgs(normalize), compareStrings);
const compareStartEndDates = composeArrayArgs(mapArgs(({ startDate, endDate }) => [startDate, endDate]), compareDates);

const sortByName = sortBy('name', compareStrings);
const sortByNormalizedName = sortBy('name', compareNormalized);
const sortByCountDesc = sortBy('count', compareInts, true);
const sortByEndorsementCountDesc = sortBy('endorsementCount', compareInts, true);
const sortBySeniorityDesc = sortBy('seniority', compareInts, true);

const filterByCountOne = filterBy('count', e => e > 1);
const filterExisting = filterWith(e => e);

const filterAndSortByCountOne = compose(sortByCountDesc, filterByCountOne);

const mapNormalize = mapWith(normalize);

const log = console.log;

function calcSeniority(positions) {
  const xp1 = positions.reduce(
    (r, p) => (p.startDate || 0) < (r.startDate || 0) ? p : r,
    { startDate: Infinity }
  );

  return xp1 && xp1.startDate ?
    diffDateFromNow(xp1.startDate) :
    'N/A';
}

function prepareData(file) {
  const time = timer().start('profiles');

  const data = require(`./profiles/${file}`);

  const profiles = sortByNormalizedName(data);

  mapField(profiles, 'skills.name', unique);

  profiles.forEach(profile => {
    sortByEndorsementCountDesc(profile.skills);

    profile.positions.sort(compareStartEndDates);

    profile.seniority = calcSeniority(profile.positions);
  });

  profiles.index = index(profiles, 'id', true);

  time.check('search');

  const search = Search(profiles, ['profileUrl']);

  time.check('mapping');

  const maps = {
    profiles,
    name: mapField(profiles, 'name', unique),
    seniority: mapField(profiles, 'seniority', unique),
    location: mapField(profiles, 'location', unique),
    'skills.name': mapField(profiles, 'skills.name', unique),
    'positions.companyName': mapField(profiles, 'positions.companyName', unique),
    'positions.title': mapField(profiles, 'positions.title', unique),
  };

  time.check('endorsements');

  function buildEndorsements() {
    const endorsements = maps.profiles.reduce(
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

    forEachObject(endorsements.endorsements, endorsements => endorsements.sort(compareIntsDesc));

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

  time.check('skillsRanks');

  function buildSkillsRanks() {
    profiles.forEach(profile => {
      profile.skills.forEach(skill => {
        const { name, endorsementCount } = skill;

        const normalized = normalize(name);

        const skilled = indices.skilled[normalized];
        if (!skilled) return;

        const endorsements = indices.endorsements[normalized];

        skill.percentile = percentile(endorsements, endorsementCount);

        const superEndorsementCount = (skill.endorsers || []).reduce((r, e) => r + (skilled[e] ? 1 : 0), 0);
        if (superEndorsementCount) {
          skill.superEndorsementCount = superEndorsementCount;
        }
      });
    });
  }

  buildSkillsRanks();

  time.check('relations');

  function buildRelations() {
    const time = timer('relations').start('all');

    const allEndorsees = Object.keys(indices.endorsees);
    const allEndorsers = Object.keys(indices.endorsers);
    const all = unique(union(allEndorsees, allEndorsers, getDeep(profiles, 'id')).map(id => +id));

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

    const keys = filterAndSortByCountOne(maps['skills.name']).map(e => e.name);

    const skillsMatrice = keys.reduce((r, name) => {
      const s1 = name;

      const skills = {};
      const top = { name: '', count: 0 };
      const rs1 = r[s1] = { skills, top };

      const items = flatten((indices['skills.name'][name] || []).map(p => p.skills));
      return items.reduce((r, { name: s2 }) => {
        s2 = normalize(s2);

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
    }, {});

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

  time.check();

  return { search, maps, indices };
}

function filterProfiles(profiles, field, values, greedy = true, comparison = isEqual, normalizeItem = normalize) {
  return profiles.filter(profile => {
    profile.scores = {};

    const pValues = getDeep(profile, field, true);
    const isArray = Array.isArray(pValues);

    const matches = values.map(value => {
      const match = isArray ?
              pValues.filter(({ value: pValue }) => comparison(value, normalizeItem(pValue))) :
            (comparison(value, normalizeItem(pValues.value)) ? [pValues] : []);

      if (match.length) return match;

      return null;
    }, []);

    const { length: count } = filterExisting(matches);

    if (count) {
      if (!profile.matches) {
        profile.matches = {};
      }
      profile.matches[field] = isArray ? getDeep(matches, 'obj') : matches[0][0].value;
    }

    return greedy ? count : count === values.length;
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

const formatMatch = {
  name: match => match,
  location: match => match,
  seniority: toYear,
  'skills.name': match => Object.assign(
    pluck(match, 'name', 'endorsementCount', 'percentile', 'superEndorsementCount'),
    { _links: { href: `/skills.name/${encodeURIComponent(normalize(match.name))}` } }
  ),
  'positions.companyName': match => Object.assign(
    pluck(match, 'companyName', 'title', 'startDate', 'endDate'),
    { seniority: toYear(match.seniority) },
    match.startDate ? { startDate: new Date(match.startDate).toISOString().substr(0, 7) } : {},
    match.endDate ? { endDate: new Date(match.endDate).toISOString().substr(0, 7) } : {},
    { _links: { href: `/positions.title/${encodeURIComponent(normalize(match.title))}` } }
  ),
  'positions.title': match => Object.assign(
    pluck(match, 'title', 'companyName', 'startDate', 'endDate'),
    { seniority: toYear(match.seniority) },
    match.startDate ? { startDate: new Date(match.startDate).toISOString().substr(0, 7) } : {},
    match.endDate ? { endDate: new Date(match.endDate).toISOString().substr(0, 7) } : {},
    { _links: { href: `/positions.title/${encodeURIComponent(normalize(match.title))}` } }
  ),
};

function formatProfilesMatches(matches) {
  if (!matches) return {};

  return {
    matches: reduceObject(matches, (r, match, field) => {
      if (typeof match !== 'object') {
        r[field] = formatMatch[field](match);
      } else {
        r[field] = filterExisting(flatten(match)).map(formatMatch[field]);
      }
      return r;
    }, {}),
  };
}

function formatProfile(profile) {
  const { id, name: title, matches } = profile;

  return Object.assign(
    { title },
    { href: `/profiles/${id}` },
    formatProfilesMatches(matches)
  );
}

const format = {
  profiles: formatProfile,
  name: formatLine('name'),
  seniority: formatLine('seniority'),
  location: formatLine('location'),
  'skills.name': formatLine('skills.name'),
  'positions.companyName': formatLine('positions.companyName'),
  'positions.title': formatLine('positions.title'),
  relations: () => formatRelations,
};

function formatIds(index, collection, sortField) {
  const getFromIndex = get.bind(null, index);
  const sortByField = sortBy(sortField, compareStrings);

  return (ids, func = format[collection]) => {
    if (!ids) return [];

    return [
      ...sortByField(ids.reduce((r, e) => {
        e = getFromIndex(e);
        if (e) {
          r.push(func(e));
        }
        return r;
      }, [])),
      ...ids.filter(compose(getFromIndex, negate)).sort(compareInts)
    ];
  };
}

const formatProfileItems = {
  'positions': indices => positions => positions.map(s => {
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
  }),
  skills: indices => {
    const formatProfileIds = formatIds(indices.profiles, 'profiles', 'name');

    return skills => skills.map(skill => {
      const name = normalize(skill.name);

      const items = indices['skills.name'][name];

      const endorsers = formatProfileIds(skill.endorsers, p => {
        const formatted = format.profiles(p);

        if (indices.skilled[name][p.id]) {
          formatted.superEndorser = true;
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
    })
  },
};

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

const normalizeQueryField = {
  savedSearch: value => mapNormalize(flatMap(value, e => e.split(','))),
  q: e => e,
  name: mapNormalize,
  location: mapNormalize,
  seniority: mapWith(compose(parseRange, (range) => [range[0] * YEAR, range[1] * YEAR])),
  'skills.name': value => mapNormalize(flatMap(value, e => e.split(','))),
  'positions.companyName': mapNormalize,
  'positions.title': mapNormalize,
};

function launch(file, port) {
  console.log(`launching '${file}' on port ${port}`);

  const startTimer = timer(`${file} started in`).start();

  // Init data

  const { search, maps, indices } = prepareData(file);

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

    const { count, _links } = getProfiles(object.value.query);

    return {
      title: name,
      query: object.value.query,
      descrition: object.value.description,
      count: count,
      _links: {
        profiles: _links.profile,
      }
    };
  }

  function sortByFieldScores(arr, field) {
    return arr.sort((a, b) => {
      a = a.scores[field];
      b = b.scores[field];

      if (typeof a === 'number' && typeof b === 'number') return b - a;

      let r;
      b.some((scores, i) => r = scores - a[i]);
      return r;
    });
  }

  function getProfiles(query) {
    let results = maps.profiles;
    results.forEach(p => delete p.matches);

    query = reduceObject(query, (r, value, key) => {
      const formatter = normalizeQueryField[key];
      if (!formatter) return r;

      r[key] = formatter(arrayify(value));
      return r;
    }, {});

    if (query.savedSearch) {
      const savedSearches = query.savedSearch;

      if (savedSearches.length) {
        const searches = getSearches();
        const filtered = searches.filter(s => savedSearches.includes(s.key)).map(s => s.value.query);
        query = filtered.reduce((r, e) => mergeQueries(e, r), query);
      }
    }

    if (query.q) {
      query = mergeQueries(query, parseQuery(query.q));

      query = reduceObject(query, (r, value, key) => {
        r[key] = normalizeQueryField[key](arrayify(value));
        return r;
      }, {});

      if (query.q.length) {
        results = search(query.q);
      }
    }

    if (query.name) {
      results = filterProfiles(results, 'name', query.name, true, isIncludedIn);
    }

    if (query.seniority) {
      results = filterProfiles(results, 'seniority', query.seniority, true, isInRange, e => e);

      results.forEach(profile => {
        profile.scores['seniority'] = profile.seniority;
      });

      results = sortByFieldScores(results, 'seniority');
    }

    if (query.location) {
      results = filterProfiles(results, 'location', query.location, true, isIncludedIn);
    }

    if (query['skills.name']) {
      results = filterProfiles(results, 'skills.name', query['skills.name'], true);

      results.forEach(profile => {
        const matches = profile.matches['skills.name'];

        const counts = matches.reduce((r, match) => {
          if (match) {
            const bestMatch = sortByEndorsementCountDesc(match)[0];
            const maxCount = toNumber(bestMatch.endorsementCount);
            const maxSuperCount = toNumber(bestMatch.superEndorsementCount);

            r.push(maxCount, maxSuperCount);
          } else {
            r.push(-Infinity);
          }
          return r;
        }, []);
        counts.unshift(filterExisting(matches).length);

        profile.scores['skills.name'] = counts;
      });

      results = sortByFieldScores(results, 'skills.name');
    }

    if (query['positions.companyName']) {
      results = filterProfiles(results, 'positions.companyName', query['positions.companyName'], true);

      results.forEach(profile => {
        const matches = profile.matches['positions.companyName'];

        matches.forEach(
          match => {
            if (match && match.length) {
              match.forEach(match => match.seniority = diffDates(match.startDate, match.endDate));
            }
          }
        );

        const counts = matches.reduce((r, match) => {
          if (match) {
            match = sortBySeniorityDesc(match)[0];
            r.push(toYear(match.seniority), match.startDate);
          } else {
            r.push(0, 0);
          }
          return r;
        }, []);

        profile.scores['positions.companyName'] = counts;
      });

      results = sortByFieldScores(results, 'positions.companyName');
    }

    if (query['positions.title']) {
      results = filterProfiles(results, 'positions.title', query['positions.title']);

      results.forEach(profile => {
        const matches = profile.matches['positions.title'];

        matches.forEach(
          match => {
            if (match && match.length) {
              match.forEach(match => match.seniority = diffDates(match.startDate, match.endDate));
            }
          }
        );
      });
    }

    const total = maps.profiles.length;
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
          profile: results.map(format.profiles),
        },
      },
      formatProfilesTemplates(query)
    );
  }

  const formatProfileIds = formatIds(indices.profiles, 'profiles', 'name');
  const formatProfileSkills = formatProfileItems.skills(indices);
  const formatProfilePositions = formatProfileItems.positions(indices);

  function getProfile({ id }) {
    const profile = indices.profiles[id];
    if (!profile) return httpError(404, 'no such profile');

    maps.profiles.forEach(p => delete p.matches);

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

    const sort = sortWith(e => indices.skillsMatrice[name].skills[e], true);

    return sort(matrice.keys)
      .map(child => {
        const count = indices.skillsMatrice[name].skills[child];
        return { name: child, count };
      });
  }

  function getSkillTopSkills({ name }) {
    const topSkills = indices.topSkills[name];
    if (!topSkills) return [];

    const sort = sortWith(
      composeArrayArgs(mapArgs(e => indices.skillsMatrice[name].skills[e]), compareInts),
      true
    );

    return sort(topSkills)
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
          ({ count, _links }) => ({
            profile: {
              count,
              href: `/profiles?${current}`,
              _links: {
                profiles: _links.profile.slice(0, 10),
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
      if (exact.length) {
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
      }

      const partial = maps[field].filter(e => e.name !== q && e.name.includes(q));
      if (partial.length) {
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
      }
      return r;
    }, { exact: [], partial: [] });

    matches.exact = sortByCountDesc(matches.exact);

    matches.partial = matches.partial.sort((a, b) => {
      return b.items[0].count - a.items[0].count;
    });

    const searches = getSearches();

    const sresults = searches.reduce((r, { value: { query }, key }) => {
      const splitQ = q.split(' ').map(normalize);
      const normalizedKey = normalize(key);
      const splitKey = normalizedKey.split(' ');
      const normalizedQuery = normalize(JSON.stringify(query));

      const includedInKey =
              normalizedKey.includes(q) ||
              intersection(splitKey, splitQ).length === splitQ.length ||
              normalizedQuery.includes(q);
      const includingKey =
              q.includes(normalizedKey) ||
              intersection(splitKey, splitQ).length === splitKey.length ||
              q.includes(normalizedQuery);

      if (includedInKey || includingKey) {
        if (includedInKey) {
          const { count } = getProfiles(query);
          r.profiles[key] = { key, count };
          r.including.push({ title: key, count, href: `/savedSearches/${key}` });
        }

        if (includingKey) {
          const scores = splitKey.map(part => q.indexOf(part));
          r.includedIn.push({
            title: key,
            scores,
          });
        }
      }
      return r;
    }, { including: [], includedIn: [], profiles: {} });

    sresults.including = sortByCountDesc(sresults.including);

    if (sresults.includedIn.length) {
      sresults.includedIn.sort((a, b) => {
        let r;
        a.scores.some((scores, i) => r = scores - b.scores[i]);
        return r;
      });

      const titles = getDeep(sresults.includedIn, 'title');

      const { count } = sresults.profiles[titles.join(',')] ||
              getProfiles({ savedSearch: titles.join(',') });

      sresults.includedIn = {
        title: titles.join(' & '),
        count,
        href: `/profiles?savedSearch=${titles.join(',')}`,
      };
    }
    delete sresults.profiles;

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
    return { [field]: getDeepRec(eval(variable.replace(/[^a-zA-Z0-9.\[\]']/g, '')), field) };
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

readdir('profiles', (err, dbs) => {
  const apps = dbs
          .filter(file => file.match('json'))
//          .filter(file => file.match('huitre'))
//          .filter(file => file.match('aka'))
          .filter(file => file.match('bob'))
//          .filter(file => file.match('klad'))
          .map(profile => {
            launch(profile, port);
            port += 1;
          });

  if (!apps.length) {
    console.warn('no apps started');
  }
});
