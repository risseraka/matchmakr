const config = require('config');

const db = require('../helpers/db');

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

const templates = {
  contacts: ({ start, count }) => ({
    type: 'contacts',
    uri: `https://www.linkedin.com/connected/api/v2/contacts?start=${start}&count=${count}`,
    target: `https://91.121.140.151:3000/plugins/linkedin/contacts`
  }),
  profile: id => ({
    type: 'profile',
    uri: `https://www.linkedin.com/profile/mappers?id=${id}&x-a=${a}&x-p=${p}`,
    target: `https://91.121.140.151:3000/plugins/linkedin/profile`
  }),
  endorsers: ({ id, skill, token, }) => ({
    type: 'endorsers',
    uri: `https://www.linkedin.com/profile/endorser-info-dialog?recipientId=${id}&skillName=${skill}&csrfToken=${token}`,
    target: `https://91.121.140.151:3000/plugins/linkedin/endorsers`
  }),
};

const start = 0;
const count = 10;

function requireLogin(req, res, next) {
  const userId = req.session.userId;
  console.log('login:', userId);
  if (!userId) return res.status(401).send('not logged in');

  req.userId = userId;

  next();
}

function requireMemberId(field) {
  return (req, res, next) => {
    const { memberId } = req[field];
    if (!memberId) return res.status(401).send('missing memberId param');

    req.memberId = memberId;

    next();
  };
}

function getOrCreateFromProfile(profile) {
  let userId = db.users.get(['users_by_member_id', profile.memberId]).value();

  if (userId) return db.users.get(['users', userId]).value();

  userId = Object.keys(db.users.get('users').value()).reduce((a, b) => Math.max(+a, +b), 0) + 1;

  const { firstName, lastName, memberId } = profile;

  const user = {
    id: userId,
    firstName,
    lastName,
  };

  db.users.set(['users', userId], user).value();
  db.users.set(['users_by_member_id', memberId], userId).value();
  db.users.set(['users', userId, 'networks', 'linkedin', 'memberId'], memberId).value();

  return user;
}

function getOrCreateFromContact(contact) {
  let userId = db.users.get(['users_by_member_id', contact.memberId]).value();

  if (userId) return db.users.get(['users', userId]).value();

  userId = Object.keys(db.users.get('users').value()).reduce((a, b) => Math.max(+a, +b), 0) + 1;

  const { firstName, lastName, memberId } = contact;

  const user = {
    id: userId,
    firstName,
    lastName,
  };

  db.users.set(['users', userId], user).value();
  db.users.set(['users_by_member_id', memberId], userId).value();
  db.users.set(['users', userId, 'networks', 'linkedin', 'memberId'], memberId).value();

  return user;
}

function updateUserContactCrawl(userId, contactUserId) {
  db.users.set(
    ['users_crawl_contacts', userId, contactUserId],
    new Date().toISOString().slice(0, 10)
  ).value();
}

function updateUserContactsPageCrawl(userId, { start, count }) {
  db.users.set(
    ['users_crawl_contact_pages', userId, `${count}_${start}`],
    new Date().toISOString().slice(0, 10)
  ).value();
}

function initUserContactNextPageCrawl(userId, { total, start, count }) {
  total = total | 0;
  start = start | 0;
  count = count | 0;

  start += count;

  if (start > total) {
    return null;
  }

  db.users.set(
    ['users_crawl_contact_pages', userId, `${count}_${start}`],
    new Date(0).toISOString().slice(0, 10)
  ).value();

  return templates.contacts({ start, count });
}

function getNextProfilePage(userId) {
  const profileUserId = db.users
          .get(['users_crawl_contacts', userId])
          .pickBy(date => Date.now() - new Date(date) > 7 * 24 * 60 * 60 * 1000)
          .keys()
          .first()
          .value();

  const profileId = db.users.get(['users', profileUserId, 'networks', 'linkedin', 'memberId']).value();
  if (!profileId) return null;

  return {
    type: 'profile',
    args: profileId,
  };
}

function getNextContactsProfilePage(userId) {
  const page = db.users
          .get(['users_crawl_contact_pages', userId])
          .pickBy(date => Date.now() - new Date(date) > 7 * 24 * 60 * 60 * 1000)
          .keys()
          .map(key => key.split('_'))
          .first()
          .value();
  if (!page) return null;

  const [count, start] = page;

  return {
    type: 'contacts',
    args: { count, start },
  };
}

exports = module.exports = {
  '/linkedin/init': [
    requireLogin,
    requireMemberId('query'),
    (req, res, next) => {
      const { userId, memberId } = req;

      req.session.memberId = memberId;

      db.users.set(['users_by_member_id', memberId], userId).value();
      db.users.set(['users', userId, 'networks', 'linkedin', 'memberId'], memberId).value();

      const links = [
        templates.profile(memberId),
        templates.contacts(start, count)
      ];

      res.send({
        user: db.users.get(['users', userId]).value(),
        memberId,
        links,
      });
    }
  ],
  '/linkedin/next': [
    requireLogin,
    requireMemberId('session'),
    (req, res, next) => {
      const { userId } = req;

      const nextPageObject = getNextContactsProfilePage(userId) ||
              getNextProfilePage(userId);
      const nextPage = nextPageObject ? templates[nextPageObject.type](nextPageObject.args) : null;

      res.send({ nextPage });
    },
  ],
  '/linkedin/contacts': [
    requireLogin,
    requireMemberId('session'),
    (req, res, next) => {
      const { userId, memberId } = req;

      // TODO change to body
      const { paging, values: contacts } = req.query;

      if (!paging || !('count' in paging) || !paging.start || !contacts) return res.send('invalid paging or missing values parameter');

      const contactsUsers = contacts.map(contact => {
        let contactUser = getOrCreateFromContact(contact);

        // TODO: index profile

        updateUserContactCrawl(userId, contactUser.id);

        return contactUser;
      });

      updateUserContactsPageCrawl(userId, paging);

      const nextPageObject = initUserContactNextPageCrawl(userId, paging) ||
            getNextProfilePage(userId);
      const nextPage = nextPageObject ? templates[nextPageObject.type](nextPageObject.args) : null;

      res.send({
        contactsUsers,
        nextPage,
      });
    },
  ],
  '/linkedin/profile': [
    requireLogin,
    requireMemberId('session'),
    (req, res, next) => {
      const { userId, memberId } = req;

      // TODO change to body
      const { profile } = req.query;
      if (!profile.memberId) return res.status(400).send('missing memberId');

      const profileMemberId = +profile.memberId;

      let contactUser = getOrCreateFromProfile(profile);

      // TODO: index profile

      updateUserContactCrawl(userId, contactUser.id);

      const nextPageObject = getNextProfilePage(userId);
      const nextPage = nextPageObject ? templates[nextPageObject.type](nextPageObject.args) : null;

      res.send({
        userId,
        memberId,
        contactUser,
        nextPage,
      });
    },
  ],
};
