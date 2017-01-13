exports = module.exports = {
  liveReload() {
    const scriptTag = `<script type="text/javascript">
function checkReload(etag) {
  fetch(new Request('/livereload')).catch(() => window.location.reload());
}
checkReload();
</script>`;

    return (req, res, next) => {
      const send = res.send.bind(res);
      //  res.send = str => send(liveReload + (str || ''));
      next();
    };
  },
};
