const fieldsFormatters = require('./format-fields');

function formatProfilesTemplates(query) {
  console.log(query);
  return {
    _templates: {
      default: {
        title: 'Save search as',
        method: 'post',
        action: '/save',
        properties: [
          { name: 'table', type: 'hidden', value: 'search' },
          { name: 'key', type: 'text' },
          { name: 'value', type: 'hidden', value: JSON.stringify({ query }) },
        ],
      },
    },
  };
}

const format = ({ maps}) => (results) => {
  const total = maps.profiles.length;
  const count = results.length;

  return Object.assign(
    { total },
    count !== total ? { count } : {},
    {
      _links: {
        profile: results.map(fieldsFormatters.profiles()),
      },
    },
    formatProfilesTemplates(results.query)
  );
};

exports = module.exports = format;
