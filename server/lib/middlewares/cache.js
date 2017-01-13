exports = module.exports = {
  cache() {
    const memo = {};
    return (req, res, next) => {
      if (req.method !== 'GET') return next();

      const send = res.send.bind(res);

      if (!('nocache' in req.query) && memo[req.url]) {
        return send(memo[req.url]);
      }

      res.send = result => {
        if (!memo[req.url]) memo[req.url] = result;

        send(result);
      };

      next();
    };
  },
}
