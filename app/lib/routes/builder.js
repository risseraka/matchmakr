const {
  mapObjectToArray,
} = require('../utils/object');

const timer = require('../utils/timer');

exports = module.exports = function routeBuilder(setup) {
  return (...args) => {
    const routes = mapObjectToArray(setup(...args), route => route);

    const time = timer('route');

    return query =>
      routes.reduce((results, route) => route(query, results) || results, undefined);
  };
};
