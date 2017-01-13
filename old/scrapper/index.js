const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const queryString = require('querystring');

const express = require('express');
const morgan = require('morgan');
const crypto = require('crypto');

function hash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function sanitizeHTML(html) {
  return html
    .replace(/src=/g, '')
    .replace(/href=/g, '');
}

function getDirPath(id) {
  return path.join('pages', id);
}

function getIndexPath(id) {
  return path.join('pages', `${id}.json`);
}

function hashUrl(url) {
  return hash(url.replace(/\//g, '_'));
}

function getFilePath(id, url) {
  return path.join('pages', id, hashUrl(url));
}

function getPageIdPath(id, pageId) {
  return path.join('pages', id, pageId);
}

function saveToIndex(memberId, pageUrl) {
  const indexPath = getIndexPath(memberId);
  const index = fs.existsSync(indexPath) ?
          JSON.parse(fs.readFileSync(indexPath)) : {};
  index[hashUrl(pageUrl)] = pageUrl;
  fs.writeFileSync(indexPath, JSON.stringify(index));
}

function assertDirPath(memberId) {
  const dirPath = getDirPath(memberId);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
}

const app = express();

app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));

app.all('*', function (req, res, next) {
  res.header('Access-Control-Allow-Origin', req.headers.origin);

  next();
});

app.get('/', function getAllMembers(req, res) {
  fs.readdir('pages', function (err, members) {
    if (err) {
      res.statusCode = 500;
      return res.end(err.message);
    }

    const html = members
            .filter(e => e.match('^[0-9]+$'))
            .map(e => `<a href="/${e}/pages">${e}</a>`)
            .join('<br/>');

    res.end(html);
  });
});

app.get('/scrapper.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');

  fs.createReadStream('public/simple-scrap.js').pipe(res);
});

app.get('/:id/pages', function getAllPages(req, res) {
  const memberId = req.params.id;

  const indexPath = getIndexPath(memberId);

  if (!fs.existsSync(indexPath)) {
    return res.status(404).send('no such member');
  }

  const index = JSON.parse(fs.readFileSync(indexPath));

  const files = Object.keys(index);

  const html = files
          .map(e => `<a href="/${memberId}/pages/${e}">${index[e]}</a>`)
          .join('<br/>');

  res.end(html);
});

app.get('/:id/pages/:pageId', function getPage(req, res) {
  const { id: memberId, pageId } = req.params;

  const indexPath = getIndexPath(memberId);

  const index = fs.existsSync(indexPath) ?
          JSON.parse(fs.readFileSync(indexPath)) : {};

  const filePath = getPageIdPath(memberId, pageId);

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.statusCode = 404;
      return res.end(`no such page: ${pageId}`);
    }

    data = sanitizeHTML(data.toString());

    res.end(data);
  });
});

app.post('/:id/scrap', function scrapping(req, res) {
  const memberId = req.params.id;

  const pageUrl = req.query.url;

  if (! pageUrl || ! memberId) {
    res.statusCode = 400;
    return res.end('missing page URL or member id');
  }

  console.log('member:', memberId, 'is scrapping:', pageUrl);

  assertDirPath(memberId);

  const filePath = getFilePath(memberId, pageUrl);

  req.pipe(fs.createWriteStream(filePath));
  req.on('end', function () {
    res.end('okbye ' + req.protocol || 'http');
  });

  saveToIndex(memberId, pageUrl);
});

const port = 3333;

http.createServer(app).listen(port, () => console.warn(`Listening on port ${port}`));

if (true) {
  const options = {
    key: fs.readFileSync('ssl/test_key.pem'),
    cert: fs.readFileSync('ssl/test_cert.pem')
  };

  https.createServer(options, app).listen(3334);
}
