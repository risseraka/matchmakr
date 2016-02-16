'use strict';

var async = require('async');
var request = require('request');

var baseUri = 'http://localhost:3000/forms';

function get(uri, callback) {
  request.get({ uri: uri, json: true }, function (err, res, body) {
    if (err) {
      console.error(uri, err);
      return callback(err);
    }

    callback(null, body);
  });
}

var index = {};

function addLink(links, link) {
  if (link.rel === 'nofollow') return;

  var href = link.href;

  if (! index[href]) {
    index[href] = true;
    links.push(href);
  }
}

function crawl(uri, callback) {
  get(uri, function (err, body) {
    if (err) { return callback(err); }

    if (! body._links) { return callback(null, body); }

    delete body._links.self;
    delete body._links.index;

    var links = Object.keys(body._links)
        .slice(0, 1)
        .reduce(function (links, key) {
          var link = body._links[key];

          if (! Array.isArray(link)) {
            link = [ link ];
          }

          link.forEach(addLink.bind(this, links));

          return links;
        }, []);

    if (links.length === 1) {
      return crawl(links.shift(), callback);
    }

    async.map(links, crawl, function (err, result) {
      console.log(result);

      callback(err, body);
    });
  });
}

crawl(baseUri, function (err, result) {
  if (err) {
    console.error(err);
  }

  var res = (function shiftRec(arr) {
    if (! Array.isArray(arr)) {
      return arr;
    }

    var res = shiftRec(arr.shift());

    return res;
  }(result));

  delete res._links;

  console.log(res);

  request(res, function (err, res, body) {
    console.log(body);
  });
});
