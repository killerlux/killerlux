# Import et collecte d'offres publiques

## API de l'extracteur

```js
import { extractOffers } from './src/extract.js';
const result = await extractOffers(htmlOuJSON, {
  format: 'auto', // ou 'html' / 'json'
  sourceUrl: 'https://exemple.fr/article',
  captureTime: null // timestamp ISO seulement s'il est connu
});
```

L'entrée peut être une chaîne HTML/JSON ou un objet JSON déjà décodé. Limite : 5 Mio par document. `DOMParser` est nécessaire uniquement pour le HTML. Aucune requête réseau n'est effectuée.

Résultat : `schemaVersion`, `source`, `candidates`, `warnings`. Chaque candidat contient `product`, `offer`, `evidence`, `provenance`, `warnings` et un identifiant local. Les montants sont des **chaînes décimales** ou `null`, jamais un zéro substitué à un prix absent. `AggregateOffer` expose une fourchette et laisse `price` à `null`. Les offres et variantes sont séparées. EUR et USD restent distincts.

`source.captureTime` et `source.importTime` sont distincts ; `source.liveVerified` est toujours faux. Le hash SHA-256 du document est calculé si Web Crypto est disponible. Il identifie un fichier, il n'en prouve pas l'authenticité. Les références JSON-LD `@id` sont résolues uniquement à l'intérieur du document ; aucun contexte externe n'est téléchargé.

Les champs `taxIncluded`, `shippingAmount`, `shippingDestination` et `deliveryDays` restent inconnus. Un prix de base ou `InStock` ne démontre pas un coût livré ni une disponibilité à destination. L'extracteur ne calcule aucune probabilité.

Les URL de sortie n'acceptent que HTTP(S), et leurs paramètres, fragments et identifiants sont retirés. Cela protège contre l'export de jetons de session mais peut perdre l'information de variante ; un avertissement le signale. Aucun lien n'est suivi automatiquement.

## Sécurité du HTML importé

Le document original n'est jamais inséré dans la page ni directement remis au navigateur comme document actif. Un tokenizer construit d'abord une structure passive : uniquement des `div` / `pre`, attributs de données autorisés, attributs URL renommés et textes échappés. Les scripts JSON-LD sont conservés comme texte, les autres scripts et les styles sont écartés. `DOMParser` lit ensuite cette structure passive.

Le rendu UI doit utiliser `textContent`, jamais `innerHTML` avec les noms ou preuves importés. Une CSP restrictive reste recommandée pour l'application. Les tests incluent `script`, événements `onerror` / `onload`, images, iframes, SVG, styles externes, CSS et redirection meta : aucune requête ni exécution détectée dans Chromium.

Ce parseur n'est pas un navigateur complet. Les pages nécessitant une exécution JavaScript, les contextes JSON-LD atypiques et le HTML très mal formé peuvent ne pas être interprétés. Les limites structurelles et les erreurs produisent des avertissements.

Le parcours est limité à 64 niveaux, 20 000 nœuds, 100 produits et 200 offres. Les clés JSON de plus de 256 caractères et les branches dont le chemin excède le budget de 1 000 caractères sont ignorées avec avertissement. Le volume cumulé des candidats est plafonné à 1 Mo ; les métadonnées générales s'y ajoutent. Seuls les attributs HTML utiles sont décodés, avec une limite de 256 attributs par balise. Les valeurs de disponibilité non standard sont ignorées, y compris dans les preuves brutes.

## Collecteur en favori

```js
import { createBookmarklet } from './src/collector.js';
favoriteLink.href = createBookmarklet();
favoriteLink.textContent = 'Relever une offre';
```

L'utilisateur glisse ce lien dans ses favoris, ouvre **une page produit publique**, puis utilise le favori. Le code est entièrement contenu dans le favori ; aucun script distant n'est chargé. Certains navigateurs ou sites peuvent bloquer les favoris JavaScript : utiliser alors l'import HTML/JSON, sans contourner leur protection.

Le collecteur lit seulement les blocs JSON-LD de la page courante, résout les références internes et copie une liste de champs produit/offre : nom, marque, SKU/GTIN/MPN, variante, prix, devise, disponibilité et URL. Les avis, auteurs, adresses d'organisation, formulaires, cookies, stockage local et API privées ne sont pas collectés. Les informations de livraison complexes ne sont pas copiées dans cette version.

Le résultat est **téléchargé localement** dans `offres-publiques-AAAA-MM-JJ.json`. Aucune donnée n'est transmise à l'application ou à un tiers. Une page sans produit JSON-LD déclenche un message et ne produit aucun fichier. L'usage doit rester limité aux pages publiques ; les filtres de chemin compte/paiement ne peuvent pas prouver qu'une page est publique.

Les références cycliques sont coupées ; une offre commune à plusieurs variantes reste utilisable. Des budgets globaux bornent les copies de produits et d'offres, et un relevé dépassant 2 Mo après extraction n'est pas téléchargé.

Format de capture accepté directement par `extractOffers` :

```json
{
  "kind": "commerce-evidence-capture",
  "version": 1,
  "sourceUrl": "https://exemple.fr/article",
  "capturedAt": "2026-10-29T12:00:00.000Z",
  "products": [{"@type": "Product", "name": "Article", "offers": [{"@type": "Offer", "price": "14.99", "priceCurrency": "EUR"}]}],
  "warnings": []
}
```

Le collecteur ne relève pas le prix d'un panier, les frais de livraison calculés, les ventes ou la rentabilité. Les données sont celles déclarées par la page au moment de l'exécution.

## Vérification reproductible

```bash
python /workspace/revenue-lab/market-audit/tests/test_extract.py
```

Tests navigateur avec Playwright et `/usr/bin/chromium` : montants et inconnues, variantes et offres référencées, fourchettes, prix ambigus, devises, HTML hostile sans réseau, microdata avec JSON-LD non produit, capture datée, JSON incorrect, taille limite, favori autonome, export local et exclusion de données personnelles placées dans les champs non autorisés. Le serveur de test écoute uniquement sur localhost et ne contacte aucun site externe.
