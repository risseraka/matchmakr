var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var url = require('url');
var queryString = require('querystring');

var express = require('express');
var morgan = require('morgan');

function sanitizeHTML(html) {
    return html
        .replace(/src=/g, '')
        .replace(/href=/g, '');
}

function getFilePath(url) {
    return path.join('pages', url.replace(/\//g, '_'));
}

var app = express();

app.use(morgan('dev'));

app.all('*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", req.headers.origin);

    next();
});

app.get('/', function getAllPages(req, res) {
    fs.readdir('pages', function (err, files) {
        if (err) {
            res.statusCode = 500;
            return res.end(err.message);
        }

        res.end(JSON.stringify(files).replace(/_/g, '/'));
    });
});

app.get('/:url', function getPage(req, res) {
    var pageUrl = req.url.slice(1);

    console.log('getting:', pageUrl);

    var filePath = getFilePath(pageUrl);

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.statusCode = 404;
            return res.end('no such page: ' + pageUrl);
        }

        data = sanitizeHTML(data.toString());

        res.end(data);
    });
});

app.post('*', function scrapping(req, res) {
    var pageUrl = req.query.url;

    console.log(req.query);

    if (! pageUrl) {
        res.statusCode = 400;
        return res.end('missing page URL');
    }

    console.log('scrapping:', pageUrl);

    var filePath = getFilePath(pageUrl);

    req.pipe(fs.createWriteStream(filePath));

    req.on('end', function () {
        res.end('okbye ' + req.protocol || 'http');
    });
});

http.createServer(app).listen(3333);

var options = {
    key: fs.readFileSync('ssl/test_key.pem'),
    cert: fs.readFileSync('ssl/test_cert.pem')
};

https.createServer(options, app).listen(8000);
