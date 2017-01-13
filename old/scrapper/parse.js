const fs = require('fs');
const path = require('path');

function pluck(obj/*, ...fields*/) {
  const fields = Array.prototype.slice.call(arguments, 1);
  return fields.reduce((r, f) => (obj[f] && (r[f] = obj[f]), r), {});
}

function pick(arr/*, ...fields*/) {
  const fields = Array.prototype.slice.call(arguments, 1);
  return arr.map(obj => fields.reduce((r, f) => {
    if (Array.isArray(f)) {
      r[f[0]] = f[1](obj);
      return r;
    }
    obj[f] && (r[f] = obj[f]);
    return r;
  }, {}));
}

function getDirPath(id) {
  return path.join('pages', id);
}

function getIndexPath(id) {
  return path.join('pages', `${id}.json`);
}

function getPageIdPath(id, pageId) {
  return path.join('pages', id, pageId);
}

function loadPages(pages) {
  return pages.map(page => {
    const data = fs.readFileSync(page.path);
    try {
      return JSON.parse(data);
    } catch (e) {
    }
    return {};
  });
}

const parse = {
  info(data) {
    const info = data.BasicInfo.basic_info;
    const contactInfo = (data.ContactInfo || {}).contact_info || {};

    const { fullname: name, location_highlight: location } = info;
    const { phones = [], emails = [] } = contactInfo;

    return {
      id: info.memberID,
      name,
      location,
      emails: emails.map(email => email.email),
      phones: phones.map(phone => phone.number),
    };
  },
  skills(data) {
    const skills = data.Skills.skillsMpr.skills;
    if (!skills) return [];

    return pick(
      skills,
      'name',
      'endorsementCount',
      ['endorsers', s => (s.endorserInfo || []).map(i => i.endorserId)]
    );
  },
  positions(data) {
    const positions = data.Experience.positionsMpr.positions;
    if (!positions) return [];

    return positions.map(p => Object.assign(pluck(
      p,
      'companyName', 'title', 'locationName', 'startDate', 'endDate'
    ), {
      startDate: p.startDate && p.startDate.asDate,
      endDate: p.endDate && p.endDate.asDate
    }));
  },
};

const memberId = process.argv[2];

const dirPath = getDirPath(memberId);

const indexPath = getIndexPath(memberId);
const index = fs.existsSync(indexPath) ?
        JSON.parse(fs.readFileSync(indexPath)) : {};

const pages = Object.keys(index)
  .map(pageId => ({
    pageId,
    pageUrl: index[pageId],
    path: getPageIdPath(memberId, pageId),
  }));

const connections = loadPages(
  pages.filter(page => page.pageUrl.match('api/v2/contacts'))
).reduce((r, data) => {
  if (!data) return r;

  return r.concat(pick(
    data.values,
    'memberId',
    ['profileUrl', s => s.profileUrl.split('&authType')[0]]
  ));
}, []).reduce((r, c) => {
  r[c.memberId] = c;
  c.id = c.memberId;
  delete c.memberId;
  return r;
}, {});

const contacts = loadPages(
  pages.filter(page => page.pageUrl.match('profile/mappers'))
).map(e => e.content);

const result = contacts
  .map(data => {
    const info = parse.info(data);

    const result = Object.assign(
      info,
      connections[info.id],
      {
        skills: parse.skills(data),
        positions: parse.positions(data),
      }
    );

    return result;
  });

fs.writeFileSync('contacts.json', JSON.stringify(result));
