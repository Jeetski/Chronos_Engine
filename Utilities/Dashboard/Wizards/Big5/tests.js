import bigFiveMarkers from './questions.js';
import ipipNeo120 from './ipip_neo_120.js';

const BIG5_TRAIT_ORDER = [
  'Extraversion',
  'Agreeableness',
  'Conscientiousness',
  'Emotional Stability',
  'Intellect/Imagination'
];

function buildShortForm(items, perTrait) {
  const buckets = new Map();
  items.forEach(item => {
    if (!BIG5_TRAIT_ORDER.includes(item.trait)) return;
    if (!buckets.has(item.trait)) buckets.set(item.trait, []);
    const bucket = buckets.get(item.trait);
    if (bucket.length < perTrait) bucket.push(item);
  });

  const selected = [];
  BIG5_TRAIT_ORDER.forEach(trait => {
    const bucket = buckets.get(trait) || [];
    selected.push(...bucket);
  });
  return selected;
}

const bigFiveMarkers50 = buildShortForm(bigFiveMarkers, 10);

export const TESTS = {
  big5_markers_50: {
    id: 'big5_markers_50',
    name: 'Big-Five Factor Markers (IPIP, 50 items)',
    shortName: 'IPIP Big-Five Markers (Short)',
    itemCount: bigFiveMarkers50.length,
    items: bigFiveMarkers50,
    batchSize: 10,
    timeEstimate: '6-10 min',
    source: {
      label: 'IPIP Big-Five Factor Markers',
      url: 'https://ipip.ori.org/newBigFive5broadKey.htm'
    },
    pros: [
      'Fast snapshot for quick recalibration',
      'Easy to repeat monthly',
      'Low cognitive load'
    ],
    cons: [
      'Less stable than the full marker set',
      'No facet detail'
    ],
    traitOrder: BIG5_TRAIT_ORDER,
    traits: {
      Extraversion: 'Social energy, assertiveness, and enthusiasm.',
      Agreeableness: 'Compassion, cooperation, and trust.',
      Conscientiousness: 'Organization, dependability, and discipline.',
      'Emotional Stability': 'Calmness, resilience, and steady emotional regulation.',
      'Intellect/Imagination': 'Curiosity, imagination, and openness to ideas.'
    },
    hasFacets: false
  },
  big5_markers_100: {
    id: 'big5_markers_100',
    name: 'Big-Five Factor Markers (IPIP, 100 items)',
    shortName: 'IPIP Big-Five Markers',
    itemCount: bigFiveMarkers.length,
    items: bigFiveMarkers,
    batchSize: 10,
    timeEstimate: '12-18 min',
    source: {
      label: 'IPIP Big-Five Factor Markers',
      url: 'https://ipip.ori.org/newBigFive5broadKey.htm'
    },
    pros: [
      'Fast, classic domain-level profile',
      'Easy to compare over time',
      'Lightweight for regular check-ins'
    ],
    cons: [
      'No facet detail',
      'Less nuance inside each trait'
    ],
    traitOrder: BIG5_TRAIT_ORDER,
    traits: {
      Extraversion: 'Social energy, assertiveness, and enthusiasm.',
      Agreeableness: 'Compassion, cooperation, and trust.',
      Conscientiousness: 'Organization, dependability, and discipline.',
      'Emotional Stability': 'Calmness, resilience, and steady emotional regulation.',
      'Intellect/Imagination': 'Curiosity, imagination, and openness to ideas.'
    },
    hasFacets: false
  },
  ipip_neo_120: {
    id: 'ipip_neo_120',
    name: 'IPIP-NEO-120 (30 facets)',
    shortName: 'IPIP-NEO-120',
    itemCount: ipipNeo120.length,
    items: ipipNeo120,
    batchSize: 12,
    timeEstimate: '15-25 min',
    source: {
      label: 'IPIP-NEO-120 Scoring Key (Johnson, 2014)',
      url: 'https://osf.io/ycvdk/'
    },
    pros: [
      'Facet-level detail (30 subtraits)',
      'NEO-compatible structure',
      'Best choice for deep profiling'
    ],
    cons: [
      'Longer to complete',
      'More effort to interpret'
    ],
    traitOrder: ['Neuroticism', 'Extraversion', 'Openness', 'Agreeableness', 'Conscientiousness'],
    traits: {
      Neuroticism: 'Emotional volatility and stress reactivity.',
      Extraversion: 'Social energy, assertiveness, and enthusiasm.',
      Openness: 'Curiosity, imagination, and openness to experience.',
      Agreeableness: 'Compassion, cooperation, and trust.',
      Conscientiousness: 'Organization, dependability, and discipline.'
    },
    hasFacets: true
  }
};

export const DEFAULT_TEST_ID = 'ipip_neo_120';
