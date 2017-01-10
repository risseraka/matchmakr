exports = module.exports = {
  errorHandler(err, req, res, next) {
    res.status(err.code || 500).format({
      html: () => res.send(`
${err.message}<hr/>
<code>${(err.stack || '').replace(/\n/g, '<br/>')}</code><hr/>
<code>${JSON.stringify(err.data)}</code>
`),
      default: () => res.send(err),
    });
  },
};
