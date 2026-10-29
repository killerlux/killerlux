import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMeasurements, CAMPAIGN_IDS, MEASUREMENT_HEADERS } from './measurement.js';

const header = MEASUREMENT_HEADERS.join(',');
const options = overrides => ({
  mode: 'observations', provenance: 'Agrégats synthétiques de test, aucune campagne réellement diffusée.',
  startDate: '2026-10-01', endDate: '2026-10-20', windowClosed: true, comparableVisitors: true,
  ...overrides,
});
const csv = (values = ['trace-souvenir', '30', '1000', '100', '80', '20']) => `${header}\n${values.join(',')}`;
const metric = (input, opts = options()) => {
  const result = parseMeasurements(input, opts);
  assert.equal(result.status, 'ok', result.warnings.join(' '));
  return result.rows[0];
};
const invalid = (input, opts = options(), message) => {
  const result = parseMeasurements(input, opts);
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.rows, []);
  if (message) assert.match(result.warnings[0], message);
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('Campaign allowlist matches the six current campaign records', () => {
  const campaigns = JSON.parse(readFileSync(new URL('./campaigns.json', import.meta.url), 'utf8'));
  assert.deepEqual([...CAMPAIGN_IDS].sort(), campaigns.map(row => row.id).sort());
});

test('Descriptive metrics have exact intended denominators and no success or ROAS score', () => {
  const row = metric(csv());
  assert.equal(row.campaignId, 'trace-souvenir');
  assert.equal(row.spendEur, 30);
  assert.equal(row.metrics.ctr, 0.1);
  assert.equal(row.metrics.cpcEur, 0.3);
  assert.equal(row.metrics.costPerVisitorEur, 0.375);
  assert.equal(row.metrics.actionRate, 0.25);
  assert.equal(row.metrics.costPerActionEur, 1.5);
  assert.equal(row.metrics.actionRateIntervalReason, null);
  assert.equal(row.metrics.roas, undefined);
  assert.equal(row.metrics.successProbability, undefined);
  assert.equal(row.rank, undefined);
});

test('Wilson 95% matches independent analytic reference values', () => {
  const cases = [
    [0, 1, 0, 0.793450685622763],
    [1, 1, 0.206549314377237, 1],
    [0, 10, 0, 0.277532799862889],
    [1, 10, 0.017876213095073, 0.404150026795238],
    [5, 10, 0.236593090512564, 0.763406909487436],
    [0, 100, 0, 0.036993498206986],
    [50, 100, 0.403831530365996, 0.596168469634004],
    [100, 100, 0.963006501793014, 1],
  ];
  for (const [completed, visitors, lower, upper] of cases) {
    const row = metric(csv(['trace-souvenir', '', '', '', String(visitors), String(completed)]));
    near(row.metrics.actionRateWilson95.lower, lower);
    near(row.metrics.actionRateWilson95.upper, upper);
    assert.equal(row.metrics.actionRateWilson95.confidence, 0.95);
  }
});

test('Empty fields stay unknown while independent metrics remain calculable', () => {
  const row = metric(csv(['trace-souvenir', ' ', '100', '10', '20', '5']));
  assert.equal(row.spendEur, null);
  assert.equal(row.metrics.cpcEur, null);
  assert.equal(row.metrics.costPerVisitorEur, null);
  assert.equal(row.metrics.costPerActionEur, null);
  assert.equal(row.metrics.ctr, 0.1);
  assert.equal(row.metrics.actionRate, 0.25);
  assert.notEqual(row.metrics.actionRateWilson95, null);
  assert.ok(row.warnings.some(w => w.includes('spend_eur')));
});

test('Unknown visitors do not become zero or block known completers', () => {
  const row = metric(csv(['trace-souvenir', '12', '', '', '', '3']));
  assert.equal(row.eligibleVisitors, null);
  assert.equal(row.uniqueCompleters, 3);
  assert.equal(row.metrics.actionRate, null);
  assert.equal(row.metrics.costPerActionEur, 4);
  assert.equal(row.metrics.actionRateWilson95, null);
  assert.match(row.metrics.actionRateIntervalReason, /connus/);
});

test('Zero denominators remain unknown, while a known zero numerator can give zero', () => {
  const allZero = metric(csv(['trace-souvenir', '0', '0', '0', '0', '0']));
  for (const name of ['ctr', 'cpcEur', 'costPerVisitorEur', 'actionRate', 'costPerActionEur', 'actionRateWilson95']) {
    assert.equal(allZero.metrics[name], null);
  }
  assert.match(allZero.metrics.actionRateIntervalReason, /Aucun visiteur/);
  const zeroCost = metric(csv(['trace-souvenir', '0', '10', '2', '3', '0']));
  assert.equal(zeroCost.metrics.cpcEur, 0);
  assert.equal(zeroCost.metrics.costPerVisitorEur, 0);
  assert.equal(zeroCost.metrics.actionRate, 0);
  assert.equal(zeroCost.metrics.costPerActionEur, null);
  assert.notEqual(zeroCost.metrics.actionRateWilson95, null);
});

test('No arbitrary cross-platform counter ordering is imposed', () => {
  const row = metric(csv(['trace-souvenir', '0', '1', '5', '100', '50']));
  assert.equal(row.metrics.ctr, 5);
  assert.equal(row.metrics.actionRate, 0.5);
  invalid(csv(['trace-souvenir', '0', '100', '100', '2', '3']), options(), /ne peut pas dépasser/);
  invalid(csv(['trace-souvenir', '0', '100', '100', '0', '1']), options(), /ne peut pas dépasser/);
});

test('Wilson requires all observation declarations; descriptive rates stay available', () => {
  for (const [patch, reason] of [
    [{ mode: 'scenario' }, /scénario/], [{ provenance: ' ' }, /provenance/],
    [{ startDate: '' }, /période/], [{ endDate: undefined }, /période/],
    [{ windowClosed: false }, /close/], [{ comparableVisitors: false }, /indépendants/],
  ]) {
    const row = metric(csv(), options(patch));
    assert.equal(row.metrics.actionRate, 0.25);
    assert.equal(row.metrics.actionRateWilson95, null);
    assert.match(row.metrics.actionRateIntervalReason, reason);
  }
});

test('Strict modes and metadata types avoid coercing strings to true', () => {
  for (const opts of [{}, null, [], options({ mode: 'unknown' }), options({ windowClosed: 'false' }),
    options({ comparableVisitors: 'true' }), options({ provenance: 123 })]) invalid(csv(), opts);
});

test('Calendar dates and ordering are validated, missing period is merely unestimable', () => {
  metric(csv(), options({ startDate: '2024-02-29', endDate: '2024-02-29' }));
  for (const patch of [{ startDate: '2025-02-29' }, { startDate: '2026-02-31' },
    { startDate: '29/10/2026' }, { startDate: '2026-1-01' }, { startDate: '2026-12-01' },
    { endDate: 20261020 }, { endDate: '2026-10-20T00:00:00Z' }]) invalid(csv(), options(patch));
  const row = metric(csv(), options({ startDate: null, endDate: null }));
  assert.equal(row.metrics.actionRateWilson95, null);
});

test('Quoted comma CSV, BOM, CRLF, trailing blanks and header order work', () => {
  const reversed = [...MEASUREMENT_HEADERS].reverse();
  const values = ['20', '80', '100', '1000', '12,50', 'trace-souvenir'];
  const input = '\uFEFF\r\n' + reversed.map(v => `"${v}"`).join(',') + '\r\n' + values.map(v => `"${v}"`).join(',') + '\r\n\r\n';
  const row = metric(input);
  assert.equal(row.spendEur, 12.5);
  assert.equal(row.uniqueCompleters, 20);
});

test('Semicolon CSV accepts explicit French decimals without guessing thousands', () => {
  const input = MEASUREMENT_HEADERS.join(';') + '\ntrace-souvenir;12,50;100;10;10;1';
  const result = parseMeasurements(input, options());
  assert.equal(result.delimiter, ';');
  assert.equal(result.rows[0].spendEur, 12.5);
  invalid(MEASUREMENT_HEADERS.join(';') + '\ntrace-souvenir;1,234;100;10;10;1', options(), /deux décimales/);
});

test('Embedded quoted newlines and escaped quotes are parsed before campaign validation', () => {
  invalid(`${header}\n"trace-\nsouvenir",10,100,10,10,1`, options(), /identifiant de campagne/);
  invalid(`${header}\n"trace-""souvenir",10,100,10,10,1`, options(), /identifiant de campagne/);
  const row = metric(`${header}\n"trace-souvenir",10,100,10,"10\r\n",1`);
  assert.equal(row.eligibleVisitors, 10);
});

test('Malformed quotes and unequal rows reject the whole import', () => {
  for (const line of ['"trace-souvenir,10,100,10,10,1', 'tra"ce-souvenir,10,100,10,10,1',
    '"trace-souvenir"bad,10,100,10,10,1', 'trace-souvenir,10,100,10,10', 'trace-souvenir,10,100,10,10,1,extra']) {
    invalid(`${header}\n${line}`);
  }
  invalid(csv() + '\ntrace-local,10,100,10,2,3', options(), /ne peut pas dépasser/);
});

test('All six named headers are mandatory, unique and exclusive', () => {
  invalid('campaign_id,spend_eur\ntrace-souvenir,10', options(), /absentes/);
  invalid(`${header},extra\ntrace-souvenir,10,100,10,10,1,x`, options(), /inconnues/);
  invalid(header.replace('spend_eur', 'campaign_id') + '\ntrace-souvenir,10,100,10,10,1', options(), /dupliqués/);
  invalid(header.replace('spend_eur', '') + '\ntrace-souvenir,10,100,10,10,1', options(), /vide/);
  invalid(header.replace('spend_eur', 'Spend_Eur') + '\ntrace-souvenir,10,100,10,10,1', options(), /inconnues/);
});

test('Duplicate or unknown campaign IDs never silently aggregate', () => {
  invalid(csv() + '\ntrace-souvenir,5,200,20,10,2', options(), /répétée/);
  invalid(csv(['not-a-campaign', '10', '100', '10', '10', '1']), options(), /inconnu/);
  invalid(csv(['', '10', '100', '10', '10', '1']), options(), /vide/);
  const valid = csv() + '\ntrace-local,5,200,20,10,2';
  assert.equal(parseMeasurements(valid, options()).rows.length, 2);
});

test('Counts are bounded nonnegative integers without numeric-prefix parsing', () => {
  for (const value of ['-1', '1.5', '1e2', 'NaN', 'Infinity', '+1', 'false', '12abc', '100000001']) {
    invalid(csv(['trace-souvenir', '10', value, '10', '10', '1']));
  }
  const row = metric(csv(['trace-souvenir', '10', '100000000', '100000000', '100000000', '100000000']));
  assert.equal(row.metrics.actionRate, 1);
  assert.ok(row.metrics.actionRateWilson95.lower < 1);
});

test('Spend is bounded to one million EUR and two decimals; missing differs from literal zero', () => {
  for (const spend of ['-1', '+1', '1e2', 'NaN', 'Infinity', '10 EUR', '1 000', '1.234', '1000000.01', '=1+2']) {
    invalid(csv(['trace-souvenir', spend, '100', '10', '10', '1']));
  }
  assert.equal(metric(csv(['trace-souvenir', '1000000.00', '100', '10', '10', '1'])).spendEur, 1000000);
  assert.equal(metric(csv(['trace-souvenir', '', '100', '10', '10', '1'])).spendEur, null);
  assert.equal(metric(csv(['trace-souvenir', '0', '100', '10', '10', '1'])).spendEur, 0);
});

test('Formula and HTML inputs are not executed or accepted as campaign/count data', () => {
  invalid(csv(['=HYPERLINK("https://example.com")', '0', '0', '0', '0', '0']));
  invalid(csv(['<script>alert(1)</script>', '0', '0', '0', '0', '0']));
  invalid(csv(['trace-souvenir', '0', '=1+1', '0', '0', '0']));
  metric(csv(), options({ provenance: '<b>Source déclarée comme texte uniquement</b>' }));
});

test('Empty files, oversized UTF-8 files and excessive data rows are rejected', () => {
  invalid('', options(), /vide/);
  invalid(header, options(), /aucune ligne/);
  invalid(null);
  invalid('x'.repeat(100001), options(), /100 000 octets/);
  invalid('é'.repeat(50001), options(), /100 000 octets/);
  invalid(header + '\n' + Array(501).fill('trace-souvenir,0,0,0,0,0').join('\n'), options(), /500 lignes/);
});

test('Options are not mutated and outputs remain JSON-safe without NaN or Infinity', () => {
  const opts = Object.freeze(options());
  const before = JSON.stringify(opts);
  const output = parseMeasurements(csv(), opts);
  assert.equal(JSON.stringify(opts), before);
  assert.deepEqual(JSON.parse(JSON.stringify(output)), output);
  assert.ok(output.warnings.some(w => w.includes('pas des achats')));
});
