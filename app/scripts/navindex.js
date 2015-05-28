'use strict';

var async = require('async');
var request = require('request');

var baseUri = 'http://localhost:3000/profiles/?index=profile';

function get(uri, callback) {
    request.get({ uri: uri, json: true }, function (err, res, body) {
        if (err) {
            console.error(uri, err);
            return callback(err);
        }

        callback(null, body);
    });
}

function crawlLinks(result, next) {
    var keys = result._links.keys;

    async.each(keys, function (link, callback) {
        if (link.rel !== 'index') {
            console.log(link.name);
            return callback();
        }

        return get(link.href, function (err, body) {
            if (err) { return callback(err); }

            return crawlLinks(body, callback);
        });
    }, next);
}

var readline = require('readline');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var init = true;

var path, result;

get(baseUri, function start(err, index) {
    if (err) {
        console.error(err);
    }

    result = index;

    console.log(result._links.keys.map(function (link) {
        return link.key + ' ' + (link.name || '');
    }).join('\n'));

    path = '';

    if (! init) {
        return;
    }

    init = false;

    rl.on('line', function (char) {
        path += char;

        console.log('fetching...', path);

        var links = result._links.keys.filter(function (link) {
            return link.key === char;
        });

        if (links.length > 0) {
            get(links[0].href, function (err, res) {
                if (err) {
                    console.log(err);
                    process.exit(1);
                }

                result = res;

                var keys = result._links.keys;

                if (!keys) {
                    console.log(result);
                    return start(null, index);
                }

                console.log(keys.map(function (link) {
                    if (link.name) {
                        var pos = result.path.length;

                        link.name = link.name.substr(0, pos) +
                            '[' + link.name[pos] + ']' +
                            link.name.substr(pos + 1);
                    }

                    return link.key + ' ' + (link.name || '');
                }).join('\n'));
            });
        }
    });
});
