const {
  mapObjectToArray,
} = require('../utils/object');

exports = module.exports = function routeBuilder(setup) {
  return (...args) => {
    const routes = mapObjectToArray(setup(...args), route => route);

    return query => routes.reduce((results, route) => route(query, results) || results, undefined);
  };
};
