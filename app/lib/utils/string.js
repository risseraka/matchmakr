exports = module.exports = {
  // http://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
  normalize(str) {
    return typeof str === 'string' && str
      .normalize('NFD')
      .replace(/[-.,!\/\]\[\(\)]/g, '')
      .replace(/ +/g, ' ')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  },

  parseRange(str) {
    const range = str.split('..');

    if (range.length === 1) return [range[0], range[0]];

    return [range[0] || -Infinity, range[1] || +Infinity];
  },
};
