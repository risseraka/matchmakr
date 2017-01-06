const {
  httpError,
} = require('../middlewares/error-handler');

const getSearches = require('../searches');
const getProfilesRoute = require('./get-profiles');

exports = module.exports = data => {
  const getProfiles = getProfilesRoute(data);

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
