import { assessProbability } from './probability.js';

const CALCULABLE = new Set(['conditional_estimate', 'scenario']);
const DISCLAIMER = 'Variations arbitraires pour tester la fragilité du calcul. Elles ne sont ni des probabilités de scénarios, ni un intervalle de confiance. Aucune agrégation en chance de succès.';

/** Increase a validated nonnegative decimal budget by 20%, rounding UP to cents.
 * Rounding upwards keeps the cost stress non-decreasing even below one cent.
 * BigInt is used internally only; decimal inputs never pass through Number here.
 */
function increasedBudget(value) {
  const [whole, fractional = ''] = value.split('.');
  const denominator = 10n ** BigInt(fractional.length);
  // Euros × 1.2 × 100 cents = euros × 120.
  const numerator = BigInt(whole + fractional) * 120n;
  const cents = (numerator + denominator - 1n) / denominator;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function scaledPrior(value, factor) {
  const scaled = value * factor;
  // Keep out-of-range variations invalid and JSON-safe, instead of serialising Infinity as null.
  return Number.isFinite(scaled) ? scaled : String(scaled);
}

/**
 * Pure sensitivity analysis using the exact input schema of assessProbability.
 * Returns four separate conditional assessments, never a weighted aggregate.
 * No observations, prior or financial input is invented when the base is missing.
 * A variation outside the calculator's supported range keeps its invalid result.
 */
export function assessSensitivity(input = {}) {
  const base = assessProbability(input);
  if (!CALCULABLE.has(base.status)) {
    return { status: base.status, reason: base.reason, base, rows: [], disclaimer: DISCLAIMER };
  }

  const adjustedBudget = increasedBudget(base.futureAcquisitionSpend);
  const traffic = Math.floor(base.expectedTraffic * 4 / 5);
  const variants = [
    {
      id: 'acquisition_plus_20',
      label: 'Budget d’acquisition +20 %',
      note: base.futureAcquisitionSpend === '0'
        ? 'Le budget initial est nul : +20 % reste 0,00. Aucun coût minimal n’est inventé.'
        : 'Trafic inchangé. Budget multiplié par 1,2 puis arrondi au centime supérieur ; pour un très petit montant, l’arrondi peut dépasser +20 %.',
      patch: { futureAcquisitionSpend: adjustedBudget },
    },
    {
      id: 'traffic_minus_20',
      label: 'Trafic futur −20 %, budget inchangé',
      note: base.expectedTraffic === 0
        ? 'Le trafic initial est nul : il reste nul. Aucun visiteur n’est ajouté.'
        : 'Nombre de visites multiplié par 0,8, arrondi à l’entier inférieur. Le budget d’acquisition reste identique.',
      patch: { expectedTraffic: traffic },
    },
    {
      id: 'prior_half_strength',
      label: 'Concentration du prior ×0,5',
      note: 'Alpha et bêta du prior divisés par deux. Sa moyenne préalable reste identique ; après les observations, la moyenne postérieure peut changer.',
      patch: { priorAlpha: scaledPrior(input.priorAlpha, 0.5), priorBeta: scaledPrior(input.priorBeta, 0.5) },
    },
    {
      id: 'prior_double_strength',
      label: 'Concentration du prior ×2',
      note: 'Alpha et bêta du prior multipliés par deux. Sa moyenne préalable reste identique ; le résultat n’est pas nécessairement meilleur ou pire.',
      patch: { priorAlpha: scaledPrior(input.priorAlpha, 2), priorBeta: scaledPrior(input.priorBeta, 2) },
    },
  ];

  const rows = variants.map(({ id, label, note, patch }) => {
    const variantInput = { ...input, ...patch };
    const result = assessProbability(variantInput);
    return {
      id, label,
      note: CALCULABLE.has(result.status) ? note : `${note} Variante non calculable : ${result.reason}`,
      changes: Object.entries(patch).map(([field, after]) => ({ field, before: input[field], after })),
      input: variantInput,
      result,
    };
  });

  return { status: 'calculated', base, rows, disclaimer: DISCLAIMER };
}
