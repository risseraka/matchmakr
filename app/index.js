'use strict';

const { readdir } = require('fs');

const {
  mapToObject,
} = require('./lib/utils/array');

const {
  closure,
  compose,
} = require('./lib/utils/function');

const {
  deepGetRec,
} = require('./lib/utils/deep-get');

const timer = require('./lib/utils/timer');

const {
  httpError,
} = require('./lib/utils/error');

const {
  errorHandler,
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

// routes

const getIndexRoute = require('./lib/routes/get-index');
const getProfilesRoute = require('./lib/routes/get-profiles');
const getProfileRoute = require('./lib/routes/get-profile');
const mapFieldRoutes = require('./lib/routes/get-map-field');
const getSuggestRoute = require('./lib/routes/get-suggest');
const getSearchRoute = require('./lib/routes/get-search');
const getSkillTopSkillsRoute = require('./lib/routes/get-skill-top-skills');
const postSaveRoute = require('./lib/routes/post-save');

// rendering

const getProfilesFormatter = require('./lib/routes/get-profiles-format');
const getProfileFormatter = require ('./lib/routes/get-profile-format');

function launch(file, port) {
  console.log(`launching '${file}' on port ${port}`);

  const startTimer = timer(`${file} started in`).start();

  // Init data

  const data = prepareData(file);

  const { search, maps, indices, table } = data;

  const routes = [];

  const getIndex = getIndexRoute(data, routes);
  const getProfiles = getProfilesRoute(data);
  const getProfile = getProfileRoute(data);
  const buildMapFieldRoutes = mapFieldRoutes(data);
  const getSuggest = getSuggestRoute(data);

  const formatGetProfiles = getProfilesFormatter(data);
  const formatGetProfile = getProfileFormatter(data);

  const mapFields = [
    'name',
    'location',
    'seniority',
    'skills.name',
    'positions.companyName',
    'positions.title',
    'relations',
  ];

  const mapRoutes = mapToObject(mapFields, buildMapFieldRoutes);

  const getSearch = getSearchRoute(data);
  const getSkillTopSkills = getSkillTopSkillsRoute(data);
  const postSave = postSaveRoute(data);
  const postAppend = postSaveRoute.append(data);

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

      get('/profiles', callWithReqQuery(compose(getProfiles, formatGetProfiles)));
      get('/profiles/:id', callWithReqParams(compose(getProfile, formatGetProfile)));

      function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
      }

      const patchesTable = `${file}_patches`;
      const patchesFile = `./data/${patchesTable}.json`;

      function getPatches(profile) {
        const { id } = profile;

        let all;
        try {
          all = JSON.parse(require('fs').readFileSync(`${patchesFile}`));
        } catch (e) {
          console.trace(e);
          throw e;
        }

        const patches = all[id] || [];

        return patches;
      }

      function applyPatches(profile) {
        const jsonpatch = require('fast-json-patch');

        const patches = getPatches(profile);

        jsonpatch.apply(profile, patches);

        return profile;
      }

      app.get('/table/:id', (req, res) => {
        const { id } = req.params;

        const profiles = table.get('profiles');
        return res.send(profiles);
        res.send(profiles[id]);
      });

      app.patch('/profiles/:id', (req, res) => {
        const jsonpatch = require('fast-json-patch');

        const { body } = req;
        const { id } = req.params;

        let profile = indices.profiles[id];
        if (!profile) throw httpError(404, 'no such profile');

        profile = clone(profile);

        const patches = getPatches({ id });

        console.log(patches);

        if (!patches.length) {
          postSave({ table: patchesTable, key: id, value: jsonpatch.compare({}, profile) });
        } else {
          jsonpatch.apply(profile, patches);
        }

        const observer = jsonpatch.observe(profile);

        Object.assign(profile, body);

        const patch = jsonpatch.generate(observer);
        if (!patch.length) return res.send('nothing to do');

        return res.send(postAppend({ table: patchesTable, key: id, value: patch }));
      });

      app.get('/patches/:id', (req, res) => {
        const { id } = req.params;

        const patches = getPatches({ id });

        console.log(patches);

        if (!patches.length) throw httpError(404, 'no patches for this profile');

        res.send(patches);
      });

      app.post('/patches/:id/save', (req, res) => {
        const jsonpatch = require('fast-json-patch');

        const { id } = req.params;

        const profile = indices.profiles[id];
        if (!profile) throw httpError(404, 'no such profile');

        applyPatches(profile);

        return res.send('ok');
      });

      app.post('/patches/:id/compact', (req, res) => {
        const jsonpatch = require('fast-json-patch');

        const { id } = req.params;

        const patches = getPatches({ id });

        let profile = indices.profiles[id];
        if (!profile) throw httpError(404, 'no such profile');

        profile = clone(profile);

        const observer = jsonpatch.observe(profile);

        applyPatches(profile);

        return res.send(jsonpatch.generate(observer));
      });

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

      get('/relations', callWithReqQuery(mapRoutes['relations'].getMapField));

      routes.push('');

      get('/suggest/:q', callWithReqParams(getSuggest));

      routes.push('');

      app.post('/save', callWithReqBody(postSave));

      /*
      app.get('/fuzzy/:word', (req, res) => {
        const fuzzies = indices.fuzzy;

        const fuzzy = fuzzies.method(req.params.word);

        const skills = fuzzies[fuzzy];

        res.send({ fuzzy, skills });
      });
       */

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
          .map(file => file.split('.')[0])
//          .filter(file => file.match('huitre'))
          .filter(file => file.match('aka'))
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
