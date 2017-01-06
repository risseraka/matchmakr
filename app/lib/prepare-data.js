const {
  percentile,
} = require('./utils/math');

const {
  negate,
  closure,
  mapArgs,
  applyTo,
  curry,
  compose,
  composeArrayArgs,
} = require('./utils/function');

const {
  forEachObject,
  arrayify,
  pushIn,
} = require('./utils/object');

const {
  unique,
  intersection,
  union,
  flatten,
  sortWith,
  sortByField,
  filterWith,
  filterBy,
  compareInts,
  compareStrings,
  compareDates,
} = require('./utils/array');

const {
  normalize,
} = require('./utils/string');

const {
  toYear,
  diffDates,
  diffDateFromNow,
} = require('./utils/date');

const {
  indexObject,
  index,
  mapField,
} = require('./utils/map-index');

const timer = require('./utils/timer');
const { Search } = require('./utils/search');

const compareLength = composeArrayArgs(mapArgs(e => e.length), compareInts);
const compareNormalized = composeArrayArgs(mapArgs(normalize), compareStrings);
const compareStartEndDates = composeArrayArgs(mapArgs(({ startDate, endDate }) => [startDate, endDate]), compareDates);

const sortByNormalizedName = sortByField('name', compareNormalized);
const sortByInts = sortWith(compareInts);

const sortByIntsDesc = sortWith(compareInts, true);
const sortByCountDesc = sortByField('count', compareInts, true);
const sortByNetworkLengthDesc = sortByField('network', compareLength, true);
const sortByEndorsementCountDesc = sortByField('endorsementCount', compareInts, true);

const filterByCountOne = filterBy('count', e => e > 1);
const filterExisting = applyTo('filter', e => e !== undefined && e !== null);

const filterAndSortByCountOne = compose(sortByCountDesc, filterByCountOne);

function calcSeniority(positions) {
  const firstExperience = positions.reduce(
    (r, p) => (p.startDate || 0) < r.startDate ? p : r,
    { startDate: Infinity }
  ).startDate;

  return firstExperience !== Infinity ? diffDateFromNow(firstExperience) : 'N/A';
}

exports = module.exports = function prepareData(file) {
  const time = timer().start('profiles');

  const data = require(`../profiles/${file}`);

  const profiles = sortByNormalizedName(data);

  time.check('compute');

  profiles.forEach(profile => {
    sortByEndorsementCountDesc(profile.skills);

    profile.positions.sort(compareStartEndDates);
    profile.positions.forEach(position => {
      if (!position) return;

      position.seniority = diffDates(position.startDate, position.endDate);
    });


    profile.seniority = calcSeniority(profile.positions);
  });

  profiles.index = index(profiles, 'id', true);

  time.check('search');

  const search = Search(profiles, ['profileUrl']);

  time.check('mapping');

  const maps = {
    profiles,
    name: mapField(profiles, 'name', unique),
    seniority: mapField(profiles, p => toYear(p.seniority), unique),
    location: mapField(profiles, 'location', unique),
    'skills.name': mapField(profiles, 'skills.name', unique),
    'positions.companyName': mapField(profiles, 'positions.companyName', unique),
    'positions.title': mapField(profiles, 'positions.title', unique),
  };

  time.check('endorsements');

  function buildEndorsements() {
    const endorsements = maps.profiles.reduce(
      (r, p) => p.skills.reduce(
        (r, s) => {
          const name = normalize(s.name);

          pushIn(r.skilled, name, { [p.id]: s }, false, true);

          if (s.endorsementCount) {
            pushIn(r.endorsements, name, s.endorsementCount);
          }

          return s.endorsers.reduce((r, endorser) => {
            pushIn(r.endorsers, endorser, p.id);

            pushIn(r.endorsees, p.id, endorser);
            return r;
          }, r);
        }, r
      ), { endorsements: {}, skilled: {}, endorsers: {}, endorsees: {} }
    );

    forEachObject(endorsements.endorsements, sortByIntsDesc);

    return endorsements;
  }

  const endorsements = buildEndorsements();

  const fields = [
    'profiles', 'name', 'seniority', 'location',
    'skills.name', 'positions.companyName', 'positions.title'
  ];

  const indices = Object.assign(
    fields.reduce((r, field) => (r[field] = maps[field].index, r), {}),
    endorsements
  );

  time.check('skillsRanks');

  function buildSkillsRanks() {
    profiles.forEach(profile => {
      profile.skills.forEach(skill => {
        const { name, endorsementCount } = skill;

        const normalized = normalize(name);

        const skilled = indices.skilled[normalized];
        if (!skilled) return;

        const endorsements = indices.endorsements[normalized];

        skill.percentile = percentile(endorsements, endorsementCount);

        const superEndorsementCount = (skill.endorsers || []).reduce((r, e) => r + (skilled[e] ? 1 : 0), 0);
        if (superEndorsementCount) {
          skill.superEndorsementCount = superEndorsementCount;
        }
      });
    });
  }

  buildSkillsRanks();

  time.check('relations');

  function buildRelations() {
    const time = timer('relations').start('all');

    const allEndorsees = Object.keys(indices.endorsees);
    const allEndorsers = Object.keys(indices.endorsers);
    const all = unique(union(allEndorsees, allEndorsers, profiles.map(p => p.id)).map(id => +id));

    time.check('map');

    const relations = all.map(a => {
      const profile = indices.profiles[a] || { id: +a };

      const { id, name = '' } = profile;

      const pendorsers = unique(indices.endorsees[id]);
      const pendorsees = unique(indices.endorsers[id]);
      const connecteds = unique(union(pendorsers, pendorsees));
      const friends = intersection(pendorsers, pendorsees);

      const count = connecteds.length;

      return { id, count, name, friends, endorsers: pendorsers, endorsees: pendorsees, connecteds };
    });

    time.check('index');

    relations.index = index(relations, 'id', true);

    time.check('intersection');

    relations.forEach(f => {
      const { id, friends, connecteds } = f;

      const network = connecteds.filter(
        p => intersection(relations.index[p].connecteds, connecteds).length
      );

      f.network = network;
    });

    time.check('sort');

    sortByNetworkLengthDesc(relations);

    time.check();

    return relations;
  }

  const relations = buildRelations();

  maps.relations = relations;
  indices.relations = relations.index;

  time.check('skillsMatrice');

  function buildSkillsMatrice() {
    const time = timer('skillsMatrice').start('map');

    const keys = filterAndSortByCountOne(maps['skills.name']).map(e => e.name);

    const skillsMatrice = keys.reduce((r, name) => {
      const s1 = name;

      const skills = {};
      const top = { name: '', count: 0 };
      const rs1 = r[s1] = { skills, top };

      const items = flatten((indices['skills.name'][name] || []).map(p => p.skills));
      return items.reduce((r, { name: s2 }) => {
        s2 = normalize(s2);

        if (s1 === s2) return r;
        const rs2 = (skills[s2] || 0) + 1;

        skills[s2] = rs2;

        if (rs2 > top.count) {
          top.count = rs2;
          if (s2 !== top.name) {
            top.name = s2;
          }
        }
        return r;
      }, r);
    }, {});

    time.check('top map');

    const tops = keys.map(name => ({
      name,
      top: skillsMatrice[name].top.name,
    }));

    time.check('invert');

    const topSkillsIndex = indexObject(
      index(tops, 'name', true, 'top')
    );

    time.check('keys');

    keys.forEach(name => {
      const matrice = skillsMatrice[name];
      matrice.keys = Object.keys(matrice.skills);
    });

    time.check();

    return { skillsMatrice, topSkillsIndex };
  }

  const { skillsMatrice, topSkillsIndex } = buildSkillsMatrice();

  indices.skillsMatrice = skillsMatrice;
  indices.topSkills = topSkillsIndex;

  time.check();

  return { file, search, maps, indices };
};
