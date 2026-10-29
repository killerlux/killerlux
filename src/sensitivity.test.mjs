import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSensitivity } from './sensitivity.js';
import { assessProbability } from './probability.js';

// Synthetic analytical fixtures only; these counts are not actual market evidence.
const fixture = overrides => ({
  mode: 'observations', clicks: 100, purchasers: 5,
  provenance: 'Fixture synthétique pour vérifier les formules.', windowClosed: true, comparableTraffic: true,
  expectedTraffic: 500, variableMargin: '12.345678901234567890123456',
  fixedCosts: '36.000000000000000000000001', futureAcquisitionSpend: '100.10',
  targetProfit: '300.000000000000000000000001',
  priorAlpha: 1, priorBeta: 19, priorJustification: 'Choix de test, pas une preuve.',
  ...overrides,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('Unavailable or invalid base creates no synthetic observations or rows', () => {
  for (const input of [undefined, {}, null, fixture({ clicks: 0, purchasers: 0 }),
    fixture({ provenance: '' }), fixture({ priorAlpha: undefined }), fixture({ expectedTraffic: 10001 })]) {
    const result = assessSensitivity(input);
    assert.notEqual(result.status, 'calculated');
    assert.deepEqual(result.rows, []);
    assert.equal(result.base.probability, null);
    assert.ok(result.disclaimer.includes('arbitraires'));
  }
});

test('Exactly four independent variations preserve evidence and unchanged money exactly', () => {
  const input = fixture();
  const saved = JSON.stringify(input);
  Object.freeze(input);
  const output = assessSensitivity(input);
  assert.equal(output.status, 'calculated');
  assert.equal(output.rows.length, 4);
  assert.deepEqual(output.base, assessProbability(input));
  assert.equal(JSON.stringify(input), saved);
  for (const row of output.rows) {
    assert.equal(row.input.clicks, input.clicks);
    assert.equal(row.input.purchasers, input.purchasers);
    assert.equal(row.input.provenance, input.provenance);
    assert.equal(row.input.windowClosed, true);
    assert.equal(row.input.comparableTraffic, true);
    assert.equal(row.input.targetProfit, input.targetProfit);
    assert.equal(row.input.variableMargin, input.variableMargin);
    assert.equal(row.input.fixedCosts, input.fixedCosts);
    assert.equal(row.input.priorJustification, input.priorJustification);
    assert.deepEqual(row.result, assessProbability(row.input));
    const changed = new Set(row.changes.map(change => change.field));
    for (const [key, value] of Object.entries(input)) {
      if (!changed.has(key)) assert.equal(row.input[key], value);
    }
  }
  assert.doesNotThrow(() => JSON.stringify(output));
  assert.equal(output.probability, undefined);
  assert.equal(output.confidenceInterval, undefined);
});

test('Budget stress uses exact decimal arithmetic rounded upwards to cents', () => {
  const cases = [['100.10', '120.12'], ['0.001', '0.01'], ['0.1', '0.12'],
    ['0.100000000000000000000001', '0.13'], ['16.666666666666666666666666', '20.00']];
  for (const [budget, expected] of cases) {
    const result = assessSensitivity(fixture({ futureAcquisitionSpend: budget }));
    const row = result.rows[0];
    assert.equal(row.input.futureAcquisitionSpend, expected);
    assert.equal(row.input.expectedTraffic, result.base.expectedTraffic);
    assert.ok(row.result.probability <= result.base.probability + 1e-13);
  }
});

test('Zero budget stays zero and its note states that fact', () => {
  for (const zero of [0, '0.00', '-0.0']) {
    const result = assessSensitivity(fixture({ futureAcquisitionSpend: zero }));
    assert.equal(result.rows[0].input.futureAcquisitionSpend, '0.00');
    assert.match(result.rows[0].note, /reste 0,00/);
    close(result.rows[0].result.probability, result.base.probability);
  }
});

test('Less traffic keeps acquisition spend unchanged, floors integer visits, and preserves zero', () => {
  for (const visits of [0, 1, 4, 5, 101, 10000]) {
    const result = assessSensitivity(fixture({ expectedTraffic: visits }));
    const row = result.rows[1];
    assert.equal(row.input.expectedTraffic, Math.floor(visits * 4 / 5));
    assert.equal(row.input.futureAcquisitionSpend, '100.10');
    assert.ok(row.result.probability <= result.base.probability + 1e-11);
    assert.ok(row.result.expectedProfit <= result.base.expectedProfit + 1e-11);
    if (visits === 0) assert.match(row.note, /reste nul/);
  }
});

test('Prior concentration changes only the prior; posterior mean need not stay constant', () => {
  const input = fixture({ clicks: 10, purchasers: 8, priorAlpha: 1, priorBeta: 9 });
  const output = assessSensitivity(input);
  for (const [i, factor] of [[2, 0.5], [3, 2]]) {
    const row = output.rows[i];
    assert.equal(row.input.priorAlpha, input.priorAlpha * factor);
    assert.equal(row.input.priorBeta, input.priorBeta * factor);
    close(row.input.priorAlpha / (row.input.priorAlpha + row.input.priorBeta), 0.1);
    assert.notEqual(row.result.expectedPurchases, output.base.expectedPurchases);
  }
});

test('Analytical references show prior strength has no universal favourable direction', () => {
  const input = fixture({ mode: 'scenario', clicks: 0, purchasers: 0, priorAlpha: 1, priorBeta: 1,
    expectedTraffic: 4, variableMargin: '1', fixedCosts: '0', futureAcquisitionSpend: '0', targetProfit: '3' });
  const highTarget = assessSensitivity(input);
  close(highTarget.base.probability, 2 / 5);
  close(highTarget.rows[2].result.probability, 55 / 128);
  close(highTarget.rows[3].result.probability, 13 / 35);
  const lowTarget = assessSensitivity({ ...input, targetProfit: '1' });
  close(lowTarget.base.probability, 4 / 5);
  close(lowTarget.rows[2].result.probability, 93 / 128);
  close(lowTarget.rows[3].result.probability, 6 / 7);
});

test('Hypothesis mode stays explicitly hypothetical in all rows', () => {
  const result = assessSensitivity(fixture({ mode: 'scenario', clicks: 0, purchasers: 0, provenance: '', windowClosed: false }));
  assert.equal(result.base.status, 'scenario');
  assert.ok(result.rows.every(row => row.result.status === 'scenario'));
  assert.ok(result.rows.every(row => row.result.observations.treatedAsHypotheses));
});

test('Negative margin does not impose a false monotonic rule on lower traffic', () => {
  const result = assessSensitivity(fixture({ variableMargin: '-10', targetProfit: '-200', expectedTraffic: 500 }));
  assert.equal(result.status, 'calculated');
  assert.ok(result.rows[1].result.expectedProfit >= result.base.expectedProfit);
});

test('Out of range stresses remain visibly invalid instead of being replaced with defaults', () => {
  const hugePrior = assessSensitivity(fixture({ priorAlpha: 8e307, priorBeta: 8e307 }));
  assert.equal(hugePrior.base.status, 'conditional_estimate');
  assert.equal(hugePrior.rows[3].result.status, 'invalid_input');
  assert.equal(hugePrior.rows[3].result.probability, null);
  assert.match(hugePrior.rows[3].note, /non calculable/);
  const tinyPrior = assessSensitivity(fixture({ priorAlpha: Number.MIN_VALUE }));
  assert.equal(tinyPrior.rows[2].result.status, 'invalid_input');
  const overflowingPrior = assessSensitivity(fixture({ priorAlpha: 1e308, priorBeta: 1 }));
  assert.equal(overflowingPrior.rows[3].result.status, 'invalid_input');
  assert.equal(overflowingPrior.rows[3].input.priorAlpha, 'Infinity');
  assert.deepEqual(JSON.parse(JSON.stringify(overflowingPrior)), overflowingPrior);
  const hugeBudget = assessSensitivity(fixture({ futureAcquisitionSpend: '999999999999.99' }));
  assert.equal(hugeBudget.rows[0].result.status, 'invalid_input');
  assert.equal(hugeBudget.rows[0].input.futureAcquisitionSpend, '1199999999999.99');
});
