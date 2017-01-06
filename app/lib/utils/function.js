exports = module.exports = {
  negate(e) {
    return !e;
  },

  closure(...args) {
    const func = args.pop();
    return func(...args);
  },

  mapArgs(func) {
    return (...args) => args.map(func);
  },

  applyTo(method, ...args) {
    return obj => obj[method](...args);
  },

  curry(func) {
    return (...first) => (...then) => func(...first, ...then);
  },

  compose(func, ...funcs) {
    return (...args) => {
      const result = func(...args);
      return funcs.reduce((r, func) => func(r), result);
    };
  },

  composeArrayArgs(func, ...funcs) {
    return (...args) => {
      const result = func(...args);
      return funcs.reduce((r, func) => func(...r), result);
    };
  },
};
