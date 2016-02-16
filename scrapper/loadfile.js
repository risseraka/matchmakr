var fs = require('fs');
var path = require('path');
var async = require('async');

var filePath = process.argv[2];

if (! filePath) {
  process.exit(1);
}

fs.readFile(filePath, function (err, file) {
  if (err) { process.exit(1); }

  console.log(file.toString().length);
});
