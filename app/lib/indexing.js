'use strict';

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function indexingAt(items, i) {
  if (! i) {
    i = 0;
  }

  var index = {};

  items.reduce(function (index, item) {
    var car = ((item.name || item)[i] || '').toLowerCase();

    if (! index[car]) {
      index[car] = [];
    }

    index[car].push(item);

    return index;
  }, index);

  return index;
}

function filterStartingWith(items, path) {
  var escapedPath = escapeRegExp(path);

  return items.filter(function (item) {
    return (item.name || item).match(new RegExp('^' + escapedPath, 'i'));
  });
}

function indexing(items, path) {
  if (path) {
    items = filterStartingWith(items, path);
  }

  var index, keys, walk = path.length, result = {};

  path = '';

  do {
    index = indexingAt(items, walk);

    keys = Object.keys(index);

    if (keys.length === 1) {
      path += keys[0];
    }

    walk += 1;
  } while (keys.length === 1 && index[keys[0]].length > 1);

  keys.reduce(function (result, key) {
    result[path + key] = index[key];

    return result;
  }, result);

  return result;
}

module.exports = indexing;
