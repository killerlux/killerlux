import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProbability } from './probability.js';

const scenario = overrides => ({ mode: 'scenario', priorAlpha: 1, priorBeta: 1,
  priorJustification: 'Hypothèse explicite pour vérifier les formules.', expectedTraffic: 4,
  variableMargin: '1', fixedCosts: '0', futureAcquisitionSpend: '0', targetProfit: '3', ...overrides });
const observed = overrides => ({ ...scenario(), mode: 'observations', clicks: 2, purchasers: 1,
  provenance: 'Fixture analytique, pas une donnée commerciale.', windowClosed: true, comparableTraffic: true, ...overrides });
const near = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('No data or missing evidence never silently supplies a prior or probability', () => {
  for (const input of [undefined, {}, observed({ clicks: 0, purchasers: 0 }), observed({ provenance: '' }),
    observed({ windowClosed: false }), observed({ comparableTraffic: false }), observed({ priorAlpha: undefined }),
    observed({ priorJustification: '' }), observed({ expectedTraffic: undefined })]) {
    const result = assessProbability(input);
    assert.equal(result.status, 'not_estimable');
    assert.equal(result.probability, null);
    assert.equal(typeof result.reason, 'string');
  }
});

test('Uniform Beta(1,1) predictive distribution gives 2/5 for K>=3 of 4', () => {
  const result = assessProbability(scenario());
  assert.equal(result.status, 'scenario');
  near(result.probability, 2 / 5);
  near(result.probabilityZeroPurchases, 1 / 5);
  near(result.expectedPurchases, 2);
  assert.equal(result.observations.treatedAsHypotheses, true);
});

test('Observed Beta(2,2), N=2: PMF is [0.3,0.4,0.3]', () => {
  const result = assessProbability(observed({ expectedTraffic: 2, targetProfit: '2' }));
  assert.equal(result.status, 'conditional_estimate');
  assert.deepEqual(result.posterior, { alpha: 2, beta: 2 });
  near(result.probability, 0.3);
  near(result.probabilityZeroPurchases, 0.3);
  near(result.expectedProfit, 1);
});

test('Beta(2,1) and Beta(1,2) asymmetric analytic references', () => {
  near(assessProbability(observed({ clicks: 1, purchasers: 1, expectedTraffic: 2, targetProfit: '1' })).probability, 5 / 6);
  near(assessProbability(observed({ clicks: 1, purchasers: 0, expectedTraffic: 2, targetProfit: '2' })).probability, 1 / 6);
});

test('Exact decimal comparison preserves cent and sub-cent boundaries', () => {
  const input = observed({ variableMargin: '0.1', futureAcquisitionSpend: '0.3', targetProfit: '0' });
  near(assessProbability(input).probability, 13 / 35);
  near(assessProbability({ ...input, futureAcquisitionSpend: '0.30000000000000001' }).probability, 1 / 7);
  assert.equal(assessProbability(input).futureAcquisitionSpend, '0.3');
});

test('Negative and zero margins, deterministic impossibility and zero future traffic', () => {
  near(assessProbability(scenario({ variableMargin: '-1', targetProfit: '-1' })).probability, 2 / 5);
  near(assessProbability(scenario({ variableMargin: '0', targetProfit: '0' })).probability, 1);
  assert.equal(assessProbability(scenario({ variableMargin: '0', targetProfit: '1' })).probability, 0);
  const empty = assessProbability(scenario({ expectedTraffic: 0, targetProfit: '0' }));
  assert.equal(empty.probability, 1);
  assert.equal(empty.probabilityZeroPurchases, 1);
  assert.equal(empty.probabilityAtLeast300, 0);
  assert.equal(assessProbability(scenario({ targetProfit: '100' })).probability, 0);
});

test('Costs are subtracted once, target300 has its own event', () => {
  const result = assessProbability(scenario({ variableMargin: '200', fixedCosts: '100', futureAcquisitionSpend: '100', targetProfit: '0' }));
  near(result.probability, 4 / 5);
  near(result.breakEvenProbability, 4 / 5);
  near(result.probabilityAtLeast300, 2 / 5);
  near(result.expectedProfit, 200);
});

test('Tiny positive beta survives posterior and recurrence grouping', () => {
  const result = assessProbability(observed({ priorBeta: 1e-300, clicks: 1, purchasers: 1, expectedTraffic: 1, targetProfit: '1' }));
  assert.equal(result.status, 'conditional_estimate');
  assert.equal(result.posterior.beta, 1e-300);
  near(result.probability, 1);
  assert.ok(result.probabilityZeroPurchases > 0);
});

test('Large N stable normalization and symmetry', () => {
  const result = assessProbability(scenario({ expectedTraffic: 10000, priorAlpha: 2, priorBeta: 2, targetProfit: '5000' }));
  assert.equal(result.status, 'scenario');
  assert.ok(result.probability >= 0.5 && result.probability < 0.501);
  near(result.expectedPurchases, 5000);
});

test('Observed model agrees with independent Python finite-sum fixtures', () => {
  // Independently evaluated with /workspace/revenue-lab/probability/model.py.
  // Synthetic counts are mathematical reference fixtures, not market evidence.
  const fixtures = [
    { clicks: 200, purchasers: 7, expectedTraffic: 1000, variableMargin: '13.665',
      futureAcquisitionSpend: '500', fixedCosts: '36', targetProfit: '300', priorAlpha: 1, priorBeta: 1,
      probability: 0.08402427314488109, expectedProfit: 5.188118811881168, zero: 5.47148410399139e-7 },
    { clicks: 100, purchasers: 2, expectedTraffic: 500, variableMargin: '11.665',
      futureAcquisitionSpend: '250', fixedCosts: '36', targetProfit: '0', priorAlpha: 0.5, priorBeta: 0.5,
      probability: 0.08975628078838034, expectedProfit: -141.63118811881188, zero: 0.011163046445936145 },
  ];
  for (const fixture of fixtures) {
    const result = assessProbability(observed(fixture));
    near(result.probability, fixture.probability);
    near(result.expectedProfit, fixture.expectedProfit);
    near(result.probabilityZeroPurchases, fixture.zero);
  }
});

test('Invalid inputs return structured errors without throwing', () => {
  for (const input of [null, [], scenario({ mode: 'magic' }), scenario({ priorAlpha: 0 }), scenario({ priorBeta: Infinity }),
    scenario({ priorAlpha: 1e308, priorBeta: 1e308 }), scenario({ clicks: 1, purchasers: 2 }), observed({ clicks: 0, purchasers: 1 }), scenario({ clicks: true }),
    scenario({ expectedTraffic: 10001 }), scenario({ expectedTraffic: 2.5 }), scenario({ variableMargin: NaN }),
    scenario({ variableMargin: '1e3' }), scenario({ fixedCosts: '-1' }), scenario({ futureAcquisitionSpend: '-1' }),
    scenario({ variableMargin: '0.1234567890123456789012345' })]) {
    const result = assessProbability(input);
    assert.equal(result.status, 'invalid_input', JSON.stringify(input));
    assert.equal(result.probability, null);
    assert.doesNotThrow(() => JSON.stringify(result));
  }
});
