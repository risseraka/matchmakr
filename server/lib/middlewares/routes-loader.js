const { readdirSync: readdir } = require('fs');

exports = module.exports = (app, rootDir = '.') => {
  const routes = readdir('./routes')
          .filter(e => e.match(/\.js$/))
          .filter(e => !e.match(/^~$/))
          .filter(e => !e.match(/#/))
          .sort()
          .reduce((r, root) => {
            const rootName = root.split('.js')[0];
            const rootPath = rootName === 'index' ? '' : `/${rootName}`;

            const filePath = `${rootDir}/${root}`;
            const obj = require(filePath);

            const routes = Object.keys(obj).map(path => {
              const route = `${rootPath}${path}`;

              app.get(route, obj[path]);
              return route;
            });

            return r.concat(routes);
          }, [])
          .sort()
          .join('\n');
  console.log(routes);
}
