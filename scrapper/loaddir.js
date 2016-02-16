var fs = require('fs');
var path = require('path');
var async = require('async');
var exec = require('child_process').exec;

var directory = 'pages';

fs.readdir(directory, function (err, filesNames) {
  if (err) { process.exit(1); }

  async.whilst(function () {
    return filesNames.length;
  }, function (callback) {
    var files = filesNames.splice(0, 10)
        .map(function (name) {
          return path.join(directory, name);
        });

    console.log(files.length);

    var args = [ 'singleJSDOM.js' ].concat(files);

    console.log(args);

    exec('node ' + args.join(' '), function (err, stdout, stderr) {
      if (err) { return callback(err); }

      callback();
    });
  }, function (err) {
    console.log('all done');
  });
});
