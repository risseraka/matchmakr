const {
  compose,
} = require('../utils/function');

const {
  normalize,
} = require('../utils/string');

const {
  mapToObject,
  sortWith,
  sortByField,
  compareInts,
  intersection,
} = require('../utils/array');

const {
  deepGet,
} = require('../utils/deep-get');

const sortByCountDesc = sortByField('count', compareInts, true);

const getSearches = require('../searches');

const getProfilesRoute = require('./get-profiles');
const getProfilesFormatter = require ('./get-profiles-format');

module.exports = data => {
  const { maps, indices } = data;

  const getProfiles = compose(getProfilesRoute(data), getProfilesFormatter(data));

  return ({ q }) => {
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

      const titles = deepGet(sresults.includedIn, 'title');

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
  };
};
