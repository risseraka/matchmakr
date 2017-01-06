'use strict';

const { readdir } = require('fs');

const {
  mapToObject,
} = require('./lib/utils/array');

const {
  closure,
} = require('./lib/utils/function');

const {
  deepGetRec,
} = require('./lib/utils/deep-get');

const timer = require('./lib/utils/timer');

const {
  errorHandler,
  httpError,
} = require('./lib/middlewares/error-handler');

const {
  liveReload,
} = require('./lib/middlewares/live-reload');

const {
  cache,
} = require('./lib/middlewares/cache');

const {
  callWithReqQuery,
  callWithReqParams,
  callWithReqBody,
} = require('./lib/middlewares/call-with-req');

const log = console.log;

const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const prepareData = require('./lib/prepare-data');
const getSearches = require('./lib/searches');

const getIndexRoute = require('./lib/routes/get-index');

const getProfilesRoute = require('./lib/routes/get-profiles');
const getProfileRoute = require('./lib/routes/get-profile');

const mapFieldRoutes = require('./lib/routes/get-map-field');
const getSuggestRoute = require('./lib/routes/get-suggest');
const getSearchRoute = require('./lib/routes/get-search');
const getSkillTopSkillsRoute = require('./lib/routes/get-skill-top-skills');
const postSaveRoute = require('./lib/routes/post-save');

function launch(file, port) {
  console.log(`launching '${file}' on port ${port}`);

  const startTimer = timer(`${file} started in`).start();

  // Init data

  const data = prepareData(file);

  const { search, maps, indices } = data;

  const routes = [];

  const getIndex = getIndexRoute(data, routes);
  const getProfiles = getProfilesRoute(data);
  const getProfile = getProfileRoute(data);
  const buildMapFieldRoutes = mapFieldRoutes(data);
  const getSuggest = getSuggestRoute(data);

  const mapFields = [
    'name',
    'location',
    'seniority',
    'skills.name',
    'positions.companyName',
    'positions.title',
  ];

  const mapRoutes = mapToObject(mapFields, buildMapFieldRoutes);

  const getSearch = getSearchRoute(data);
  const getSkillTopSkills = getSkillTopSkillsRoute(data);
  const postSave = postSaveRoute(data);

  function inspect({ variable, field }) {
    return { [field]: deepGetRec(eval(variable.replace(/[^a-zA-Z0-9.\[\]']/g, '')), field) };
  }

  // App setup

  const app = express();

  app.use(morgan('[:date[iso]] :remote-addr :method :url :status :response-time ms - :res[content-length]'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  //  app.use(cache());
  app.use(liveReload());

  closure(
    (route, ...middlewares) => {
      routes.push(route);
      return app.get(route, ...middlewares);
    },
    get => {
      get('/', getIndex);

      routes.push('');

      get('/livereload', () => {});

      routes.push('');

      get('/profiles', callWithReqQuery(getProfiles));
      get('/profiles/:id', callWithReqParams(getProfile));

      routes.push('');

      get('/savedSearches', callWithReqQuery(getSearches));
      get('/savedSearches/:name', callWithReqParams(getSearch));

      routes.push('');

      get('/name', callWithReqQuery(mapRoutes['name'].getMapField));
      get('/name/:name', callWithReqParams(mapRoutes['name'].getMapFieldItem));

      routes.push('');

      get('/seniority', callWithReqQuery(mapRoutes['seniority'].getMapField));
      get('/seniority/:name', callWithReqParams(mapRoutes['seniority'].getMapFieldItem));
      get('/seniority/:name/related/:related', callWithReqParams(mapRoutes['seniority'].getMapFieldItemRelated));

      routes.push('');

      get('/location', callWithReqQuery(mapRoutes['location'].getMapField));
      get('/location/:name', callWithReqParams(mapRoutes['location'].getMapFieldItem));
      get('/location/:name/related/:related', callWithReqParams(mapRoutes['location'].getMapFieldItemRelated));

      routes.push('');

      get('/skills.name', callWithReqQuery(mapRoutes['skills.name'].getMapField));
      get('/skills.name/:name', callWithReqParams(mapRoutes['skills.name'].getMapFieldItem));
      get('/skills.name/:name/related/:related', callWithReqParams(mapRoutes['skills.name'].getMapFieldItemRelated));
      get('/skills.name/:name/top', callWithReqParams(getSkillTopSkills));

      routes.push('');

      get('/positions.companyName', callWithReqQuery(mapRoutes['positions.companyName'].getMapField));
      get('/positions.companyName/:name', callWithReqParams(mapRoutes['positions.companyName'].getMapFieldItem));
      get('/positions.companyName/:name/related/:related', callWithReqParams(mapRoutes['positions.companyName'].getMapFieldItemRelated));

      routes.push('');

      get('/positions.title', callWithReqQuery(mapRoutes['positions.title'].getMapField));
      get('/positions.title/:name', callWithReqParams(mapRoutes['positions.title'].getMapFieldItem));
      get('/positions.title/:name/related/:related', callWithReqParams(mapRoutes['positions.title'].getMapFieldItemRelated));

      routes.push('');

      get('/relations', callWithReqQuery(mapRoutes['relations']));

      routes.push('');

      get('/suggest/:q', callWithReqParams(getSuggest));

      routes.push('');

      app.post('/save', callWithReqBody(postSave));

      app.get('/inspect/:variable/:field', callWithReqParams(inspect));
      app.get('/stats', (req, res) => res.send(process.memoryUsage()));
    }
  );

  app.use(errorHandler);

  app.listen(port, () => {
    startTimer.check();
    console.info(`${file} running on port ${port}`);
  });

  return app;
}

let port = 3000;

readdir('profiles', (err, dbs) => {
  const apps = dbs
          .filter(file => file.match('json'))
          .filter(file => file.match('huitre'))
//          .filter(file => file.match('aka'))
//          .filter(file => file.match('bob'))
//          .filter(file => file.match('klad'))
          .map(profile => {
            launch(profile, port);
            port += 1;
          });

  if (!apps.length) {
    console.warn('no apps started');
  }
});
