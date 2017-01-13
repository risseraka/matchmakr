const {
  mapArgs,
  composeArrayArgs,
} = require('../utils/function');

const {
  percentage,
} = require('../utils/math');

const {
  sortWith,
  compareInts,
} = require('../utils/array');

exports = module.exports = data => {
  const { indices } = data;

  function getSkillTopSkills({ name }) {
    const topSkills = indices.topSkills[name];
    if (!topSkills) return [];

    const sort = sortWith(
      composeArrayArgs(mapArgs(e => indices.skillsMatrice[name].skills[e]), compareInts),
      true
    );

    return sort(topSkills)
      .map(child => {
        const count = indices.skillsMatrice[name].skills[child];
        const childCount = indices['skills.name'][child].length;
        return `${child} (${count}/${childCount}, ${percentage(count / childCount)}%)`;
      });
  }

  return getSkillTopSkills;
};
