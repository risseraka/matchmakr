const config = require('config');

exports = module.exports = {
  '/': (req, res, next) => {
    res.send({});
  },
  '/logout': (req, res, next) => {
    const end = () => res.send('logged out');

    // Expire client-side cookie if any
    res.cookie('karmium-web', '', { expires: new Date() });

    // No session to destroy, do nothing
    if (!req.session) return end();
    req.session.destroy(end);
  },
};
