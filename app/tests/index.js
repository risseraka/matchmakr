'use strict';

var request = require('http').request;
var async = require('async');

function get(url, callback) {
  request(url, function (res) {
    var data = '';

    res.on('end', function () {
      if (res.statusCode >= 300) {
        return callback(new Error('http error: ' + res.statusCode));
      }

      var result;
      try {
        result = JSON.parse(data);
      } catch (e) {
        console.error(url, 'data:', data);
        throw e;
      }

      callback(null, result);
    });

    res.on('error', function (err) {
      callback(err);
    });

    res.on('data', function (d) {
      data += d;
    });

  }).end();
}

var baseUrl = 'http://192.99.12.85:3000';

var profilesUrl = baseUrl + '/profiles/';

function testProfiles(done) {
  get(profilesUrl, function (err, ids) {
    if (err) { return done(err); }

    // console.log(ids);

    var profilesUrls = ids.map(function (id) {
      return profilesUrl + id;
    });

    async.mapLimit(profilesUrls, 10, get, function (err, profiles) {
      if (err) { return done(err); }

      console.log('profiles:', profiles.length);

      done(null, profiles);
    });
  });
}

var skillsUrl = baseUrl + '/skills/';

function testSkills(done) {
  get(skillsUrl, function (err, skills) {
    // console.log(skills);

    async.mapLimit(skills, 10, function (skill, callback) {
      var url = profilesUrl + '?skill=' + encodeURIComponent(skill);
      get(url, function (err, skillProfiles) {
        if (err) {
          console.trace(err, skill);
          return callback(err);
        }

        callback(null, skillProfiles);
      });
    }, function (err, skillsProfiles) {
      if (err) { return done(err); }

      console.log('skills:', skillsProfiles.length);

      var total = skillsProfiles.reduce(function (total, profiles) {
        return total + profiles.length;
      }, 0);

      console.log('total profiles skills:', total);

      done(null, skillsProfiles);
    });
  });
}

function testNeeds(needType, done) {
  var needTypeUrl = baseUrl + '/needs/' + needType + '/';

  get(needTypeUrl, function (err, needTypes) {
    if (err) { return done(needTypes + err); }

    // console.log(needTypes);

    var needTypeUrls = Object.keys(needTypes).map(function (skill) {
      return needTypeUrl + '?skill=' + encodeURIComponent(skill);
    });

    async.mapLimit(needTypeUrls, 10, get, function (err, needTypeProfiles) {
      if (err) { return done(err); }

      console.log(needType + ':', needTypeProfiles.length);

      done(null, needTypeProfiles);
    });
  });
}

function testProfileNeeds(profile) {
  var profileNeedsUrl = skillsUrl + profile.id + '/matching/needs/';

  var profileRequestsUrl = profileNeedsUrl + 'requests';

  get(profileRequestsUrl, function (err, data) {
    console.log(profileRequestsUrl, err, data);
  });
}

async.parallel({
  profiles: testProfiles,
  skills: testSkills,
  requests: testNeeds.bind(global, 'requests'),
  proposals: testNeeds.bind(global, 'proposals')
}, function (err, results) {
  if (err) return console.trace(err);

  var profile = results.profiles[0];

  if (false)
    testProfileNeeds(profile);
});
