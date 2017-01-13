const config = require('config');

const { appId, secret, callbackUrl } = config.auth.linkedin;

const Linkedin = require('node-linkedin')(appId, secret);
Linkedin.auth.setCallback(callbackUrl);

const scope = [
  'r_basicprofile',
  'r_emailaddress',
];

Linkedin.scope = scope;

exports = module.exports = Linkedin;
