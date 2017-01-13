const {
  compose,
} = require('../utils/function');

const {
  httpError,
} = require('../utils/error');

const getSearches = require('../searches');

const getProfilesRoute = require('./get-profiles');
const getProfilesFormatter = require ('./get-profiles-format');

exports = module.exports = data => {
  const getProfiles = compose(getProfilesRoute(data), getProfilesFormatter(data));

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

  return getSearch;
};
