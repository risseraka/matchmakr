const config = require('config');

const { mapObjectToArray } = require('../lib/utils/object');

const db = require('../helpers/db');

exports = module.exports = {
  '/': (req, res, next) => {
    res.send({
      userId: req.session.userId,
      usersDb: db.users.getState(),
    });
  },
  '/:id': (req, res, next) => {
    const { id: userId } = req.params;

    const user = db.users.get(['users', userId]).value();
    if (!user) return res.status(404).send('no such user');

    res.send({
      userId: req.session.userId,
      user,
    });
  },
};
