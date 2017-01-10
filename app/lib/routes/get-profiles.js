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

const rangeToYear = range => [range[0] * YEAR, range[1] * YEAR];

const mapNormalize = applyTo('map', normalize);
const mapToNumber = applyTo('map', toNumber);
const mapParseYearRange = applyTo('map', compose(parseRange, rangeToYear));

const filterExisting = applyTo('filter', e => e !== undefined && e !== null);
const filterFalsy = applyTo('filter', e => e);

const sortByEndorsementCountDesc = sortByField('endorsementCount', compareInts, true);
const sortBySeniorityDesc = sortByField('seniority', compareInts, true);

const builder = require('./builder');

const getSearches = require('../searches');

const queryFields = [
  'skills.name',
  'positions.companyName',
  'positions.title',
  'id',
  'name',
  'location',
  'seniority',
  'q',
];

function mergeQueryScores(query) {
  return scores => {
    return queryFields.reduce((r, field) => {
      const fieldScores = scores[field];
      if (fieldScores) {
        r[0] += Array.isArray(fieldScores) ? filterFalsy(fieldScores).length > 0 : !!fieldScores;
        return r.concat(scores[field]);
      }
      return r;
    }, [0]);
  };
}

function sortByScores(query, arr) {
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

function filterItemsBy({
  field,
  matchAll = false,
  comparison = isEqual,
  normalize = e => e,
  scoring = e => e,
}) {
  return (results, values) => {
    const allValues = values.reduce(
      (r, value) => {
        if (value[0] === '+') {
          r.matchAll.push(value.slice(1));
        } else {
          r.matchSome.push(value);
        }
        return r;
      },
      { matchAll: [], matchSome: [] }
    );

    const filterValues = (values, pValues) => values.map(value => {
      const match = arrayify(pValues).filter(
        ({ value: pValue }) => comparison(value, normalize(pValue))
      );
      if (match.length) return match;

      return null;
    });

    return results.filter(item => {
      const pValues = deepGet(item, field, true);
      const isArray = Array.isArray(pValues);

      const matchAllMatches = filterValues(allValues.matchAll, pValues);
      const matchAllCount = filterExisting(matchAllMatches).length;

      if (allValues.matchAll.length > 0 && matchAllCount !== allValues.matchAll.length) {
        return false;
      }

      const matchSomeMatches = filterValues(allValues.matchSome, pValues);
      const matchSomeCount = filterExisting(matchSomeMatches).length;

      if (matchAll && matchSomeCount !== allValues.matchSome.length) {
        return false;
      }

      if (!matchAll && matchAllCount === 0 && allValues.matchSome.length > 0 && matchSomeCount === 0) {
        item.scores[field] = scoring(isArray ? values.map(() => undefined) : undefined, item, values);
        return false;
      }

      const matches = matchAllMatches.concat(matchSomeMatches);

      const realMatches = filterExisting(matches);

      const { length: count } = realMatches;

      const matchesObj = isArray ?
              deepGet(matches, 'obj') :
              (realMatches[0] ? realMatches[0][0].value : null);

      item.scores[field] = scoring(matchesObj, item, values);

      if (count) {
        item.matches[field] = matchesObj;
      }

      return true;
    });
  };
}

function applyQueryFields(queryFieldsAppliers) {
  return (query, results) =>
    reduceObject(
      // Reducing on appliers instead of query as it can be modified
      queryFieldsAppliers,
      (r, applier, field) => {
        const values = query[field];
        return values && values.length && applier && applier(r, values, field, query) || r;
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

        const values = formatter(arrayify(value));
        if (!values || !values.length) {
          delete r[key];
          return r;
        }

        r[key] = values;
        return r;
      },
      query
    );
}

const scoringBy = {
  skills: matches => {
    const counts = [filterExisting(matches).length];

    return matches.reduce((r, match) => {
      if (match) {
        const bestMatch = sortByEndorsementCountDesc(match)[0];

        const maxCount = toNumber(bestMatch.endorsementCount);
        const maxSuperCount = toNumber(bestMatch.superEndorsementCount);

        r.push(maxCount + 1, maxSuperCount + 1);
      } else {
        r.push(0, 0);
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
  stringField: field => (matches, item, values) => {
    const normalized = normalize(item[field]);

    return values.reduce(
      (r, value) => {
        const count = value === normalized ? Infinity : normalized.indexOf(value) + 1;
        if (count !== 0) {
          r[0] += 1;
        }
        r.push(count);
        return r;
      },
      [0]
    );
  },
  getField: field => (match, item) => match && item[field]
};

const uniqueNormalized = compose(mapNormalize, unique);
const splitUniquedFalsy = str => compose(values => flatMap(values, e => e.split(str)), filterFalsy, unique);
const splitComma = splitUniquedFalsy(',');
const splitCommaNormalized = compose(splitComma, mapNormalize, unique, filterFalsy);
const splitSpace = splitUniquedFalsy(' ');

exports = module.exports = builder(({ maps, indices, search }) => {
  const normalizeModifiers = normalizeQueryFields({
    savedSearch: splitComma,
    similar: compose(splitComma, mapToNumber),
    q: splitSpace,
  });

  const modifyQuery = applyQueryFields({
    q: (results, values, field, query) => {
      const parsed = parseQuery(values);
      mergeQueries(query, parsed);
      if (!query.q.length) delete query.q;
    },
    savedSearch: (results, values, field, query) => {
      const searches = getSearches();
      const filtered = searches
              .filter(s => values.includes(s.key))
              .map(s => s.value.query)
              .concat(query);

      Object.assign(query, filtered.reduce((r, e) => mergeQueries(r, e), {}));
    },
    similar: (results, values, field, query) => {
      const profiles = values.map(id => indices.profiles[id]);
      const pQuery = profiles.reduce((r, profile) => [
        'skills.name',
        'positions.companyName',
        'positions.title',
      ].reduce(
        (r, field) => mergeQueries(r, { [field]: deepGet(profile, field) }),
        r
      ), query);
    },
  });

  const normalizeQuery = normalizeQueryFields({
    id: compose(splitComma, mapToNumber),
    available: () => true,
    name: uniqueNormalized,
    location: uniqueNormalized,
    seniority: mapParseYearRange,
    'skills.name': splitCommaNormalized,
    'positions.companyName': uniqueNormalized,
    'positions.title': uniqueNormalized,
  });

  const fetch = (query) => maps.profiles.slice();

  const init = (query, results) => {
    // Init scores and delete old matches
    results.forEach(profile => {
      profile.scores = {};
      profile.matches = {};
    });
    if (!Object.keys(query).length) return results;

    return [];
  };

  function addItems(opts, func) {
    return (results, values) =>
      func(results, values).reduce((r, profile) => {
        if (!r.includes(profile)) {
          r.push(profile);
        }
        return r;
      }, results);
  }

  function addFilteredItems(opts) {
    const filterItems = filterItemsBy(opts);

    return addItems(opts, (results, values) => filterItems(fetch(), values));
  }

  const filter = applyQueryFields({
    id: addFilteredItems({
      field: 'id',
    }),
    'skills.name': addFilteredItems({
      field: 'skills.name',
      normalize,
      scoring: scoringBy.skills,
    }),
    'positions.companyName': addFilteredItems({
      field: 'positions.companyName',
      normalize,
      scoring: scoringBy.positions,
    }),
    'positions.title': addFilteredItems({
      field: 'positions.title',
      normalize,
      scoring: scoringBy.positions,
    }),
    name: addFilteredItems({
      field: 'name',
      normalize,
      comparison: isIncludedIn,
      scoring: scoringBy.stringField('name'),
    }),
    location: addFilteredItems({
      field: 'location',
      normalize,
      comparison: isIncludedIn,
      scoring: scoringBy.stringField('location'),
    }),
    seniority: addFilteredItems({
      field: 'seniority',
      comparison: isInRange,
      scoring: scoringBy.getField('seniority'),
    }),
    q: addItems({}, (results, values) => {
      return search(values).map(profile => {
        return profile;
      });
    }),
  });

  const filterScores = (query, results) => {
    const expectedScoresCount = queryFields.filter(field => query[field]).length;

    return results.filter(profile => reduceObject(profile.scores, r => r + 1, 0) === expectedScoresCount);
  };

  const score = sortByScores;

  const omit = applyQueryFields({
    similar: (results, values) => results.filter(profile => !values.includes(profile.id)),
  });

  const setQuery = (query, results) => {
    results.query = query;
    return results;
  };

  return [
    normalizeModifiers,
    modifyQuery,
    normalizeQuery,
    fetch,
    init,
    filter,
    filterScores,
    score,
    omit,
    setQuery,
  ];
});
