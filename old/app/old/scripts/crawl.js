'use strict';

var async = require('async');
var request = require('request');
var List = require('term-list');

var baseUri = 'http://192.99.12.85:3000';

var explore = process.argv[2] === 'explore';

function createList(arr, callback) {
  var list = new List({ marker: '\x18[36m› \x18[0m', markerLength: 2 });

  arr.forEach(function (el) {
    list.add(el, el);
  });

  list.start();

  list.on('keypress', function(key, item) {
    switch (key.name) {
    case 'return':
      list.stop();
      callback(null, item);
      break;
    case 'escape':
    case 'q':
      process.exit(0);
    }
  });
}

function get(uri, callback) {
  console.log(uri);
  request.get({ uri: uri, json: true }, function (err, res, body) {
    if (err) {
      console.error(uri, err.message);
      process.exit(1);
      return callback(err);
    }

    callback(null, body);
  });
}

var index = {};

function addLink(links, link) {
  if (link.rel === 'nofollow') { return; }

  var href = link.href;

  if (! index[href] || explore) {
    index[href] = true;
    links.push(href);
  }
}

function crawl(uri, callback) {
  get(uri, function (err, body) {
    if (err) { return callback(err); }

    if (! body._links) { return callback(null); }

    var links = Object.keys(body._links).reduce(function (links, key) {
      var link = body._links[key];

      if (key === 'self') {
        return links;
      }

      if (!Array.isArray(link)) {
        link = [ link ];
      }

      link.forEach(addLink.bind(this, links));

      return links;
    }, []);

    if (explore) {
      createList(links, function (err, value) {
        if (err) { return callback(err); }

        crawl(value, callback);
      });

      delete body._links;

      console.log(body);
    } else {
      async.each(links, crawl, callback);
    }
  });
}

crawl(baseUri, function (err) {
  if (err) {
    console.error(err);
  }

  var hrefs = Object.keys(index);

  console.log('done', hrefs.length, 'links');
});
