# Dossier Commerce

Atelier gratuit de recherche : relever des offres publiques, conserver leurs sources et examiner des scénarios économiques. Il ne s'agit pas d'une boutique ni d'un moteur qui attribue une probabilité de succès à un produit à partir d'une URL.

## Utiliser l'atelier

1. Choisir un des quatre dossiers documentés, ou un dossier personnel.
2. Importer une page produit enregistrée en HTML / JSON-LD, avec son URL d'origine. Le collecteur en favori peut aussi télécharger localement les seuls champs produit/offre d'une page publique.
3. Vérifier les variantes, devises et conditions. Les prix importés ne sont pas automatiquement assimilés à un coût livré ou à un prix hors taxe.
4. Renseigner les paramètres économiques. Un coût manquant reste inconnu.
5. Pour une estimation probabiliste, fournir des observations d'achats comparables, une définition de la réussite, un trafic futur supposé et un prior explicite. Le mode pédagogique reste signalé comme hypothétique.
6. Exporter le dossier en JSON, puis utiliser **Reprendre** pour restaurer ses entrées. Les résultats importés ne sont jamais considérés comme validés ni recalculés automatiquement. Les documents HTML complets ne sont pas exportés, ni transmis à un serveur.

Les exemples de recherche datent du 29 octobre 2026. Ils restent tous **non validés pour un lancement**. Un prix catalogue connu ne valide pas la qualité, la livraison d'une commande particulière ou la demande pour une nouvelle offre.

## Essayer le produit physique

[Trace — créateur d'affiches GPX](route-poster/index.html) transforme un parcours en affiche 30 × 40 cm et exporte gratuitement un SVG ou un PNG haute résolution. Le traitement reste local, sans fond de carte ni envoi du parcours. L'exemple initial est fictif et signalé dans les exports.

Le dossier correspondant documente Print API : 3,80 € HT d'impression + 10,75 € HT de port France + 0,40 € HT de traitement, soit **14,95 € HT indicatifs pour une unité**. Une API acceptant des fichiers distincts est documentée. L'accès live, le devis final, le fichier prêt à imprimer et la qualité physique restent à qualifier. Aucun paiement ni ordre d'impression n'est activé.

## Fonctionnement

Application statique, JavaScript natif, sans dépendance d'exécution, sans backend, sans compte et sans suivi applicatif. Le seul chargement de données est le fichier de recherche statique `data/cases.json` du même site. Les documents et paramètres importés restent dans le navigateur ; rien n'est sauvegardé automatiquement.

Le nom « probabilité » désigne ici un résultat **conditionnel au modèle et aux entrées déclarées**, pas une chance de réussite intrinsèque du produit. Sans observations pertinentes, aucun résultat étayé n'est calculé. En mode hypothétique, tous les pourcentages restent des conséquences des hypothèses choisies.

### Modèle économique

La marge variable est la recette après TVA collectée, moins le produit livré, les frais de paiement et une provision moyenne d'incidents. Les paramètres de TVA sont des hypothèses à adapter. Les charges fixes sont ensuite allouées pour les seuils unitaires, ou comptées une seule fois sur la période dans le modèle probabiliste.

Les résultats excluent le temps de travail, les charges sociales et les impôts non explicitement saisis. La marge calculée en JavaScript est arrondie à six décimales avant transmission au moteur probabiliste. Celui-ci compare les montants décimaux reçus exactement pour les seuils ; les probabilités sont calculées en virgule flottante.

### Modèle probabiliste

Avec `x` acheteurs uniques parmi `n` visiteurs éligibles, et un prior explicite `Beta(α, β)`, le modèle utilise le posterior `Beta(α+x, β+n−x)`. Le nombre d'acheteurs parmi `N` visiteurs futurs suit la loi bêta-binomiale. On additionne les probabilités des nombres d'acheteurs pour lesquels la contribution atteint l'objectif.

Les observations doivent être comparables, la fenêtre d'achat terminée, les coûts cohérents et le volume futur atteignable. L'outil ne vérifie pas l'authenticité de la provenance déclarée. Il ne modélise ni la saisonnalité future, ni une élasticité prix/conversion, ni la distribution aléatoire des retours. Une provision moyenne n'est pas une garantie de pertes limitées.

L'analyse de sensibilité applique séparément quatre variations choisies : acquisition +20 %, trafic −20 %, concentration du prior divisée par deux ou doublée. Ce ne sont ni des scénarios assortis de probabilités ni un intervalle de confiance. Aucun résultat agrégé n'en est tiré.

- [Loi bêta-binomiale — documentation SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.betabinom.html)
- [Extraction et collecte locales](EXTRACTION.md)
- [Recherche concurrentielle et limites du positionnement](RESEARCH.md)
- [Données publiques et conditions d'un modèle de réussite avant lancement](DATA-AVAILABILITY.md)

## Développement et validation

Servir le dossier avec un serveur statique, par exemple `python -m http.server 8848 --bind 127.0.0.1`. Les modules et le JSON ne doivent pas être ouverts directement en `file://`.

```bash
# Tests purs, Node 20 ou supérieur, aucune installation npm requise
npm test

# Tests d'extraction et de parcours, Python + Playwright + Chromium
# Le binaire Chromium est attendu à /usr/bin/chromium dans cet environnement.
python tests/test_extract.py
python tests/test_app.py

# Import GPX, géométrie, exports et affichage du créateur d'affiches
python route-poster/tests/browser_test.py
```

Les tests navigateur créent leurs propres serveurs locaux et ne contactent aucun site marchand. Les tests couvrent notamment les montants manquants, TVA, variantes, devises, captures, HTML hostile, données non pertinentes exclues du collecteur, calculs probabilistes analytiques, limites numériques, exemples fictifs, export et affichage mobile.

La politique CSP interdit les scripts et cadres externes. Les imports HTML sont neutralisés avant parsing, et les champs extraits sont rendus comme texte. Les URL n'acceptent que HTTP(S) ; leurs paramètres et fragments sont retirés pour éviter de recopier des identifiants, ce qui peut nécessiter de revérifier la variante.

## Publication

Cette version est un outil gratuit de recherche et d'apprentissage. Elle ne contient aucun paiement, catalogue marchand, abonnement, promesse de gain ou transaction commerciale. L'hébergement d'une future activité commerciale nécessiterait un service et une configuration adaptés ; la publication de cette version ne constitue pas le lancement d'une activité rentable.

Les imports utilisateurs ne sont jamais enregistrés dans le dépôt. L'hébergeur peut conserver ses propres journaux techniques. Les noms de marques mentionnés servent uniquement à citer les sources, sans affiliation revendiquée.
