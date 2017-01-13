const {
  normalize,
} = require('../utils/string');

const {
  toYear,
} = require('../utils/date');

const {
  getFrom,
  mapObject,
} = require('../utils/object');

const {
  mapToObject,
  compareStrings,
  compareByField,
} = require('../utils/array');

const fieldsFormatters = require('./format-fields');

function sortIds(sortField, compareByType) {
  const compare = compareByField(sortField, compareByType);

  return ids => ids.sort((a, b) => {
    if (typeof a !== 'number' && typeof b !== 'number') return compare(a, b);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return typeof a === 'number' ? 1 : -1;
  });
}

const sortProfileIds = sortIds('name', compareStrings);

const formatRelation = relation => sortProfileIds(relation).map(fieldsFormatters.profiles());

const formatGetProfileItems = {
  positions: positions => positions.map(position => {
    if (position.startDate) position.startDate = new Date(position.startDate).toISOString().substr(0, 7);
    if (position.endDate) position.endDate = new Date(position.endDate).toISOString().substr(0, 7);

    return Object.assign(
      {},
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
      {
        name,
        endorsementCount,
        percentile,
        endorsers: sortProfileIds(endorsers).map(fieldsFormatters.profiles()),
      },
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

const itemsFields = ['skills', 'positions'];
const relationsFields = ['friends', 'endorsees', 'endorsers', 'network'];

const formatProfileItems = mapToObject(itemsFields, getFrom(formatGetProfileItems));
const formatProfileRelations = mapToObject(relationsFields, () => formatRelation);

const formatProfile = () => profile => {
  const {
    id,
    name,
    available = false,
    emails,
    phones,
    location,
    seniority,
    positions,
    skills,
    profileUrl,
    relations
  } = profile;

  return Object.assign(
    {
      id,
      name,
      available,
      emails,
      phones,
      seniority: toYear(seniority),
      location,
      profileUrl,
    },
    mapToObject(itemsFields, field => formatProfileItems[field](profile[field])),
    mapToObject(relationsFields, field => formatProfileRelations[field](relations[field])),
    {
      _links: {
        linkedin: {
          href: profileUrl,
          title: 'LinkedIn profile',
        },
      },
    }
  );
};

exports = module.exports = formatProfile;
