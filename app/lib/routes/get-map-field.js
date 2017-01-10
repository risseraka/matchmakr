const {
  curry,
  closure,
  compose,
} = require('../utils/function');

const {
  normalize,
} = require('../utils/string');

const {
  unique,
  sortWith,
  sortByField,
  compareInts,
} = require('../utils/array');

const {
  mapField,
} = require('../utils/map-index');

const {
  httpError,
} = require('../utils/error');

const getProfilesRoute = require('./get-profiles');
const getProfilesFormatter = require ('./get-profiles-format');

const fieldsFormatters = require('./format-fields');
const builder = require('./builder');

const sortByCountDesc = sortByField('count', compareInts, true);

exports = module.exports = data => {
  const { indices, maps } = data;

  const getProfiles = compose(getProfilesRoute(data), getProfilesFormatter(data));

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

  function getMapField(field, { q }) {
    let results = maps[field];

    if (q) {
      q = normalize(q);

      results = results.filter(t => t.name.includes(q));
    }

    const total = maps[field].length;
    const count = results.length;

    const totalProfiles = maps.profiles.length;

    return Object.assign(
      { total },
      count !== total ? { count } : {},
      {
        _links: {
          [field]: sortByCountDesc(results).map(fieldsFormatters[field](totalProfiles)),
        },
      }
    );
  }

  function getMapFieldItemRelated(field, { name, related }) {
    name = normalize(name);

    const profiles = indices[field][name];
    if (!profiles) throw httpError(404, `No such ${field}`);

    const count = profiles.length;
    if (!count) return 'No results';

    const current = `${field}=${encodeURIComponent(name)}&`;

    const items = field === 'skills.name' && related === field ?
            getSkillRelatedSkillsMap({ name }) :
          mapField(profiles, related, unique);

    const totalProfiles = maps.profiles.length;

    return {
      field: related,
      count: items.length,
      _links: {
        self: { href: `/${field}/${name}/related/${related}` },
        [related]: sortByCountDesc(items).map(fieldsFormatters[related](totalProfiles, current)),
      },
    };
  }

  function getMapFieldItem(field, { name }) {
    name = normalize(name);

    const profiles = indices[field][name];
    if (!profiles) throw httpError(404, `No such ${field}`);

    const count = profiles.length;
    if (!count) return 'No results';

    const current = `${field}=${encodeURIComponent(name)}&`;

    const relatedFields = [
      'seniority',
      'skills.name',
      'positions.companyName',
      'positions.title',
    ];

    const relatedItems = relatedFields.map(relatedField => {
      const related = getMapFieldItemRelated(field, { name, related: relatedField });
      related._links[relatedField] = related._links[relatedField].slice(0, 10);
      return related;
    });

    return {
      name,
      _links: {
        profile: {
          count,
          href: `/profiles?${current}`,
        },
        related: relatedItems.map(({ field, count, _links }) => ({
          field,
          count,
          href: _links.self.href,
        })),
      },
      _embedded: {
        profiles: closure(
          getProfiles({ [field]: name }),
          (data) => ({
            profile: {
              count: data.length,
              href: `/profiles?${current}`,
              _links: {
                profiles: console.log(data) || data._links.profile.slice(0, 10),
              },
            },
          })
        ),
        related: relatedItems
      },
    };
  }

  return field => ({
    getMapField: curry(getMapField)(field),
    getMapFieldItem: curry(getMapFieldItem)(field),
    getMapFieldItemRelated: curry(getMapFieldItemRelated)(field),
  });
};
