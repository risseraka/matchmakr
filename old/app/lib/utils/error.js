exports = module.exports = {
  httpError(code, message) {
    const e = new Error(message);
    e.code = code;
    throw e;
  },
};
