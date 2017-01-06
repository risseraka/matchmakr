const {
  normalize,
} = require('../utils/string');

const {
  toYear,
} = require('../utils/date');

const {
  getFrom,
} = require('../utils/object');

const {
  compose,
} = require('../utils/function');

const {
  mapToObject,
  compareStrings,
  compareByField,
} = require('../utils/array');

const {
  httpError,
} = require('../middlewares/error-handler');

const format = require('./format');
const builder = require('./builder');

const formatGetProfileItems = {
  positions: positions => positions.map(position => {
    if (position.startDate) position.startDate = new Date(position.startDate).toISOString().substr(0, 7);
    if (position.endDate) position.endDate = new Date(position.endDate).toISOString().substr(0, 7);

    return Object.assign(
      position,
      {
        _links: {
          'positions.companyName': {
            title: position.companyName,
            href: `/positions.companyName/${encodeURIComponent(normalize(position.companyName))}`,
          },
          'positions.title': {
            title: position.title,
            href: `/positions.title/${encodeURIComponent(normalize(position.title))}`,
          },
        },
      }
    );
  }),
  skills: skills => skills.map(skill => {
    const { name, endorsementCount, percentile, endorsers } = skill;

    const normalized = normalize(skill.name);

    return Object.assign(
      { name, endorsementCount, percentile, endorsers: endorsers.map(format.profiles()) },
      {
        _links: {
          'skills.name': { href: `/skills.name/${encodeURIComponent(normalized)}` },
        },
      }
    );
  }).sort((a, b) => {
    if (a.percentile === 'N/A') return 1;
    if (a.percentile !== b.percentile) return a.percentile - b.percentile;
    return (b.endorsementCount || 0) - (a.endorsementCount || 0);
  }),
};

function formatIds(indices) {
  return field => {
    const getFromIndex = getFrom(indices[field]);

    return (ids, formatter = format[field]()) => {
      if (!ids) return [];

      return ids.map(id => formatter(getFromIndex(id) || id));
    };
  };
}

function sortIds(sortField, compareByType) {
  const compare = compareByField(sortField, compareByType);

  return ids => ids.sort((a, b) => {
    if (typeof a !== 'number' && typeof b !== 'number') return compare(a, b);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return typeof a === 'number' ? 1 : -1;
  });
}

exports = module.exports = builder(({ maps, indices }) => {
  const itemsFields = ['skills', 'positions'];
  const relationsFields = ['friends', 'endorsees', 'endorsers', 'network'];

  const formatProfileIds = formatIds(indices)('profiles');
  const sortProfileIds = sortIds('name', compareStrings);
  const formatAndSortProfileIds = compose(formatProfileIds, sortProfileIds);

  const formatProfileItems = mapToObject(itemsFields, getFrom(formatGetProfileItems));

  return [
    ({ id }) => {
      const profile = indices.profiles[id];
      if (!profile) throw httpError(404, 'no such profile');

      maps.profiles.forEach(p => delete p.matches);

      return profile;
    },
    (query, profile) => JSON.parse(JSON.stringify(profile)),
    (query, profile) => {
      const { id, name, location, seniority, positions, skills, profileUrl } = profile;

      profile.skills = skills.map(skill => {
        const normalized = normalize(skill.name);

        skill.endorsers = formatAndSortProfileIds(skill.endorsers, endorser => {
          if (typeof endorser === 'number') return endorser;

          if (endorser.id && indices.skilled[normalized][endorser.id]) {
            endorser.superEndorser = true;
          }

          return endorser;
        });

        return skill;
      });

      const relations = indices.relations[id];

      return Object.assign(
        {
          id,
          name,
          seniority: toYear(seniority),
          location,
          profileUrl,
        },
        mapToObject(itemsFields, field => formatProfileItems[field](profile[field])),
        mapToObject(relationsFields, field => formatAndSortProfileIds(relations[field])),
        {
          _links: {
            linkedin: {
              href: profileUrl,
              title: 'LinkedIn profile',
            },
          },
        }
      );
    },
  ];
});
