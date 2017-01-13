const {
  mapObject,
  mapObjectToArray,
} = require('../utils/object');

function toUriTemplate(uri){
  return uri.replace(/:([^/]+)/g, '{$1}');
}

exports = module.exports = ({ file, maps }, routes) => {
  function getIndex(req, res) {
    return res.format({
      json: () => res.send(Object.assign(
        mapObject(maps, items => items.length),
        {
          _links: routes.reduce((r, route) => {
            if (!route) return r;

            const href = toUriTemplate(route);
            const templated = href !== route;
            r[!route.slice(1) ? 'index' : route] = Object.assign({ href }, templated && { templated });
            return r;
          }, {}),
        }
      )),
      html: () => res.send(`
loaded base: ${file}<hr/>
${mapObjectToArray(maps, (items, key) => `total <a href="/${key}">${key}</a>: ${items.length}</a>`).join('<br/>')}<hr/>
routes:<br/>${routes.map(route => route && `<a href="${route}">${toUriTemplate(route)}</a>`).join('<br/>')}
`),
    });
  }

  return getIndex;
};
