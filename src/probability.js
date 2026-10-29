/**
 * Conditional Beta-Binomial profit calculator. No implicit prior or success score.
 * PMF: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.betabinom.html
 * Financial comparisons are exact for accepted decimal inputs; probabilities are floats.
 */
const MAX_TRAFFIC = 10000;
const MAX_OBSERVATIONS = 1_000_000_000;
const SCALE_DIGITS = 24;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const missing = value => value === undefined || value === null || value === '';

class InputIssue extends Error {
  constructor(reason, status = 'invalid_input') {
    super(reason);
    this.status = status;
  }
}

function unavailable(reason) {
  throw new InputIssue(reason, 'not_estimable');
}

function integer(value, label, maximum) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new InputIssue(`${label} doit être un entier entre 0 et ${maximum}.`);
  }
  return value;
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new InputIssue(`${label} doit être un nombre fini strictement positif.`);
  }
  return value;
}

function money(value, label, allowNegative = false) {
  if (missing(value)) unavailable(`${label} est nécessaire au calcul.`);
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new InputIssue(`${label} doit être un montant décimal.`);
  }
  const text = String(value).trim();
  if (!/^-?\d{1,12}(?:\.\d{1,24})?$/.test(text)) {
    throw new InputIssue(`${label} : utiliser un montant décimal simple, au maximum 24 décimales, sans exposant.`);
  }
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  let units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(SCALE_DIGITS, '0'));
  if (negative) units = -units;
  if (!allowNegative && units < 0n) throw new InputIssue(`${label} ne peut pas être négatif.`);
  return units;
}

function amount(units) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const fraction = String(absolute % SCALE).padStart(SCALE_DIGITS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${absolute / SCALE}${fraction ? `.${fraction}` : ''}`;
}

// Neumaier compensated summation limits loss of small positive probabilities.
function sum(values) {
  let total = 0;
  let correction = 0;
  for (const value of values) {
    const next = total + value;
    correction += Math.abs(total) >= Math.abs(value)
      ? (total - next) + value : (value - next) + total;
    total = next;
  }
  return total + correction;
}

function betaBinomial(n, alpha, beta) {
  const logs = new Float64Array(n + 1);
  let maximum = 0;
  for (let k = 0; k < n; k += 1) {
    // Group the nonnegative integer first: tiny positive beta must survive at k=n-1.
    logs[k + 1] = logs[k] + Math.log(n - k) - Math.log(k + 1)
      + Math.log(alpha + k) - Math.log(beta + (n - k - 1));
    maximum = Math.max(maximum, logs[k + 1]);
  }
  const weights = Array.from(logs, value => Math.exp(value - maximum));
  const total = sum(weights);
  return weights.map(weight => weight / total);
}

function probabilityOf(distribution, margin, expenses, target) {
  const matching = [];
  for (let k = 0; k < distribution.length; k += 1) {
    if (BigInt(k) * margin - expenses >= target) matching.push(distribution[k]);
  }
  return Math.max(0, Math.min(1, sum(matching)));
}

/**
 * Flat API. Missing evidence -> not_estimable; invalid values -> invalid_input.
 * scenario treats supplied counts AND chosen prior as hypotheses, not observations.
 * Counts count purchasers (at most one per eligible visit), not number of items sold.
 */
export function assessProbability(input = {}) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new InputIssue('Les paramètres doivent être un objet.');
    }
    const mode = input.mode === undefined ? 'observations' : input.mode;
    if (mode !== 'observations' && mode !== 'scenario') {
      throw new InputIssue('Le mode doit être observations ou scenario.');
    }
    if (mode === 'observations' && missing(input.clicks)) {
      unavailable('Aucune donnée de visites et achats : la probabilité de succès est non estimable.');
    }
    const clicks = integer(mode === 'scenario' && missing(input.clicks) ? 0 : input.clicks, 'Les visites observées', MAX_OBSERVATIONS);
    if (mode === 'observations' && missing(input.purchasers)) unavailable('Le nombre d’acheteurs observés est nécessaire.');
    const purchasers = integer(mode === 'scenario' && missing(input.purchasers) ? 0 : input.purchasers, 'Les acheteurs', MAX_OBSERVATIONS);
    if (purchasers > clicks) throw new InputIssue('Le nombre d’acheteurs ne peut pas dépasser le nombre de visites.');
    if (mode === 'observations' && clicks === 0) {
      unavailable('Zéro visite observée : un prior ne constitue pas une preuve de demande.');
    }
    if (mode === 'observations') {
      if (typeof input.provenance !== 'string' || !input.provenance.trim()) {
        unavailable('Indiquer la source réelle des visites et des achats. Des prix ou avis publics ne suffisent pas.');
      }
      if (input.windowClosed !== true) unavailable('La fenêtre d’attribution des achats doit être close.');
      if (input.comparableTraffic !== true) unavailable('La comparabilité du trafic observé et du trafic futur doit être confirmée.');
    }
    if (missing(input.priorAlpha) || missing(input.priorBeta)
      || typeof input.priorJustification !== 'string' || !input.priorJustification.trim()) {
      unavailable('Choisir explicitement alpha, bêta et la justification du prior ; aucun prior implicite n’est appliqué.');
    }
    const priorAlpha = positive(input.priorAlpha, 'Alpha du prior');
    const priorBeta = positive(input.priorBeta, 'Bêta du prior');
    const alpha = priorAlpha + purchasers;
    const beta = priorBeta + (clicks - purchasers);
    if (!Number.isFinite(alpha + beta)) throw new InputIssue('Les paramètres du prior sont trop grands.');
    if (missing(input.expectedTraffic)) unavailable('Le nombre de visites futures sur la période est nécessaire.');
    const futureVisits = integer(input.expectedTraffic, 'Les visites futures', MAX_TRAFFIC);
    const margin = money(input.variableMargin, 'La marge variable', true);
    const fixed = money(input.fixedCosts, 'Les charges fixes');
    const spend = money(input.futureAcquisitionSpend, 'Le budget d’acquisition');
    const target = money(missing(input.targetProfit) ? '300' : input.targetProfit, 'Le profit cible', true);
    const distribution = betaBinomial(futureVisits, alpha, beta);
    const expectedPurchases = futureVisits * (alpha / (alpha + beta));
    const expenses = fixed + spend;
    const assumptions = [
      mode === 'scenario'
        ? 'Scénario hypothétique : prior et éventuels comptes saisis sont des hypothèses, sans preuve de demande.'
        : 'Estimation conditionnelle aux observations déclarées ; leur authenticité n’est pas vérifiée par cet outil.',
      'Le prior est un choix explicite, pas une fréquence de succès mesurée pour des produits comparables.',
      'Visites indépendantes conditionnellement à un taux stable ; un acheteur au plus par visite admissible.',
      'Le trafic futur et le budget sont fixés par hypothèse ; leur atteignabilité et le CPC futur ne sont pas établis.',
      'La marge variable doit inclure les coûts pertinents et pertes moyennes. Les retours aléatoires et leurs risques extrêmes ne sont pas modélisés.',
      'Les charges fixes sont déduites une seule fois ; ne pas aussi les allouer dans la marge variable.',
      'Zéro commande peut satisfaire profit ≥ 0 lorsque les charges sont nulles ; examiner aussi un objectif positif.',
      'Les probabilités sont conditionnelles au modèle et calculées en virgule flottante, pas une certitude intrinsèque de succès du produit.',
    ];
    return {
      status: mode === 'observations' ? 'conditional_estimate' : 'scenario',
      probability: probabilityOf(distribution, margin, expenses, target),
      breakEvenProbability: probabilityOf(distribution, margin, expenses, 0n),
      probabilityAtLeast300: probabilityOf(distribution, margin, expenses, 300n * SCALE),
      probabilityZeroPurchases: distribution[0],
      expectedPurchases,
      expectedProfit: expectedPurchases * Number(margin) / Number(SCALE) - Number(expenses) / Number(SCALE),
      assumptions,
      definition: 'Sur 30 jours : profit = acheteurs × marge variable − charges fixes − budget d’acquisition ; succès si profit ≥ objectif.',
      horizonDays: 30,
      posterior: { alpha, beta },
      prior: { alpha: priorAlpha, beta: priorBeta, justification: input.priorJustification.trim() },
      observations: { clicks, purchasers, provenance: typeof input.provenance === 'string' ? input.provenance.trim() : null, treatedAsHypotheses: mode === 'scenario' },
      expectedTraffic: futureVisits,
      targetProfit: amount(target),
      variableMargin: amount(margin),
      fixedCosts: amount(fixed),
      futureAcquisitionSpend: amount(spend),
    };
  } catch (error) {
    return {
      status: error instanceof InputIssue ? error.status : 'invalid_input',
      probability: null,
      reason: error instanceof InputIssue ? error.message : 'Les paramètres ne permettent pas un calcul valide.',
    };
  }
}
