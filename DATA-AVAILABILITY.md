# Peut-on apprendre la probabilité de réussite d'un produit avant son lancement ?

**Conclusion : aucun des trois jeux publics examinés ne permet de mesurer directement la probabilité « un nouveau produit rapporte au moins 300 EUR de bénéfice en 30 jours, après acquisition et coûts ».** Ils documentent des transactions, des événements de navigation ou des impressions publicitaires. Leurs unités et leurs labels ne sont pas des lancements commerciaux avec comptes complets. Cette limite ne vient pas d'un manque de puissance de calcul : le résultat à prédire n'est pas observable dans ces données.

Recherche effectuée le **29 octobre 2026**, uniquement dans les descriptions et schémas officiels. Aucun fichier transactionnel téléchargé, aucune requête BigQuery exécutée, aucune inscription, installation ou dépense. Les volumes ci-dessous sont annoncés par les éditeurs, pas mesurés par notre propre import.

## 1. Trois jeux réellement examinés

| Jeu officiel | Contenu documenté | Ce qu'on pourrait étudier | Ce qui empêche de calculer le succès demandé |
|---|---|---|---|
| **[UCI Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail)** | **541 909 lignes** de transactions, du **1er décembre 2010 au 9 décembre 2011**, d'un vendeur en ligne établi au Royaume-Uni. Cadeaux ; nombreux clients grossistes. Champs : `InvoiceNo`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `UnitPrice` en livres sterling, `CustomerID`, `Country`. Préfixe `c` de facture : annulation. | Calculs de montant transactionnel, annulations, paniers, réachat et saisonnalité **dans cette entreprise**. | Pas de visites/expositions ni de budget d'acquisition ; pas de coût d'achat produit, coût logistique complet, frais de paiement ou charges fixes documentés ; pas de registre de lancement ni de date de lancement. Les articles sans transaction ne forment pas un groupe d'échecs observable. Une première apparition dans le fichier peut être la première vente observée d'un ancien article. |
| **[Google GA4, échantillon e-commerce BigQuery](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)** | Échantillon **obfusqué** du Google Merchandise Store, du **1er novembre 2020 au 31 janvier 2021**. Événements, identifiants pseudonymes, articles et achats. Google annonce des valeurs de remplacement (`<Other>`, `NULL`, chaîne vide) et une **cohérence interne limitée par l'obfuscation**. | Apprendre à reconstruire des parcours et un dénominateur de visiteurs, distinguer acheteurs/événements, agréger des revenus **de cet échantillon**. Les [exemples officiels](https://developers.google.com/analytics/bigquery/basic-queries) utilisent `user_pseudo_id`, `purchase`, `items.item_id`, `items.item_name` et `add_to_cart`. | Une seule boutique d'une marque déjà connue, pas une population de nouveaux commerces. Aucun registre complet de coût produit, factures publicitaires, frais, pertes et charges fixes par lancement n'est documenté. Le chiffre d'affaires n'est pas le bénéfice. L'obfuscation limite même certains rapprochements internes. |
| **[Criteo Attribution Modeling for Bidding](https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/)** | Publication du **10 octobre 2017** ; échantillon de **30 jours** de trafic Criteo, **16,5 millions d'impressions**, **45 000 conversions**, **700 campagnes**. Une ligne = une impression, avec `uid`, `campaign`, `click`, `conversion`, `conversion_id`, horodatages, `attribution`, `cost`, `cpo`, catégories contextuelles anonymisées. | Tester des modèles d'attribution et de conversion publicitaire dans ce périmètre ; reconstruire des événements avec `conversion_id` ; apprendre les limites des métriques publicitaires. | **`cost` et `cpo` sont explicitement des valeurs transformées, pas les vrais prix**. `cost` est le prix payé par Criteo pour l'impression, pas un compte complet du vendeur. Pas de prix produit exploitable, coût fournisseur, retour, marge, charge fixe ni lancement identifié. Une conversion à 30 jours après une impression n'est pas le succès à 30 jours après un lancement. |

Les champs GA4 actuels `ecommerce.purchase_revenue`, `refund_value`, `shipping_value`, `tax_value` et `items.item_revenue` sont décrits dans le [schéma d'export officiel](https://support.google.com/analytics/answer/7029846?hl=en). **Un champ d'expédition ou de taxe envoyé dans un événement n'est pas une comptabilité fournisseur auditée.** Le schéma général actuel ne prouve pas que chaque champ est effectivement rempli dans l'échantillon de 2020–2021 ; aucun inventaire de colonnes ou audit de qualité n'a été exécuté ici. Aucun registre complet de dépenses publicitaires/COGS par lancement n'est documenté par la présentation de cet échantillon.

Pour Criteo, plusieurs impressions peuvent porter la même conversion : les identifiants permettent justement de reconstruire les trajectoires. Compter les lignes positives comme autant de ventes ou traiter les millions d'impressions comme des millions de lancements indépendants serait incorrect. **Attribution à une régie, conversion causée par cette régie et bénéfice du marchand sont trois quantités différentes.**

## 2. Pourquoi même une régression sophistiquée ne répare pas le label absent

Définissons une ligne statistique comme un lancement `i`, et non comme une vente ou un clic :

`Πᵢ,30 = recettes nettes de TVA et remboursements − coûts produits/livraison − acquisition − frais de paiement − autres pertes nettes − charges fixes attribuables`.

L'événement principal est `Yᵢ = 1[Πᵢ,30 ≥ 300 EUR]` ; l'équilibre `1[Πᵢ,30 ≥ 0]` est un objectif distinct. Les coûts et remboursements doivent suivre une convention unique, sans double comptage ni TVA récupérable artificiellement traitée comme coût.

**Contre-exemple d'identification, entièrement fictif :** les mêmes ventes publiques de 1 000 EUR sont compatibles avec 500 EUR de coûts totaux, soit +500 EUR de résultat, ou 1 200 EUR de coûts, soit −200 EUR. Si les coûts ne figurent pas dans le jeu, les deux mondes produisent exactement les mêmes observations publiques mais des labels opposés. Aucune formule ajustée seulement sur ces observations ne peut choisir lequel est vrai.

Le problème reste présent en ajoutant arbitrairement une marge « moyenne » ou un CAC supposé : on crée alors un **label simulé sous hypothèses**, pas un résultat commercial observé. Mélanger UCI pour les ventes, GA4 pour les visites et Criteo pour les coûts ne relie pas les mêmes produits, marchands, dates ou marchés. Cela ne reconstitue pas des comptes manquants.

## 3. Sélection et transfert vers la France/Europe en 2026

- **UCI** : un seul marchand déjà en activité, produits apparaissant dans ses transactions. Filtrer `Country=France` sélectionne la résidence de clients de ce vendeur britannique historique ; cela ne transforme pas le jeu en cohorte de nouveaux vendeurs français. La date de lancement et les tentatives sans vente restent inconnues.
- **GA4** : les visiteurs et produits de Google Merchandise Store ne représentent pas automatiquement une boutique inconnue sans audience. Les mois novembre–janvier, l'année 2020–2021 et l'obfuscation limitent la comparaison temporelle et commerciale.
- **Criteo** : seules les impressions sélectionnées/servies par une régie puis sous-échantillonnées sont visibles. Les neuf catégories contextuelles n'ont pas de signification publique ; aucune correspondance avec nos caractéristiques de produit n'est démontrée. Les pratiques publicitaires, la mesure et les coûts de 2026 ne sont pas établis par cette publication de 2017.

Transférer une probabilité demanderait notamment que la relation entre variables et succès soit pertinente dans la population cible. **Cette invariance n'est ni donnée ni testée ici.** Un score de test élevé sur l'un de ces jeux ne prouve pas la calibration pour un lancement France/Europe 2026. Même l'estimation d'un taux de conversion de visiteurs n'est pas une estimation de la probabilité qu'un produit lancé devienne rentable.

## 4. Le jeu d'apprentissage qui répondrait réellement à la question

Un futur registre doit comporter **une ligne par lancement produit–offre–vendeur–marché**, avec :

| Bloc | Données indispensables |
|---|---|
| Identité du lancement | Identifiant de lancement, groupe vendeur et famille de produits, date `t0` fixée, pays cible, devise, canal et politique commerciale de référence. Les identifiants techniques de groupe peuvent être pseudonymes ; aucun nom de client n'est nécessaire au modèle. |
| Photographie **avant** lancement | Prix prévu, devis produit/port, régime de TVA pertinent, délai annoncé et source, budget/canal prévus, audience déjà accessible, caractéristiques du produit, offre concurrente et date de capture. Documenter les valeurs inconnues, pas les remplacer par des valeurs avantageuses. |
| Résultat et coûts | Ventes des 30 jours, revenus nets, acquisition réellement payée, produit/transport/frais, remboursements et remboursements fournisseur, charges fixes selon règle préétablie. Séparer revenu, marge et trésorerie encaissée. |
| Maturité et sélection | Lancement effectif ou non, arrêt après lancement, absence de vente, fermeture, qualité des comptes, date de clôture d'attribution et délai de retour. Signaler les observations incomplètes plutôt que les étiqueter arbitrairement « échec ». |

Les lancements avec zéro vente, arrêtés tôt ou appartenant à des vendeurs ayant fermé doivent rester dans la cohorte des **lancements effectivement réalisés**, si leurs résultats sont connus. À l'inverse, un produit jamais lancé n'a pas de résultat commercial contrefactuel observé : on ne peut pas le marquer automatiquement comme échec de marché. Pour prédire « succès après une décision de créer un projet » plutôt que « succès après lancement », il faut définir une autre population et un autre point de départ.

L'horizon doit être explicite : **bénéfice économique des commandes acquises pendant 30 jours**, avec leurs retours connus plus tard, ou **trésorerie effectivement reçue à J30**. Ce ne sont pas les mêmes labels. Dans le premier cas, un label peut n'être mûr qu'après la fermeture des fenêtres de retour/contestation ; les lancements récents ne peuvent pas tous entrer immédiatement dans l'entraînement.

Le registre viserait des résultats agrégés de lancements autorisés, pas une collecte de profils personnels. Aucun tel registre n'est constitué dans cette recherche. Son nombre de lancements indépendants, de succès, d'échecs et de vendeurs est **inconnu**.

## 5. Protocole mathématique futur : apprendre, puis vérifier la calibration

1. **Figer la cible et la population avant de regarder les résultats.** Par exemple `Y=1[Π30≥300]` pour de nouveaux lancements en France, selon une politique de budget et un contexte définis. Le taux de base est alors la fréquence dans une cohorte pertinente, pas une moyenne générale d'Internet.

2. **Définir des variables disponibles à `t0`.** Une régression logistique envisageable serait `pᵢ = 1 / [1 + exp(−(β₀ + βᵀXᵢ))]`. Les coefficients `β` doivent être ajustés sur de vrais couples `(Xᵢ,Yᵢ)` ; aucun coefficient n'est estimé ou inventé ici. Les ventes, clics, conversion, avis et CAC réalisés **après** lancement sont interdits comme prédicteurs d'une décision prise **avant** lancement. Une capture concurrentielle actuelle ne peut pas être utilisée comme si elle était disponible des années auparavant.

3. **Séparer entraînement, calibration et test final.** Réserver des lancements chronologiquement ultérieurs ; contrôler les groupes vendeur et familles de produits selon l'usage visé, afin qu'une variante presque identique n'apparaisse pas dans train et test. Ajuster encodages, valeurs manquantes, sélection de variables et hyperparamètres uniquement sur les partitions autorisées. Une période de séparation peut être nécessaire pour que les labels à 30 jours et retours soient déjà mûrs lors de chaque entraînement historique.

4. **Évaluer les probabilités sur le test intact.** Pour `m` lancements test, `Brier = (1/m) Σ(pᵢ−Yᵢ)²`. Comparer à une probabilité constante égale au taux de succès du **train**, ainsi qu'à la log-loss. Examiner une courbe de fiabilité : parmi les lancements annoncés autour de 70 %, quelle fraction réussit réellement ? Afficher effectifs, incertitude tenant compte des groupes et dérive par marché/période. **Un meilleur Brier ne démontre pas seul une meilleure calibration** : ce score mélange notamment calibration et discrimination. L'AUC seule ne valide pas des pourcentages.

5. **Calibrer sans recycler le test.** Si nécessaire, ajuster une calibration sigmoïde ou isotone sur une validation distincte de l'entraînement du modèle et du test final. La méthode et sa complexité dépendent du volume disponible ; l'isotone n'est pas automatiquement préférable. Rééquilibrer artificiellement succès/échecs sans corriger la prévalence peut fausser les probabilités.

6. **Vérifier la portée et la stabilité.** Mesurer la performance sur des cohortes récentes et suffisamment proches du futur usage. Pour un produit hors du domaine observé, conserver « non estimable » plutôt qu'extrapoler un pourcentage précis. Une calibration sur un groupe ne garantit pas chaque cas individuel. Choisir le plus haut score parmi beaucoup de produits rend aussi nécessaire une évaluation indépendante de la procédure de sélection.

Il n'existe pas de nombre universel de lignes garantissant ce travail. L'information dépend du nombre de **lancements indépendants**, des succès/échecs, de la diversité des vendeurs, du nombre de paramètres et de l'écart entre train et usage futur. Des millions d'événements d'un seul marchand n'apportent pas des millions de lancements indépendants. **Le volume pertinent et les labels étant inconnus ici, la probabilité de réussite avant lancement reste non estimable.** Aucun « minimum de 100 produits », taux de base ou intervalle à 95 % n'est inventé.

## 6. Ce qui est utile dès maintenant pour Dossier Commerce

- Utiliser ces documentations pour distinguer **revenu, conversion, attribution et bénéfice**, et éviter d'importer un indicateur public sous un faux nom de probabilité de succès.
- Conserver les preuves de coût, prix et délai comme données descriptives permettant d'éliminer des scénarios économiquement incohérents. Elles ne deviennent pas pour autant une fréquence de réussite apprise.
- Faire fonctionner le calculateur actuel avec **observations de visites/achats réellement pertinentes**, ou dans son mode **hypothèses** clairement distinct. Sa probabilité conditionnelle de bénéfice ne remplace pas un modèle pré-lancement calibré sur des lancements historiques.
- Si un historique de lancements devient disponible, commencer par auditer la définition du label et l'inclusion des échecs **avant** d'entraîner une régression. Les trois jeux examinés peuvent servir à des démonstrations techniques séparées ; aucune régression sur eux n'est lancée ici pour produire un score commercial.

## Sources et conditions pertinentes

- **UCI Online Retail** : [fiche et schéma](https://archive.ics.uci.edu/dataset/352/online+retail), [DOI 10.24432/C5BW33](https://doi.org/10.24432/C5BW33). Dépôt daté du 5 novembre 2015 ; jeu annoncé sous CC BY 4.0. Fichier de 22,6 MB annoncé, **non téléchargé**.
- **Google** : [présentation de l'échantillon](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset), mise à jour affichée 19 août 2026 ; [schéma général d'export](https://support.google.com/analytics/answer/7029846?hl=en) ; [requêtes d'exemple](https://developers.google.com/analytics/bigquery/basic-queries), mise à jour affichée 15 juin 2026. Aucun projet Cloud ni facturation activés.
- **Criteo** : [description, champs et conditions](https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/), publication 10 octobre 2017. Taille annoncée 623 MB compressés / 2,4 GB décompressés, **non téléchargé**. La page annonce CC BY-NC-SA 4.0 : ne pas présumer que ce jeu constitue une base libre pour un produit commercial ; aucune donnée ni modèle dérivé n'est intégré à notre outil.
- **Calibration** : [documentation scikit-learn](https://scikit-learn.org/stable/modules/calibration.html), notamment séparation des données de calibration, diagrammes de fiabilité et limites du Brier comme mesure de calibration seule. Consultée sans installer la bibliothèque.

Toutes ces sources ont été consultées le **29 octobre 2026**. L'examen porte sur les documents officiels, pas sur un audit exhaustif des fichiers ou une mesure de leurs distributions.
