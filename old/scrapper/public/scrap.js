var async = {};

async.mapSeries = function (arr, iterator, end) {
  var results = [], total = arr.length;

  (function iterate(i) {
    var el = arr[i];

    iterator(el, function (err, res) {
      results.push(res);

      if (err) {
        return end(err);
      }

      if (i < total - 1) {
        return iterate(i + 1);
      }

      return end(null, results);
    });
  }(0));
};

async.mapParallel = function (arr, iterator, end) {
  var results = [],
      total = arr.length,
      completed = 0;

  arr.map(function (el, i) {
    iterator(el, function (err, res) {
      results.push(res);

      if (err) {
        return end(err);
      }

      completed += 1;

      if (completed < total) {
        return;
      }

      return end(null, results);
    });
  });
};


var SCRAP_SERVER = 'https://192.99.12.85:8000/';

function scrap(window, callback) {
  var target = SCRAP_SERVER + '?url=' + encodeURIComponent(window.location.href);

  $.post(target, window.document.documentElement.outerHTML)
    .done(function (data) {
      callback(null, data);
    })
    .fail(function () {
      callback(new Error('failed'));
    });
}

function loadURL(url, callback) {
  var ref = window.open(url);

  ref.addEventListener('load', function () {
    callback(null, ref);
  });
}

// extract contacts IDs, add profile URL

var urls = [].slice.apply($('.conx-list li[id]'))
    .map(function (el) {
      return 'https://www.linkedin.com/profile/view?id=' + el.id;
    });

var urlss = urls.slice(0, 1);

async.mapLimit(urlss, 1, function (url, callback) {
  loadURL(url, function (err, window) {
    if (err) { return callback(err); }

    scrap(window, function (err, data) {
      if (err) { return callback(err); }

      window.close();

      callback(null, data);
    });
  }, function (err, datas) {
    console.log(err, datas);
  });
});
