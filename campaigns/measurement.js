/** Local aggregate measurements only: no DOM, network, tracking or formula evaluation. */
export const CAMPAIGN_IDS = Object.freeze([
  'trace-souvenir', 'trace-cadeau', 'trace-local',
  'dossier-marge', 'dossier-preuves', 'dossier-comparaison',
]);
export const MEASUREMENT_HEADERS = Object.freeze([
  'campaign_id', 'spend_eur', 'impressions', 'link_clicks',
  'eligible_visitors', 'unique_completers',
]);
export const MEASUREMENT_LIMITS = Object.freeze({ bytes: 100_000, rows: 500, count: 100_000_000, spendEur: 1_000_000 });
const IDS = new Set(CAMPAIGN_IDS);
const GENERAL_WARNINGS = Object.freeze([
  'Les exports et téléchargements gratuits ne sont pas des achats ; le coût par action n’est pas un coût d’acquisition client.',
  'Ces agrégats ne mesurent ni la probabilité de succès commercial ni un ROAS et ne désignent aucune campagne gagnante.',
  'La source, la période et les conditions d’observation sont déclarées ; leur authenticité n’est pas vérifiée par cet outil local.',
]);

class MeasurementError extends Error {}
const fail = message => { throw new MeasurementError(message); };
const absent = value => value === undefined || value === null || value === '';

function detectDelimiter(text) {
  let quoted = false;
  let comma = 0;
  let semicolon = 0;
  let seen = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      seen = true;
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (ch === '\r' || ch === '\n')) {
      if (seen) break;
    } else if (!quoted && ch === ',') {
      comma += 1; seen = true;
    } else if (!quoted && ch === ';') {
      semicolon += 1; seen = true;
    } else if (ch.trim()) seen = true;
  }
  return semicolon > comma ? ';' : ',';
}

function readCSV(input) {
  if (typeof input !== 'string') fail('Le CSV doit être fourni sous forme de texte.');
  if (input.length > MEASUREMENT_LIMITS.bytes || new TextEncoder().encode(input).byteLength > MEASUREMENT_LIMITS.bytes) {
    fail('Le CSV dépasse la limite de 100 000 octets.');
  }
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const records = [];
  let fields = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let recordLine = 1;
  function field() { fields.push(value); value = ''; closedQuote = false; }
  function record() {
    field();
    if (!(fields.length === 1 && fields[0].trim() === '')) {
      records.push({ fields, line: recordLine });
      if (records.length > MEASUREMENT_LIMITS.rows + 1) fail('Le CSV dépasse la limite de 500 lignes de données.');
    }
    fields = [];
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i += 1; }
        else { quoted = false; closedQuote = true; }
      } else if (ch === '\r') {
        value += ch;
        if (text[i + 1] === '\n') { value += '\n'; i += 1; }
        line += 1;
      } else {
        value += ch;
        if (ch === '\n') line += 1;
      }
    } else if (ch === delimiter) {
      field();
    } else if (ch === '\r' || ch === '\n') {
      record();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      line += 1;
      recordLine = line;
    } else if (closedQuote) {
      if (ch !== ' ' && ch !== '\t') fail(`Ligne ${line} : caractère inattendu après le guillemet fermant.`);
    } else if (ch === '"') {
      if (value !== '') fail(`Ligne ${line} : guillemet inattendu dans une valeur non encadrée.`);
      quoted = true;
    } else {
      value += ch;
    }
  }
  if (quoted) fail(`Ligne ${recordLine} : valeur entre guillemets non terminée.`);
  if (value !== '' || fields.length || closedQuote) record();
  if (!records.length) fail('Le CSV est vide.');
  const headers = records.shift().fields.map(header => header.trim());
  if (headers.some(header => !header)) fail('Un en-tête est vide.');
  if (new Set(headers).size !== headers.length) fail('Des en-têtes sont dupliqués.');
  const unknown = headers.filter(header => !MEASUREMENT_HEADERS.includes(header));
  if (unknown.length) fail(`Colonnes inconnues : ${unknown.join(', ')}.`);
  const missing = MEASUREMENT_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) fail(`Colonnes obligatoires absentes : ${missing.join(', ')}.`);
  if (!records.length) fail('Le CSV contient les en-têtes mais aucune ligne de données.');
  for (const row of records) {
    if (row.fields.length !== headers.length) fail(`Ligne ${row.line} : ${row.fields.length} cellules au lieu de ${headers.length}.`);
  }
  return { headers, records, delimiter };
}

function count(raw, name, line) {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) fail(`Ligne ${line} : ${name} doit être un entier positif ou nul, ou une cellule vide.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > MEASUREMENT_LIMITS.count) {
    fail(`Ligne ${line} : ${name} dépasse 100 000 000.`);
  }
  return value;
}

function money(raw, line) {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(text)) {
    fail(`Ligne ${line} : spend_eur exige un montant positif ou nul, sans devise ni séparateur de milliers, avec au plus deux décimales.`);
  }
  const [whole, decimals = ''] = text.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (cents > MEASUREMENT_LIMITS.spendEur * 100) fail(`Ligne ${line} : spend_eur dépasse 1 000 000 EUR.`);
  return cents / 100;
}

function date(value, label) {
  if (absent(value)) return null;
  if (typeof value !== 'string') fail(`${label} doit être une date au format AAAA-MM-JJ.`);
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`${label} doit être une date au format AAAA-MM-JJ.`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) fail(`${label} n’est pas une date calendaire valide.`);
  return text;
}

function metadata(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Les options doivent être un objet.');
  if (!['observations', 'scenario'].includes(options.mode)) fail('Le mode doit être observations ou scenario.');
  if (!absent(options.provenance) && typeof options.provenance !== 'string') fail('La provenance doit être du texte.');
  for (const key of ['windowClosed', 'comparableVisitors']) {
    if (!absent(options[key]) && typeof options[key] !== 'boolean') fail(`${key} doit être un booléen vrai ou faux.`);
  }
  const startDate = date(options.startDate, 'La date de début');
  const endDate = date(options.endDate, 'La date de fin');
  if (startDate && endDate && startDate > endDate) fail('La date de début doit précéder ou égaler la date de fin.');
  const reasons = [];
  if (options.mode !== 'observations') reasons.push('Mode scénario : aucun intervalle d’inférence sur des observations réelles.');
  if (!options.provenance?.trim()) reasons.push('La provenance des observations n’est pas renseignée.');
  if (!startDate || !endDate) reasons.push('La période complète d’observation n’est pas renseignée.');
  if (options.windowClosed !== true) reasons.push('La fenêtre d’attribution des actions n’est pas déclarée close.');
  if (options.comparableVisitors !== true) reasons.push('Des visiteurs comparables et indépendants, comptés une seule fois, ne sont pas déclarés.');
  return { mode: options.mode, startDate, endDate, reasons };
}

function ratio(numerator, denominator) {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
}

function wilson(successes, total) {
  const z = 1.959963984540054;
  const z2 = z * z;
  const p = successes / total;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / total + z2 / (4 * total * total)) / denominator;
  return { lower: successes === 0 ? 0 : Math.max(0, centre - half), upper: successes === total ? 1 : Math.min(1, centre + half), confidence: 0.95, method: 'Wilson bilateral' };
}

/**
 * parseMeasurements(csv, {mode, provenance, startDate, endDate, windowClosed, comparableVisitors})
 * comparableVisitors declares both comparability AND independence/non-duplication.
 * Empty numeric cells are unknown (null); zero denominators give null, never zero.
 * All errors invalidate the import atomically. No automatic aggregation or ranking.
 */
export function parseMeasurements(csv, options = {}) {
  try {
    const meta = metadata(options);
    const parsed = readCSV(csv);
    const positions = Object.fromEntries(parsed.headers.map((header, index) => [header, index]));
    const seen = new Set();
    const rows = parsed.records.map(record => {
      const cell = name => record.fields[positions[name]];
      const campaignId = cell('campaign_id').trim();
      if (!IDS.has(campaignId)) fail(`Ligne ${record.line} : identifiant de campagne inconnu ou vide.`);
      if (seen.has(campaignId)) fail(`Ligne ${record.line} : campagne ${campaignId} répétée ; regrouper une seule période cohérente avant import.`);
      seen.add(campaignId);
      const spendEur = money(cell('spend_eur'), record.line);
      const impressions = count(cell('impressions'), 'impressions', record.line);
      const linkClicks = count(cell('link_clicks'), 'link_clicks', record.line);
      const eligibleVisitors = count(cell('eligible_visitors'), 'eligible_visitors', record.line);
      const uniqueCompleters = count(cell('unique_completers'), 'unique_completers', record.line);
      if (uniqueCompleters !== null && eligibleVisitors !== null && uniqueCompleters > eligibleVisitors) {
        fail(`Ligne ${record.line} : unique_completers ne peut pas dépasser eligible_visitors.`);
      }
      const warnings = [];
      const unknown = Object.entries({ spend_eur: spendEur, impressions, link_clicks: linkClicks, eligible_visitors: eligibleVisitors, unique_completers: uniqueCompleters })
        .filter(([, value]) => value === null).map(([field]) => field);
      if (unknown.length) warnings.push(`Valeurs inconnues, conservées à null : ${unknown.join(', ')}.`);
      const denominators = [['impressions', impressions], ['link_clicks', linkClicks], ['eligible_visitors', eligibleVisitors], ['unique_completers', uniqueCompleters]];
      for (const [field, value] of denominators) {
        if (value === 0) warnings.push(`${field} vaut zéro : les métriques qui l’utilisent comme dénominateur sont inconnues, pas égales à zéro.`);
      }
      const intervalReasons = [...meta.reasons];
      if (eligibleVisitors === null || uniqueCompleters === null) intervalReasons.push('Les visiteurs admissibles et les personnes ayant accompli l’action doivent être connus.');
      else if (eligibleVisitors === 0) intervalReasons.push('Aucun visiteur admissible : le taux d’action et son intervalle ne sont pas estimables.');
      const actionRateIntervalReason = intervalReasons.length ? intervalReasons.join(' ') : null;
      const actionRateWilson95 = actionRateIntervalReason ? null : wilson(uniqueCompleters, eligibleVisitors);
      if (actionRateIntervalReason) warnings.push(actionRateIntervalReason);
      return {
        campaignId, spendEur, impressions, linkClicks, eligibleVisitors, uniqueCompleters,
        metrics: {
          ctr: ratio(linkClicks, impressions),
          cpcEur: ratio(spendEur, linkClicks),
          costPerVisitorEur: ratio(spendEur, eligibleVisitors),
          actionRate: ratio(uniqueCompleters, eligibleVisitors),
          costPerActionEur: ratio(spendEur, uniqueCompleters),
          actionRateWilson95,
          actionRateIntervalReason,
        },
        warnings,
      };
    });
    return { status: 'ok', rows, warnings: [...GENERAL_WARNINGS], mode: meta.mode, delimiter: parsed.delimiter, period: { startDate: meta.startDate, endDate: meta.endDate } };
  } catch (error) {
    return { status: 'invalid', rows: [], warnings: [error instanceof MeasurementError ? error.message : 'Les données ne permettent pas un import valide.', ...GENERAL_WARNINGS] };
  }
}
