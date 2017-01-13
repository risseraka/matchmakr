const config = require('config');

const Linkedin = require('../helpers/linkedin');
const db = require('../helpers/db');

function createUserFromApiProfile(profile) {
  const userId = Object.keys(db.users.get('users').value()).reduce((a, b) => Math.max(+a, +b), 0) + 1;

  const { id: apiId, firstName, lastName, emailAddress: email } = profile;

  const user = {
    id: userId,
    firstName,
    lastName,
    email,
    networks: {
      linkedin: {
        apiId,
      },
    },
  };

  db.users.set(['users', userId], user).value();
  db.users.set(['users_by_api_id', profile.id], userId).value();

  return user;
}

exports = module.exports = {
  '/fake': (req, res, next) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('missing userId param');

    const user = db.users.get(['users', userId]).value();
    if (!user) return res.status(404).send('no such user');

    req.session.userId = user.id;

    res.send({ user });
  },

  '/linkedin': (req, res, next) => {
    Linkedin.auth.authorize(res, Linkedin.scope);
  },
  '/linkedin/callback': (req, res, next) => {
    if (req.query.error) return next(new Error(`${req.query.error}: ${req.query.error_description}`));

    Linkedin.auth.getAccessToken(res, req.query.code, req.query.state, (err, results) => {
      if (err) return next(err);

      const linkedin = Linkedin.init(results.access_token);

      linkedin.people.me(['id', 'firstName', 'lastName', 'emailAddress'], (err, profile) => {
        if (err) return next(err);

        let userId = db.users.get(['users_by_api_id', profile.id]).value();

        if (!userId) {
          /* TODO
          if (req.session.id) {
           // user is already logged in,
           // prompt them before linking profiles.
           // set cookie and wait for confirmation.
          }
          */
          const user = createUserFromApiProfile(profile);
          userId = user.id;
        }

        db.users.set(['users_access_tokens', userId], results).value();

        req.session.userId = userId;

        res.redirect('/users');
      });
    });
  },
};
