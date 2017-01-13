const config = require('config');

const Linkedin = require('../helpers/linkedin');
const db = require('../helpers/db');

const fields = [
  'id', 'first-name', 'last-name', 'maiden-name',
  'formatted-name', 'headline', 'location',
  'industry', 'current-share', 'num-connections', 'num-connections-capped',
  'summary', 'specialties', 'positions', 'picture-url','picture-urls::(original)',
  'email-address', 'last-modified-timestamp', 'associations', 'interests',
  'publications', 'patents', 'languages', 'skills', 'certifications',
  'educations', 'courses', 'volunteer', 'num-recommenders',
  'recommendations-received', 'mfeed-rss-url', 'following', 'job-bookmarks',
  'suggestions', 'date-of-birth', 'related-profile-views', 'honors-awards',
  'phone-numbers', 'bound-account-types', 'im-accounts', 'main-address',
  'twitter-accounts', 'primary-twitter-account', 'connections', 'group-memberships',
  'network', 'public-profile-url'
];

function initLinkedin(req, res, next) {
  const { userId } = req.session;

  const token = req.query.access_token ?
          JSON.parse(req.query.access_token) :
          db.users.get(['users_access_tokens', userId]).value();

  const accessToken = token && (token.accessToken || token.access_token);
  if (!accessToken) return res.status(401).send('missing access token');

  req.linkedin = Linkedin.init(accessToken);

  next();
}

exports = module.exports = {
  '/me': [
    initLinkedin,
    (req, res, next) => {
      req.linkedin.people.me((err, result) => {
        if (err) return next(err);

        res.send(result);
      });
    }
  ],
  '/people': [
    initLinkedin,
    (req, res, next) => {
      const { peopleId, peopleUrl } = req.query;
      if (!peopleId && !peopleUrl) return res.status(400).send('missing peopleId or peopleUrl param');

      req.linkedin.people[peopleId ? 'id' : 'url'](peopleId || peopleUrl, fields, (err, result) => {
        if (err) return next(err);

        res.send(result);
      });
    }
  ],
};
