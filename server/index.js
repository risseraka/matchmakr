const { resolve } = require('path');

const config = require('config');

const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const methodOverride = require('method-override');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const routesLoader = require('./lib/middlewares/routes-loader');

const app = express();

const store = new FileStore({
  path: './data/sessions',
  ttl: 7 * 24 * 60 * 60 * 1000,
  reapInterval: 3600,
});

app.use(morgan('[:date[iso]] :remote-addr :method :url :status :response-time ms - :res[content-length]'));

const setSession = session({
  name: 'karmium-web',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: config.session.secure },
  secret: config.session.secret,
  store,
});

app.use((req, res, next) => {
  // Do not set a cookie on `/logout` route
  const loggingOut = req.originalUrl.match(/^\/logout/);
  if (loggingOut) return next();

  setSession(req, res, next);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

routesLoader(app, resolve('./routes'));

const port = process.argv[2] || config.server.port;

app.listen(port, () => {
  console.info(`running ${process.env.NODE_ENV} on port ${port}`);
});
