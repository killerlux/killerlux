# Mesurer les campagnes avec des agrégats déclarés

Module local : `market-audit/campaigns/measurement.js`. Aucune requête réseau, aucun pixel, aucun suivi utilisateur, aucun stockage et aucune exécution de formule. Il analyse uniquement le CSV fourni par l'utilisateur. Il ne crée pas les données de fréquentation manquantes.

**Les exports gratuits de Trace ou Dossier Commerce ne sont pas des achats.** Le taux calculé est celui d'une action, pas une probabilité de succès commercial. Le coût par action n'est pas un CAC. Aucun revenu, ROAS, score ou classement de campagne gagnante n'est produit.

## CSV accepté

Les **six colonnes** sont obligatoires, dans n'importe quel ordre, avec ces noms exacts :

```csv
campaign_id,spend_eur,impressions,link_clicks,eligible_visitors,unique_completers
trace-souvenir,,,,,
```

La ligne ci-dessus signifie **cinq valeurs inconnues**, pas cinq zéros. Une cellule numérique vide ou composée d'espaces devient `null`. Seule une valeur explicitement saisie comme `0` devient zéro. Les chaînes `null`, `N/A`, `?`, formules, monnaies et séparateurs de milliers ne sont pas interprétés comme des nombres.

Identifiants admis : `trace-souvenir`, `trace-cadeau`, `trace-local`, `dossier-marge`, `dossier-preuves`, `dossier-comparaison`. Un sous-ensemble suffit. Un identifiant répété rend l'ensemble de l'import invalide : ne pas additionner silencieusement des périodes, sources ou populations incompatibles.

- Maximum **100 000 octets UTF-8**, **500 lignes de données** ; les lignes complètement blanches sont ignorées. Avec les six identifiants uniques actuels, au plus six lignes valides peuvent effectivement être importées.
- Séparateur virgule ou point-virgule détecté dans l'en-tête. BOM UTF-8, CRLF/LF, guillemets CSV, guillemets doublés et sauts de ligne encadrés sont analysés. Une valeur contenant une virgule doit être entre guillemets dans un CSV séparé par virgules.
- Montant `spend_eur` : de **0 à 1 000 000 EUR**, au plus deux décimales. `12.50`, `12,50` et `12` sont admis ; `1,234` est rejeté, sans supposer décimale ou millier. Avec virgules comme séparateur, écrire `"12,50"`.
- Comptes : entiers de **0 à 100 000 000**, sans signe, fraction ou notation exponentielle.
- En-têtes inconnus, manquants, dupliqués ou vides ; longueur de ligne incohérente ; guillemets malformés ; valeur invalide : **import atomiquement invalide**, `rows: []`.
- **Seule contrainte relationnelle :** si les deux comptes sont connus, `unique_completers ≤ eligible_visitors`. Il n'est pas imposé que les visiteurs soient inférieurs aux clics, ni que les clics soient inférieurs aux impressions. Les définitions et périmètres de plateformes peuvent différer ; les ratios ne sont pas artificiellement plafonnés à 100 %.

## API exacte

```js
import { parseMeasurements } from './measurement.js';

const result = parseMeasurements(csvText, {
  mode: 'observations', // ou 'scenario', obligatoire
  provenance: '',       // source réelle et méthode de constitution des agrégats
  startDate: '',        // AAAA-MM-JJ ; inconnu si vide
  endDate: '',          // AAAA-MM-JJ ; inconnu si vide
  windowClosed: false,
  comparableVisitors: false
});
```

Le booléen **`comparableVisitors` doit explicitement signifier visiteurs comparables ET indépendants**, sans doublons au sein du dénominateur défini. Il ne faut pas libeller cette case seulement « trafic comparable ». `windowClosed` déclare la fermeture de la fenêtre d'attribution des actions, pas seulement la fin de diffusion publicitaire.

Dates renseignées : format strict et calendrier réel vérifiés, début ≤ fin. Une date impossible ou une option de mauvais type rend l'import invalide. Source ou date absente, période partielle ou déclarations manquantes : les métriques descriptives restent disponibles, **l'intervalle ne l'est pas**. L'outil ne consulte pas une horloge externe et ne vérifie ni la source ni la vérité des déclarations de clôture/comparabilité.

Retour valide :

```js
{
  status: 'ok',
  mode: 'observations',
  delimiter: ',',
  period: { startDate: '2026-10-01', endDate: '2026-10-20' },
  rows: [{
    campaignId: 'trace-souvenir',
    spendEur: 30,
    impressions: 1000,
    linkClicks: 100,
    eligibleVisitors: 80,
    uniqueCompleters: 20,
    metrics: {
      ctr: 0.1,
      cpcEur: 0.3,
      costPerVisitorEur: 0.375,
      actionRate: 0.25,
      costPerActionEur: 1.5,
      actionRateWilson95: { lower: 0.168, upper: 0.355, confidence: 0.95, method: 'Wilson bilateral' },
      actionRateIntervalReason: null
    },
    warnings: []
  }],
  warnings: ['... limites d’interprétation ...']
}
```

**Cet objet illustre le format avec des nombres fictifs ; ses bornes sont arrondies pour la documentation. Il ne décrit aucune campagne diffusée.** L'API renvoie les bornes calculées sans cet arrondi.

En cas d'erreur : `{status:'invalid', rows:[], warnings:[motif, ...limites]}`. L'appel retourne un objet JSON et ne lève pas d'exception attendue. Les messages et sources doivent être affichés comme du texte, jamais injectés en HTML.

## Calculs et valeurs inconnues

| Métrique | Formule | Unité |
|---|---|---|
| `ctr` | clics de lien / impressions | Fraction, multiplier par 100 pour afficher % |
| `cpcEur` | dépenses / clics de lien | EUR par clic |
| `costPerVisitorEur` | dépenses / visiteurs admissibles | EUR par visiteur |
| `actionRate` | personnes ayant complété / visiteurs admissibles | Fraction |
| `costPerActionEur` | dépenses / personnes ayant complété | EUR par personne ayant complété |

Un numérateur ou dénominateur inconnu produit `null`. Un dénominateur zéro produit également `null`, jamais zéro ou une valeur infinie. Exemples : dépenses 0 avec 10 clics → CPC 0 ; dépenses 10 avec 0 clic → CPC inconnu ; 0 action pour 100 visiteurs → taux d'action 0, coût/action inconnu.

Ne pas utiliser `Number(null)` ou `value || 0` à l'affichage ou à l'export. Afficher explicitement « inconnu / non calculable ». Les données ne sont pas remplacées par des moyennes de marché. Les bornes des montants et comptes protègent le calcul ; elles ne prouvent pas la qualité des déclarations.

## Wilson : conditions et interprétation

Le module renvoie `actionRateWilson95` uniquement quand : mode `observations`, source non vide, deux dates valides, fenêtre déclarée close, visiteurs déclarés comparables et indépendants, `eligibleVisitors > 0`, complétions connues. Sinon : `null`, accompagné du motif visible `actionRateIntervalReason`, également repris dans les avertissements de ligne. Le mode `scenario` ne produit jamais cet intervalle, même avec des chiffres et métadonnées complets.

Pour `x` personnes ayant complété sur `n` visiteurs admissibles, `p̂=x/n` et `z=1,959963984540054` :

`centre = (p̂+z²/(2n))/(1+z²/n)`

`demi-largeur = z√(p̂(1−p̂)/n+z²/(4n²))/(1+z²/n)`.

L'intervalle bilatéral à 95 % est `centre ± demi-largeur`, borné à `[0,1]`. Par exemple, **50/100 → [0,40383153 ; 0,59616847]**, et **0/100 → [0 ; 0,03699350]**. Zéro action observée n'implique pas un vrai taux nul ; **0/0 ne donne aucun intervalle**.

La couverture à 95 % concerne cette procédure statistique sous ses hypothèses, **pas une chance à 95 % que la campagne ou le produit réussisse**. Elle ne corrige pas un échantillon biaisé, des visiteurs dupliqués, des définitions d'action changeantes ou des conversions tardives. Une comparaison de six intervalles ne fournit pas automatiquement un gagnant statistique ; sélection multiple et populations différentes restent à examiner.

Avant de saisir les comptes, définir l'action et la fenêtre par application : un clic sur la publicité, une visite, l'ouverture de l'exemple fictif et un export réellement terminé sont des événements différents. Compter les personnes ayant terminé **une seule fois** dans la période admissible. Des personnes uniques par campagne ne sont pas automatiquement uniques entre plusieurs campagnes ; l'outil n'agrège pas ces populations.

## Vérification

`node --test /workspace/revenue-lab/market-audit/campaigns/measurement.test.mjs`

Références analytiques Wilson vérifiées indépendamment ; tests des inconnues/zéros, modalités de preuve, calendrier et années bissextiles, parsing CSV, guillemets, formats français, identifiants, absence de coercition/formules, limites, absence de mutation et JSON sûr. Les fixtures des tests sont toutes synthétiques.
