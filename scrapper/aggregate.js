var fs = require('fs');

function stringSort(a, b) {
    if (b < a) return -1;
    if (a < b) return 1;
    return 0;
}

function arrSort(a, b) {
    return index[b].length - index[a].length;
}

function sortIndex(index, func) {
    var keys = Object.keys(index);

    return keys
        .sort()
        .reduce(function (res, skill) {
            res[skill] = index[skill];
            return res;
        }, {});
}

function aggregate(arr, key, caseSensitive) {
    return arr.reduce(function (res, el) {
        return el[key].reduce(function (res, prop) {
            if (! caseSensitive) {
                prop = prop.toLowerCase();
            }

            if (! res[prop]) {
                var arr = [];
                arr.index = {};
                res[prop] = arr;
            }

            if (! res[prop].index[el.id]) {
                res[prop].push(el);
                res[prop].index[el.id] = true;
            }

            return res;
        }, res);
    }, {});
}

function buildIndex(arr, key, index) {
    index = index || {};

    return arr.reduce(function (res, el) {
        res[el[key]] = el;
        return res;
    }, index);
}

var files = fs.readdirSync('profiles');

var profiles = files.map(function (file) {
    return require('./' + 'profiles' + '/' + file);
});

var profilesIndex = buildIndex(profiles, 'id');

var skills = aggregate(profiles, 'skills');

skills = sortIndex(skills, arrSort);

var allSkills = Object.keys(skills);

if (false)
allSkills.slice(0, 20).forEach(function (key) {
    console.log(key + ' (' + skills[key].length + ')', '' && '\t:' + skills[key].map(function (profile) {
        return profile.name;
    }).join(' | '));
});

console.log(allSkills);

fs.writeFileSync('skills.json', JSON.stringify(allSkills));

process.exit(0);
