# Trace — démonstrateur local GPX → affiche

Ouvrir `index.html` via un serveur HTTP statique. Aucun paquet, compte, jeton, API cartographique ou fournisseur n'est nécessaire. Exemple : `python -m http.server 8000` depuis la racine de l'application puis `/route-poster/index.html`.

## Fonctionnement

- GPX 1.0/1.1 : `trk/trkseg/trkpt` et `rte/rtept`, y compris namespace XML. Le fichier et ses coordonnées ne quittent pas le navigateur et ne sont pas persistés.
- Fichiers limités à 2 Mio, 20 000 points et 1 000 segments dessinables ; DTD et entités refusées. XML analysé par `DOMParser`, jamais injecté dans le DOM. Coordonnées finies bornées à latitude ±90 / longitude ±180.
- Distance par Haversine sur tous les points, séparément dans chaque segment. Rayon terrestre moyen 6 371,0088 km. Pas de dénivelé ni de distance corrigée sur terrain ; le bruit GPS affecte le résultat.
- Rendu limité à 2 000 points avec conservation des séparations et des deux extrémités de chaque segment dessinable. Projection locale équirectangulaire, longitude déroulée au passage de ±180°. Cette composition décorative n'est pas une carte de navigation ; les traces très étendues se prêtent moins bien à cette projection.
- Trois compositions de couleurs originales. Une même disposition typographique calcule la taille du titre, ses une ou deux lignes et l'espacement pour le SVG et le PNG ; le texte est échappé en SVG, dessiné par `fillText` en Canvas. Aucun rendu HTML des données importées. Les polices sont locales : un SVG rouvert sur un autre appareil peut changer légèrement de typographie ; le PNG fige le rendu.
- SVG vectoriel 300 × 400 mm, PNG 3 543 × 4 724 pixels : environ 300 pixels/pouce au format 30 × 40 cm. Le PNG n'encode pas une résolution physique personnalisée dans ses métadonnées ; choisir explicitement 30 × 40 cm chez l'imprimeur.
- Les trois trajets de démonstration sont entièrement fictifs : **Le Tour des Quais** (course), **Là-haut, les crêtes** (trail), **La Grande Échappée** (vélo). Les géométries originales évoquent chaque pratique, sans reproduire d'activité ni de circuit tiers. La fiction est identifiée dans l'aperçu et les deux exports ; ce libellé disparaît après import d'un GPX.
- Les téléchargements portent un nom ASCII dérivé du titre, sans caractères de chemin, avec suffixe `exemple-fictif` si nécessaire. Le contenu et le nom sont capturés ensemble au clic, même si le titre est modifié pendant la création du PNG.

## Accueil et liens de campagne

- `index.html#editor` mène à l'éditeur ; `index.html#examples` aux trois exemples. Ces fragments sont stables et n'activent aucun suivi.
- Le bouton principal propose la création et le téléchargement gratuits, sans promettre une impression. Les cartes d'exemple chargent un parcours, un titre et une palette, puis déplacent le focus vers l'éditeur.
- `index.html#gpx-help` explique comment trouver son fichier dans Strava, Garmin Connect et Komoot, avec liens d'aide officiels vérifiés le 29 octobre 2026. Ces liens ne s'ouvrent que par action de l'utilisateur.
- FAQ native au clavier : formats, confidentialité, choix SVG/PNG, absence de commande d'impression, calcul de distance et fiction des exemples. Aucun paiement, pixel publicitaire, cookie ni télémétrie ajouté.

### Contrat de génération des exemples

`core.js` exporte `EXAMPLES` (`run`, `trail`, `ride`), `demoRoute(id = 'run')`, `posterModel(route, { title, palette, date })` et `svgPoster(model)`. Ces fonctions peuvent générer les visuels d'une campagne sans navigateur ; la mesure typographique utilise alors une approximation conservatrice. Pour obtenir exactement les positions typographiques du navigateur, effectuer le rendu dans le même navigateur. Ne pas supprimer la mention de fiction des visuels d'exemple.

## Fournisseurs : documentation, aucune intégration live

Vérifié le 29 octobre 2026. Les tarifs publics peuvent changer.

**Print API** fournit un candidat cohérent : [poster_30x40](https://www.printapi.io/products/posters), 3,80 EUR HT ; [calculateur France, une unité](https://www.printapi.io/shipping-quote?productId=poster_30x40&pageCount=1&quantity=1&country=74), port 10,75 + traitement 0,40 EUR HT. Total public indicatif 14,95 EUR HT. A3 portrait `poster_a3_sta` affiche le même coût mais son ratio diffère. [API avec fichiers propres à chaque commande](https://portal.printapi.nl/test/docs/section/files?t=EN). La [documentation générale](https://portal.printapi.nl/test/docs/section/general?t=EN) exige une demande de compte live après le test ; aucun compte ni commande n'a été créé. Fabrication aux Pays-Bas documentée.

**Printful** : [produit 268, variante 8948](https://api.printful.com/products/268), 30 × 40 cm, prix public 11,44 USD ; [barème Europe Small Posters](https://www.printful.com/shipping), premier article 5,79 USD. Somme indicative 17,23 USD hors taxes ; devis France exact et centre de fabrication non garantis par ce seul relevé. [API](https://developers.printful.com/docs/) autorise un fichier à la volée, puis brouillon et confirmation de commande. La spécification à blanc reste hors application publique ; elle ne contient aucun secret ni fonction d'envoi.

Le fichier produit ici n'est pas un BAT fournisseur qualifié : gabarit, fonds perdus, marges, résolution utile, profil colorimétrique et qualité physique restent à vérifier sur le SKU choisi. Aucune commande, impression, vente ou paiement activé. L'existence de cette chaîne technique ne valide ni la demande ni la rentabilité de l'offre.

## Vérification

Tests navigateur dans `tests/browser_test.py` (Python + Playwright système et Chromium `/usr/bin/chromium`). Les tests n'appellent aucun fournisseur. Les rapports de revue et captures sont conservés hors application publique : `revenue-lab/trace-v2-review.md` et fichiers temporaires mentionnés dans ce rapport.
