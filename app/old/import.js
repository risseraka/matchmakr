'use strict';

var fs = require('fs');
var path = require('path');
var async = require('async');

var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
  host: 'localhost:9200'
});

function getFilePath(id) {
  return './' + path.join('profiles', id);
}

var toLowerCase = Function.prototype.call.bind(String.prototype.toLowerCase);

function importProfile(profile, callback) {
  profile.companies = profile.companies.map(toLowerCase);
  profile.skills = profile.skills.map(toLowerCase);

  client.create({
    index: 'matchmakr',
    type: 'profile',
    body: profile
  }, callback);
}

fs.readdir('profiles', function (err, filesNames) {
  var profiles = filesNames.filter(function (name) {
    return !name.match('gitignore');
  }).map(getFilePath).map(require);

  async.eachLimit(profiles, 10, importProfile, function (err) {
    if (err) {
      console.error(err);
    }

    process.exit(0);
  });
});
