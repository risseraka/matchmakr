var fs = require('fs');
var path = require('path');
var async = require('async');
var jsdom = require('jsdom');

var win;

jsdom.env('<html></html>', function (err, window) {
    if (err) { return process.exit(1); }

    win = window;
});

function getOne(element, selector, attribute) {
    var el = element.querySelector(selector);

    if (attribute) {
        return el[attribute];
    }

    return el.textContent;
}

function getAll(element, selector) {
    var els = element.querySelectorAll(selector);

    els = Array.prototype.slice.call(els);

    return els.map(function (el) {
        return el.textContent;
    });
}

function parse(html) {
    var el = win.document.createElement('html');

    el.innerHTML = html;

    var id = getOne(el, '[id^=member-]', 'id').split('-')[1];

    var name = getOne(el, 'span[class=full-name]');

    var skills = getAll(el, '.skill-pill > span');

    var companies = getAll(el, '#background-experience h5 a[dir=auto]');

    var titles = getAll(el, '[name=title]');

    var experiences = Array.prototype.slice.call(el.querySelectorAll('#background-experience>div')).map(function (el) {
        return {
            title: el.querySelector('[name=title]').textContent,
            company: el.querySelector('h5 a[dir=auto]').textContent
        };
    });

    return {
        id: id,
        name: name,
        experiences: experiences,
        titles: titles,
        companies: companies,
        skills: skills
    };
}

var filesPaths = Array.prototype.slice.call(process.argv, 2);

async.map(filesPaths, function (filePath, callback) {
    console.log(filePath);

    fs.readFile(filePath, callback);
}, function (err, files) {
    if (err) { return console.error(err); }

    var results = files.map(function (file) {
        return parse(file.toString());
    });

    console.log(results);

    async.eachLimit(results, 20, function (result, callback) {
        fs.writeFile(path.join('profiles', result.id), JSON.stringify(result), callback);
    }, function (err) {
        if (err) { return console.error(err); }
    });

    var indices = results.reduce(function (res, el) {
        res.names.push(el.name);

        el.companies.forEach(function (company) {
            res.companies[company] = (res.companies[company] | 0) + 1;
        });

        el.skills.forEach(function (skill) {
            res.skills[skill] = (res.skills[skill] | 0) + 1;
        });

        return res;
    }, { names: [], companies: {}, skills: {} });

    function sort(index) {
        var keys = Object.keys(index);

        return keys
            .sort(function (a, b) {
                var diff = index[b] - index[a];

                if (diff != 0) {
                    return diff;
                }

                if (a < b) return -1;
                if (b < a) return 1;
                return 0;
            })
            .reduce(function (res, key) {
                res[key] = index[key];
                return res;
            }, {});
    }

    indices.companies = sort(indices.companies);
    indices.skills = sort(indices.skills);

    console.log(indices);
});
