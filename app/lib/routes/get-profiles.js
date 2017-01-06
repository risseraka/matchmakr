const {
  toNumber,
} = require('../utils/math');

const {
  reduceObject,
  arrayify,
} = require('../utils/object');

const {
  unique,
  flatten,
  flatMap,
  mapToObject,
  sortWith,
  sortByField,
  compareInts,
  compareStrings,
  compareByField,
} = require('../utils/array');

const {
  closure,
  mapArgs,
  applyTo,
  curry,
  compose,
  composeArrayArgs,
} = require('../utils/function');

const {
  normalize,
  parseRange,
} = require('../utils/string');

const {
  YEAR,
  toYear,
} = require('../utils/date');

const {
  isInRange,
  isIncludedIn,
  isEqual,
} = require('../utils/is');

const {
  deepGet,
} = require('../utils/deep-get');

const {
  mergeQueries,
  parseQuery,
} = require('../utils/query');

const mapNormalize = applyTo('map', normalize);

const filterExisting = applyTo('filter', e => e !== undefined && e !== null);

const sortByEndorsementCountDesc = sortByField('endorsementCount', compareInts, true);
const sortBySeniorityDesc = sortByField('seniority', compareInts, true);

const format = require('./format');
const builder = require('./builder');

function sortByScores(query, arr) {
  function mergeQueryScores(query) {
    return scores => {
      return Object.keys(query).reduce((r, field) => {
        if (field !== 'q') {
          return r.concat(scores[field]);
        }
        return r;
      }, []);
    };
  }

  const mergeScores = mergeQueryScores(query);

  arr.forEach(e => {
    e.score = mergeScores(e.scores);
  });

  const sorted = arr.sort((a, b) => {
    a = a.score;
    b = b.score;

    let r;
    b.some((score, i) => {
      r = score - a[i];
      return r;
    });
    return r;
  });

  return sorted;
}

function filterProfilesBy({
  field,
  greedy = true,
  comparison = isEqual,
  normalizeValue = normalize,
  calcScores = e => e
}) {
  return (results, values) =>
    results.filter(item => {
      if (!item.scores) {
        item.scores = {};
      }

      const pValues = deepGet(item, field, true);
      const isArray = Array.isArray(pValues);

      const matches = values.map(value => {
        const match = arrayify(pValues).filter(({ value: pValue }) => comparison(value, normalizeValue(pValue)));
        if (match.length) return match;

        return null;
      });

      const realMatches = filterExisting(matches);

      const { length: count } = realMatches;

      if (count) {
        if (!item.matches) {
          item.matches = {};
        }

        item.matches[field] = isArray ?
          deepGet(matches, 'obj') :
          realMatches[0][0].value;
        item.scores[field] = calcScores(item.matches[field], item, values);
      }

      return greedy ? count : count === values.length;
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

function filterQueryFields(queryFieldsFilters) {
  return field => {
    const { comparison, normalizeValue, calcScores } = queryFieldsFilters[field];

    return filterProfilesBy({
      field,
      comparison,
      normalizeValue,
      calcScores,
    });
  };
}

function applyQueryFields(queryFieldsAppliers) {
  return (query, results) =>
    reduceObject(
      query,
      (r, values, field) => {
        const applier = queryFieldsAppliers[field];
        return applier && applier(r, values, field, query) || r;
      },
      results
    );
}

function normalizeQueryFields(queryFieldsNormalizers) {
  return query =>
    reduceObject(
      query,
      (r, value, key) => {
        const formatter = queryFieldsNormalizers[key];
        if (!formatter) return r;

        r[key] = formatter(arrayify(value));
        return r;
      },
      query
    );
}

const scoring = {
  skills: matches => {
    const counts = [filterExisting(matches).length];

    return matches.reduce((r, match) => {
      if (match) {
        const bestMatch = sortByEndorsementCountDesc(match)[0];

        const maxCount = toNumber(bestMatch.endorsementCount);
        const maxSuperCount = toNumber(bestMatch.superEndorsementCount);

        r.push(maxCount, maxSuperCount);
      } else {
        r.push(-Infinity, -Infinity);
      }
      return r;
    }, counts);
  },
  positions: matches => {
    const counts = [filterExisting(matches).length];

    return matches.reduce((r, match) => {
      if (match) {
        const bestMatch = sortBySeniorityDesc(match)[0];

        r.push(toYear(bestMatch.seniority), bestMatch.startDate);
      } else {
        r.push(0, 0);
      }
      return r;
    }, counts);
  },
};

exports = module.exports = builder(({ maps, search }) => {
  const queryFields = [
    'name',
    'location',
    'seniority',
    'skills.name',
    'positions.companyName',
    'positions.title',
  ];

  const routes = {
    normalize: normalizeQueryFields({
      savedSearch: value => mapNormalize(flatMap(value, e => e.split(','))),
      q: e => e,
      name: compose(mapNormalize, unique),
      location: compose(mapNormalize, unique),
      seniority: applyTo('map', compose(parseRange, (range) => [range[0] * YEAR, range[1] * YEAR])),
      'skills.name': compose(value => flatMap(value, e => e.split(',')), unique),
      'positions.companyName': compose(mapNormalize, unique),
      'positions.title': compose(mapNormalize, unique),
    }),
    fetch() {
      return maps.profiles.slice();
    },
    init(query, results) {
      // Init scores and delete old matches
      results.forEach(profile => {
        profile.scores = {};
        delete profile.matches;
      });
    },
    apply: applyQueryFields(Object.assign(
      {
        savedSearch(results, values, field, query) {
          const savedSearches = query.savedSearch;

          if (savedSearches.length) {
            const searches = getSearches();
            const filtered = searches.filter(s => savedSearches.includes(s.key)).map(s => s.value.query);
            filtered.reduce((r, e) => mergeQueries(e, r), query);
          }
        },
        q(results, values, field, query) {
          mergeQueries(query, parseQuery(query.q));

          routes.normalize(query);

          return query.q.length ? search(query.q) : undefined;
        },
      },
      mapToObject(queryFields, filterQueryFields({
        name: {
          comparison: isIncludedIn,
          calcScores: (matches, profile, values) => {
            const normalized = normalize(profile.name);

            return values.map(name => {
              if (name === normalized) return Infinity;
              return normalized.indexOf(name);
            });
          },
        },
        location: {
          comparison: isIncludedIn,
          calcScores: (matches, profile, values) => {
            const normalized = normalize(profile.location);

            return values.map(location => {
              if (location === normalized) return Infinity;
              return normalized.indexOf(location);
            });
          },
        },
        seniority: {
          comparison: isInRange,
          normalizeValue: e => e,
          calcScores: (matches, profile) => {
            return profile.seniority;
          },
        },
        'skills.name': {
          calcScores: scoring.skills,
        },
        'positions.companyName': {
          calcScores: scoring.positions,
        },
        'positions.title': {
          calcScores: scoring.positions,
        },
      }))
    )),
    format(query, results) {
      const total = maps.profiles.length;
      const count = results.length;

      return Object.assign(
        { total },
        count !== total ? { count } : {},
        {
          _links: {
            profile: sortByScores(query, results).map(format.profiles()),
          },
        },
        formatProfilesTemplates(query)
      );
    },
  };
  return routes;
});
