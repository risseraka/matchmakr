const {
  normalize,
} = require('../utils/string');

const {
  getFrom,
  mapObject,
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
} = require('../utils/error');

const builder = require('./builder');

const {
  formatGetProfileItems,
  formatRelation,
} = require('./get-profile-format');

function profilesByIdsFetcher(indices) {
  return field => {
    const getFromIndex = getFrom(indices[field]);

    return ids => (ids || []).map(id => getFromIndex(id) || id);
  };
}

function profileRelationsFetcher(indices) {
  const relationsFields = ['friends', 'endorsees', 'endorsers', 'network'];

  const fetchProfilesByIds = profilesByIdsFetcher(indices)('profiles');

  return ({ id }) => {
    const relations = indices.relations[id];
    if (!relations) return {};

    return mapToObject(relationsFields, field => fetchProfilesByIds(relations[field]));
  };
}

function profileSkillsSuperEndorsersFetcher(indices) {
  const fetchProfilesByIds = profilesByIdsFetcher(indices)('profiles');

  return skills => skills.map(skill => {
    const normalized = normalize(skill.name);

    skill.endorsers = fetchProfilesByIds(skill.endorsers).map(endorser => {
      if (typeof endorser === 'number') return endorser;

      if (endorser.id && indices.skilled[normalized][endorser.id]) {
        endorser.superEndorser = true;
      }

      return endorser;
    });

    return skill;
  });
}

exports = module.exports = builder(({ maps, indices }) => {
  const fetchProfileSkillsSuperEndorsers = profileSkillsSuperEndorsersFetcher(indices);
  const fetchProfileRelations = profileRelationsFetcher(indices);

  const fetch = ({ id }) => {
    const profile = indices.profiles[id];
    if (!profile) throw httpError(404, 'no such profile');

    profile.skills = fetchProfileSkillsSuperEndorsers(profile.skills);

    profile.relations = fetchProfileRelations(profile);

    return profile;
  };

  const clean = (query, profile) => maps.profiles.forEach(p => delete p.matches);

  const copy = (query, profile) => {
    try {
      return JSON.parse(JSON.stringify(profile));
    } catch(e) {
      console.warn(profile);
    }
  };

  return [
    fetch,
    clean,
    copy,
  ];
});
