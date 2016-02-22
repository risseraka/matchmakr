'use strict';

var std = [
  'http', 'https', 'fs', 'path', 'url', 'querystring'
].reduce(function (std, name) {
  std[name] = require(name);

  return std;
}, {});

var async = require('async');

var elasticsearch = require('elasticsearch');

var client = new elasticsearch.Client({
  host: 'localhost:9200'
});

var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var cors = require('cors');
var compression = require('compression')
var linksAbsolutizer = require('hal-url-absolutizer');

var jsonformatter = require('./lib/jsonformatter');

var formatter = new jsonformatter.JSONFormatter();

var indexing = require('./lib/indexing');

var app = express();

var mappings = std.fs.readdirSync('mappings').reduce(function (mappings, fileName) {
  mappings[std.path.basename(fileName, '.json')] = require('./mappings/' + fileName);

  return mappings;
}, {});

function inValues(values) {
  return function (val) {
    return values.indexOf(val) !== -1;
  };
}

function notEq(comp) {
  return function (val) {
    return val !== comp;
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function stringSortByField(field) {
  return function (a, b) {
    if (b[field] > a[field]) { return -1; }
    if (b[field] < a[field]) { return 1; }
    return 0;
  };
}

function asArray(obj) {
  if (!Array.isArray(obj)) {
    obj = [ obj ];
  }

  return obj;
}

function getProfileUrl(id) {
  return '/profiles/' + id;
}

app.use(cors({
  credentials: true,
  origin: function (origin, callback) {
    callback(null, true);
  }
}));

app.use(morgan('common'));
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(function (req, res, next) {
  req.baseUri = req.protocol + '://' + req.get('host');
  req.uri = req.baseUri + req.originalUrl;

  next();
});

function passResult(middleware) {
  return function (req, res, next) {
    middleware(req, res, function (err, result) {
      if (err) { return next(err); }

      req.result = result;

      next();
    });
  };
}

function addProfileLinks(profile) {
  var links = buildProfileLinks(profile);

  profile._links = links;

  return profile;
}

function buildProfileResource(profile) {
  profile = profile._source;

  return addProfileLinks(profile);
}

function sendProfile(req, res, next) {
  var profile = buildProfileResource(req.profile);

  res.result = profile;

  next();
}

function sendProfilesResults(req, res, next) {
  var profiles = req.result;

  var profilesLinks = {};

  if (profiles.length > 0) {
    var links = profiles.map(function (profile) {
      return {
        title: profile.name,
        href: getProfileUrl(profile.id)
      };
    }).sort(stringSortByField('href'));

    profilesLinks.profiles = links;
  }

  Object.keys(mappings.profile.properties).reduce(function (needsLinks, field) {
    if (field === 'id') { return needsLinks; }

    var label = field === 'name' ? 'profiles' : field;

    needsLinks['searchBy' + capitalize(field)] = {
      href: '/index/' + label + '?next=' + encodeURIComponent(req.uri)
    };

    return needsLinks;
  }, profilesLinks);

  res.result = {
    total: profiles.total,
    _links: profilesLinks,
    _embedded: {
      profiles: profiles.map(addProfileLinks)
    }
  };

  next();
}

function handleProfilesResults(next) {
  return function (err, result) {
    if (err) { return next(err); }

    var profiles = result.hits.hits.map(function (profile) {
      return profile._source;
    }).sort(stringSortByField('name'));

    profiles.total = result.hits.total;

    next(null, profiles);
  };
}

app.get('/', function (req, res, next) {
  res.result = {
    _links: {
      profiles: {
        href: './profiles'
      },
      skills: {
        href: './skills'
      },
      companies: {
        href: './companies'
      },
      needs: {
        href: './needs'
      },
      indices: {
        href: './index'
      },
      forms: {
        href: './forms',
        rel: 'nofollow'
      }
    }
  };

  next();
});

function fetchAllProfileFields(field) {
  return function (next) {
    client.search({
      index: 'matchmakr',
      type: 'profile',
      body: {
        aggs: {
          items: {
            terms: {
              size: 0,
              field: field,
              order : { _term : 'asc' }
            }
          }
        }
      }
    }, function (err, result) {
      if (err) { return next(err); }

      var items = result.aggregations.items.buckets.map(function (item) {
        return {
          total: item.doc_count,
          title: item.key,
          href: '/profiles/?' + field + '=' + encodeURIComponent(item.key)
        };
      });

      next(null, items);
    });
  };
}

function fetchOneProfile(id, next) {
  client.search({
    index: 'matchmakr',
    type: 'profile',
    size: 1,
    body: {
      query: {
        term: {
          id: id
        }
      }
    }
  }, next);
}

function countAllProfiles(next) {
  client.count({
    index: 'matchmakr',
    type: 'profile'
  }, function (err, result) {
    if (err) { return next(err); }

    var profiles = [];
    profiles.total = result.count;

    next(null, profiles);
  });
}

function fetchAllProfiles(match, next) {
  if (! next) {
    next = match;
    match = '';
  }

  var query = match ? {
    match: {
      _all: match
    }
  } : {
    match_all: {
    }
  };

  client.search({
    index: 'matchmakr',
    type: 'profile',
    size: 1000,
    body: {
      query: query
    }
  }, handleProfilesResults(next));
}

function fetchAllNeedFields(field) {
  return function (next) {
    next(null, [ 'requests', 'proposals' ]);
  };
}

var fetchAll = {
  profiles: fetchAllProfiles,
  skills: fetchAllProfileFields('skills'),
  companies: fetchAllProfileFields('companies'),
  type: fetchAllNeedFields('type')
};

var countAll = {
  profiles: countAllProfiles
};

var types = [ 'profiles', 'skills', 'companies' ];

var indexRouter = express.Router();

indexRouter.get('/', function (req, res, next) {
  res.result = {
    _links: types.reduce(function (links, type) {
      links[type] = {
        href: './' + type
      };

      return links;
    }, {})
  };

  next();
});

indexRouter.get('/:type/:path?', passResult(function (req, res, next) {
  var type = req.params.type;

  if (! fetchAll[type]) { return next(); }

  return fetchAll[type](next);
}), function (req, res, next) {
  var type = req.params.type;

  if (!req.query[type]) {
    return next();
  }

  if (req.query.next) {
    var nextUri = req.query.next +
        (req.query.next.match('\\?') ? '&' : '?') +
        type + '=' + req.query[type];

    return res.redirect(nextUri);
  }

  return res.redirect('/' + type + '/' + encodeURIComponent(req.query[type]));
}, function (req, res, next) {
  var result = req.result;

  if (! result || result.length < 1) {
    return next();
  }

  var path = req.params.path || '';

  var index = indexing(result, path);

  var keys = Object.keys(index);

  if (keys.length < 1) {
    return next();
  }

  var links = {};

  var fullPath = path + keys[0].substr(0, keys[0].length - 1);

  if (path) {
    links.back = {
      href: path.length === 1 ? '..' : path.substr(0, path.length - 1)
    };
  }

  var type = req.params.type;

  links.keys = keys.map(function (key) {
    var items = index[key];
    var item = items[0];
    var title = item.title || item.name || item;

    var link = items.length === 1 ? {
      title: title,
      rel: type,
      href: '&' + type + '=' + title,
      key: key.substr(-1)
    } : {
      rel: 'index',
      href: {
        path: encodeURIComponent(key),
        mergePath: path ? true : false,
        joinPath: path ? false : true
      },
      key: key.substr(-1)
    };

    return link;
  }, {});

  res.result = {
    path: fullPath,
    _links: links
  };

  next();
});

app.use('/index', indexRouter);

var skillRouter = express.Router();

skillRouter.get('/', passResult(function (req, res, next) {
  fetchAll.skills(next);
}), function (req, res, next) {
  var skills = req.result;

  if (req.query.q) {
    var q = escapeRegExp(req.query.q);

    skills = skills.filter(function (skill) {
      return skill.name.match(q);
    });
  }

  res.result = {
    _links: {
      skills: skills
    }
  };

  next();
});

skillRouter.get('/:skill', function (req, res, next) {
  return res.redirect('/profiles?' + 'skills' + '=' + req.params.skill);
});

app.use('/skills', skillRouter);

var formsRouter = express.Router();

formsRouter.get('/', function (req, res, next) {
  res.result = {
    _links: {
      needs: {
        href: './needs'
      }
    }
  };

  next();
});

formsRouter.get('/needs', function (req, res, next) {
  res.result = {
    _links: {}
  };

  if (req.query.profiles && req.query.skills && req.query.type) {
    var parsed = std.url.parse(req.url, true);

    delete parsed.query.path;

    res.result = {
      uri: req.baseUri + '/needs',
      method: 'POST',
      json: true,
      body: parsed.query,
      _links: {
        create: {
          href: {
            path: '/needs?create',
            joinQuery: true
          },
          rel: 'nofollow'
        }
      }
    };
  }

  var links = res.result._links || {};

  var query = Object.keys(req.query);

  var params = [ 'profiles', 'skills', 'type' ];

  params.reduce(function (links, type) {
    var link = {
      title: type,
      href: '/index/' + type + '?next=' + encodeURIComponent(req.uri)
    };

    if (req.query[type]) {
      link.rel = 'nofollow';
    }

    links['choose' + capitalize(type)] = link;

    return links;
  }, links);

  res.result._links = links;

  next();
});

app.use('/forms', formsRouter);

var companiesRouter = express.Router();

companiesRouter.get('/', passResult(function (req, res, next) {
  fetchAll.companies(next);
}), function (req, res, next) {
  var companies = req.result;

  if (req.query.q) {
    var q = escapeRegExp(req.query.q);

    companies = companies.filter(function (company) {
      return company.name.match(q);
    });
  }

  res.result = {
    _links: {
      companies: companies
    }
  };

  next();
});

companiesRouter.get('/:company', function (req, res, next) {
  return res.redirect('/profiles?' + 'companies' + '=' + req.params.company);
});

app.use('/companies', companiesRouter);

var internals = {};

internals.needs = {
  requests: {},
  proposals: {}
};

internals.needsTypes = Object.keys(internals.needs);

function getOtherNeedType(needType) {
  var types = internals.needsTypes.slice();

  types.splice(types.indexOf(needType), 1);

  var otherNeedType = types.shift();

  return otherNeedType;
}

function createNeeds(req, res, next) {
  var profiles = asArray(req.body.profiles);

  req.body.skills = asArray(req.body.skills);

  async.map(profiles, function (profileId, callback) {
    if (! profileId) { return callback; }

    var body = req.body;

    body.profiles = profileId;

    client.create({
      index: 'matchmakr',
      type: 'needs',
      body: body
    }, callback);
  }, function (err, results) {
    if (err) { return next(err); }

    async.map(results, function (result, callback) {
      fetchOneNeed(result._id, callback);
    }, function (err, result) {
      if (err) { return next(err); }

      var fakeResult = {
        hits: {
          total: result.length,
          hits: result
        }
      };

      handleNeedsResults(next)(null, fakeResult);
    });
  });
}

function addNeedsLinks(links, needs) {
  return needs.reduce(function (links, need) {
    var id = need.profiles;
    var needType = need.type;

    if (! links[needType]) {
      links[needType] = [];
    }

    links[needType].push({
      href: '/needs/' + need._id
    });

    return links;
  }, links);
}

function sendNeedsResults(req, res, next) {
  var needs = req.result;

  var needsLinks = {};

  addNeedsLinks(needsLinks, needs);

  Object.keys(mappings.needs.properties).reduce(function (needsLinks, field) {
    if (field === 'profile') {
      field += 's';
    }

    needsLinks['searchBy' + capitalize(field)] = {
      href: '/index/' + field + '?next=' + encodeURIComponent(req.uri)
    };

    return needsLinks;
  }, needsLinks);

  needsLinks.form = {
    href: '/forms/needs'
  };

  res.result = {
    total: needs.total,
    _links: needsLinks,
    _embedded: {
      needs: needs.map(addNeedLinks)
    }
  };

  next();
}

var needsRouter = express.Router();

needsRouter.post('/', passResult(createNeeds), sendNeedsResults);

function createNeedsFromGet(req, res, next) {
  delete req.query.create;

  req.body = req.query;

  createNeeds(req, res, next);
}

function getAllNeeds(req, res, next) {
  if ('create' in req.query) {
    return createNeedsFromGet(req, res, next);
  }

  if (req.query.skills || req.query.profiles) {
    return fetchAllNeedsBy(req.query, next);
  }

  fetchAllNeeds(req.query.type, next);
}

needsRouter.get('/', passResult(getAllNeeds), sendNeedsResults);

function buildNeedLinks(need) {
  var skillsLinks = need.skills.map(function (skill) {
    return {
      title: skill,
      href: '/skills/' + encodeURIComponent(skill)
    };
  });

  var links = {
    profile: {
      href: getProfileUrl(need.profiles)
    },
    matching: {
      href: './matching'
    },
    similar: {
      href: './similar'
    },
    matchingProfiles: {
      href: '/profiles?' + need.skills.map(function (skill) {
        return 'skills=' + encodeURIComponent(skill);
      }).join('&')
    },
    skills: skillsLinks
  };

  links[need.type] = {
    href: '/needs?type=' + need.type
  };

  return links;
}

function addNeedLinks(need) {
  var links = buildNeedLinks(need);

  need._links = links;

  return need;
}

function buildNeedResource(need) {
  need = need._source;

  return addNeedLinks(need);
}

function handleNeedsResults(next) {
  return function (err, result) {
    if (err) { return next(err); }

    var needs = result.hits.hits.map(function (need) {
      need._source._id = need._id;
      return need._source;
    }).sort(stringSortByField('type'));

    needs.total = result.hits.total;

    next(null, needs);
  };
}

function getOneNeed(req, res, next) {
  var id = req.params.needId;

  fetchOneNeed(id, function (err, result) {
    if (err) { return next(err); }

    if (! result) {
      return res.sendStatus(404);
    }

    req.need = result;

    next();
  });
}

needsRouter.param('needId', getOneNeed);

function sendNeed(req, res, next) {
  var need = req.need;

  var needResource = buildNeedResource(need);

  res.result = needResource;

  next();
}

needsRouter.get('/:needId', sendNeed);

function deleteNeed(req, res, next) {
  client.delete({
    index: 'matchmakr',
    type: 'needs',
    id: req.params.needId
  }, function (err, result) {
    if (err) { return next(err); }

    res.result = {
    };

    next();
  });
}

needsRouter.delete('/:needId', deleteNeed);

function fetchAllNeedsBy(query, next) {
  var mustQuery = Object.keys(query)
      .filter(inValues(Object.keys(mappings.needs.properties)))
      .map(function (prop) {
        var q = {}, qType = {};

        var value = query[prop];

        q[Array.isArray(value) ? 'terms' : 'term'] = qType;

        qType[prop] = query[prop];

        return q;
      });

  client.search({
    index: 'matchmakr',
    type: 'needs',
    size: 1000,
    body: {
      query: {
        bool: {
          must: mustQuery
        }
      }
    }
  }, handleNeedsResults(next));
}

function fetchAllNeeds(needType, next) {
  if (! next) {
    next = needType;
    needType = '';
  }

  client.search({
    index: 'matchmakr',
    type: 'needs',
    size: 1000,
    body: {
      query: needType ? {
        terms: {
          type: asArray(needType)
        }
      }: {
        match_all: {}
      }
    }
  }, handleNeedsResults(next));
}

function fetchOneNeed(id, next) {
  client.get({
    index: 'matchmakr',
    type: 'needs',
    size: 1,
    id: id
  }, function (err, result) {
    if (err) {
      if (err.message === 'Not Found') {
        return next(null, null);
      }

      return next(err);
    }

    next(null, result);
  });
}

function fetchSimilarNeeds(req, res, next) {
  var need = req.need._source;
  var id = req.need._id;

  client.search({
    index: 'matchmakr',
    type: 'needs',
    size: 1000,
    body: {
      query: {
        bool: {
          must: [{
            terms: {
              skills: need.skills
            }
          }, {
            terms: {
              types: [ need.type ]
            }
          }],
          must_not: [{
            ids: {
              values: [ id ]
            }
          }]
        }
      }
    }
  }, handleNeedsResults(next));
}

function fetchMatchingNeeds(req, res, next) {
  var need = req.need._source;

  var needType = getOtherNeedType(need.type);

  client.search({
    index: 'matchmakr',
    type: 'needs',
    size: 1000,
    body: {
      query: {
        bool: {
          must: [{
            terms: {
              skills: need.skills
            }
          }, {
            term: {
              type: needType
            }
          }]
        }
      }
    }
  }, handleNeedsResults(next));
}

function fetchProfileNeeds(profile, needTypes, next) {
  client.search({
    index: 'matchmakr',
    type: 'needs',
    size: 1000,
    body: {
      query: {
        bool: {
          must: [{
            terms: {
              profiles: [ profile.id ]
            }
          }, {
            terms: {
              type: asArray(needTypes)
            }
          }]
        }
      }
    }
  }, handleNeedsResults(next));
}

needsRouter.get('/:needId/matching', passResult(fetchMatchingNeeds), sendNeedsResults);

needsRouter.get('/:needId/similar', passResult(fetchSimilarNeeds), sendNeedsResults);

app.use('/needs', needsRouter);

function fetchAllProfilesBy(query, next) {
  var shouldQuery = Object.keys(query)
      .filter(inValues(Object.keys(mappings.profile.properties)))
      .reduce(function (shoulds, prop) {
        var value = query[prop];

        asArray(value).forEach(function (value) {
          var q = { term: {} };

          q.term[prop] = value;

          shoulds.push(q);
        });

        return shoulds;
      }, []);

  client.search({
    index: 'matchmakr',
    type: 'profile',
    size: 1000,
    body: {
      query: {
        bool: {
          should: shouldQuery,
          'minimum_should_match': shouldQuery.length
        }
      }
    }
  }, handleProfilesResults(next));
}

function getAllProfiles(req, res, next) {
  if (req.query.profiles) {
    return res.redirect('/' + 'profiles' + '/' + encodeURIComponent(req.query.profiles));
  }

  if (req.query.skills || req.query.companies || req.query.name) {
    return fetchAllProfilesBy(req.query, next);
  }

  if (req.query.q) {
    return fetchAll.profiles(req.query.q, next);
  }

  countAll.profiles(next);
}

var profilesRouter = express.Router();

profilesRouter.get('/', passResult(getAllProfiles), sendProfilesResults);

function getOneProfile(req, res, next) {
  var id = req.params.profileId;

  fetchOneProfile(id, function (err, result) {
    if (err) { return next(err); }

    if (result.hits.total === 0) {
      return res.sendStatus(404);
    }

    req.profile = result.hits.hits[0];

    next();
  });
}

profilesRouter.param('profileId', getOneProfile);

function buildProfileLinks(profile) {
  var skillsLinks = profile.skills.map(function (skill) {
    return {
      title: skill,
      href: '/skills/' + encodeURIComponent(skill)
    };
  });

  var companiesLinks = profile.companies.map(function (company) {
    return {
      title: company,
      href: '/companies/' + encodeURIComponent(company)
    };
  });

  return {
    self: {
      title: profile.name,
      href: '.'
    },
    collection: {
      href: '/profiles'
    },
    'needs': {
      href: './needs'
    },
    skills: skillsLinks,
    companies: companiesLinks
  };
}

profilesRouter.get('/:profileId', sendProfile);

profilesRouter.get('/:profileId/needs', function (req, res) {
  res.redirect('/needs?profiles=' + req.params.profileId);
});

app.use('/profiles', profilesRouter);

app.use(linksAbsolutizer({
  rootPath: '/',
  embed: false
}));

app.use(function (req, res, next) {
  if (req.accepts(['html', 'json']) === 'json' || req.query.format === 'json') {
    return res.json(res.result);
  }

  res.header('Content-Type', 'text/html');
  res.send(formatter.jsonToHTML(res.result, null, req.uri));
});

std.http.createServer(app).listen(3000);

var options = {
  key: std.fs.readFileSync('ssl/test_key.pem'),
  cert: std.fs.readFileSync('ssl/test_cert.pem')
};

if (false) {
  std.https.createServer(options, app).listen(8888);
}
