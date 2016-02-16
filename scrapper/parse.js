var fs = require('fs');
var path = require('path');
var async = require('async');
var jsdom = require('jsdom');

function parse(file, html, callback) {
  jsdom.env(html, function (err, window) {
    if (err) { return process.exit(1); }

    var pills = window.document.querySelectorAll('.skill-pill > span');

    pills = Array.prototype.slice.call(pills);

    var skills = pills.map(function (el) {
      return el.textContent;
    });

    return callback(null, skills);
  });
}

var filesPaths = Array.prototype.slice.call(process.argv, 2);

async.map(filesPaths, function (filePath, callback) {
  console.log(filePath);

  fs.readFile(filePath, function (err, file) {
    if (err) { callback(err); }

    console.log('read:', filePath);

    parse(filePath, file.toString(), function (err, skills) {
      if (err) { callback(err); }

      callback(null, skills);
    });
  });
}, function (err, files) {
  console.log(err, filesPaths && filesPaths.length + ' files loaded');

  console.log(files);
});
