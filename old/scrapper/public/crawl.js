(function (window) {
  function getProfilesIds(window) {
    return [].slice
      .apply(window.document.querySelectorAll('a'))
      .map(e => e.href)
      .filter(e => e.match && e.match(/linkedin.com\/profile\/view/))
      .map(e => e.match('id=([^&#]+)')[1]);
  }

  function openProfile(id, callback) {
    var ref = window.open('https://www.linkedin.com/profile/view?id=' + id);
    ref.addEventListener('load', e => callback(ref));
  }

  function closeProfile(ref, callback) {
    setTimeout(() => {
      ref.close.bind(ref);
      callback();
    }, 10000 + Math.random() * 1000);
  }

  function getLinkProfilesLinks(id, callback) {
    openProfile(id, (ref) => {
      var ids = getProfilesIds(ref);
      closeProfile(() => callback(ids));
    });
  }

  function recursive(all, callback) {
    var id = all.shift();
    getLinkProfilesLinks(id, (ids) => {
      all.index[id] = true;
      ids.reduce((r, e) => (e in r.index || r.indexOf(e) !== -1 ? e : r.push(e), r), all);
      callback(all);
    });
  }

  window.launch = function launch(ids) {
    window.launchtimer = setTimeout(function check(ids, i) {
      recursive(ids, (ids) => {
        window.launchtimer = setTimeout(check, 10000 + Math.random() * 10000, ids);
      });
    }, 1000 + Math.random() * 10000, ids);
  };
}(window));
