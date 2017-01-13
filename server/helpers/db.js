const lowdb = require('lowdb');

const { mapToObject } = require('../lib/utils/array');

const bases = ['users'];

const db = mapToObject(bases, base => lowdb(`./data/${base}.json`));

exports = module.exports = db;
