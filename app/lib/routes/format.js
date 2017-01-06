const config = require('../../config');

const {
  percentage,
} = require('../utils/math');

const {
  toYear,
} = require('../utils/date');

const {
  normalize,
} = require('../utils/string');

const {
  mapObject,
  pluck,
} = require('../utils/object');

const {
  flatten,
} = require('../utils/array');

const {
  applyTo,
} = require('../utils/function');

const filterExisting = applyTo('filter', e => e !== undefined && e !== null);

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

function formatFieldItem(field) {
  return (c, current = '') => s => {
    const name = encodeURIComponent(s.name);
    return {
      title: s.name,
      href: `/${field}/${name}`,
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
  return {
    matches: mapObject(
      matches,
      (match, field) => !Array.isArray(match) ?
        formatMatch[field](match) :
        filterExisting(flatten(match)).map(formatMatch[field])
    ),
  };
}

function formatProfiles(profile) {
  if (!profile || !profile.id) return profile;

  const { id, name: title, score, scores, matches } = profile;

  return Object.assign(
    {
      title,
      href: `/profiles/${id}`,
    },
    config.displayScores && scores && scores.length ? { score: score.join(','), scores } : {},
    matches ? formatProfilesMatches(matches) : {}
  );
}

const format = {
  profiles: () => formatProfiles,
  name: formatFieldItem('name'),
  location: formatFieldItem('location'),
  seniority: formatFieldItem('seniority'),
  'skills.name': formatFieldItem('skills.name'),
  'positions.companyName': formatFieldItem('positions.companyName'),
  'positions.title': formatFieldItem('positions.title'),
  relations: () => formatRelations,
};

exports = module.exports = format;
