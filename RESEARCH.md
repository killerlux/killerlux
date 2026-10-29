# À quoi sert cet outil ?

Cet outil gratuit de recherche aide à comparer des offres publiques et à examiner les hypothèses économiques d'un projet de revente. Il rassemble les informations utilisées dans le calcul pour que chacun puisse les vérifier. Cette version est un projet de recherche non commercial : aucun abonnement, paiement ou achat de produit n'y est proposé.

## Lire une offre avec ses preuves

Vous pouvez choisir un exemple documenté ou importer localement une page HTML sauvegardée ou des données JSON-LD. Le navigateur recherche les informations structurées disponibles : produit, prix déclaré, devise, disponibilité et référence de l'offre. Il ne transforme pas les champs absents en valeurs certaines.

**Ajouter une URL ne télécharge pas le site.** Le lien identifie une source ; l'analyse nécessite ensuite un document importé ou des données renseignées explicitement. Certaines pages chargent leurs prix par JavaScript et ne fournissent pas assez d'informations dans le fichier sauvegardé.

L'import est traité dans le navigateur. Les données extraites permettent de comparer des offres, consulter leur provenance, compléter les coûts manquants et conserver un dossier de travail. Vérifiez les variantes, quantités et conditions : une image similaire ou un prix plus bas ne prouve pas qu'il s'agit du même produit.

Une date d'import indique quand le fichier a été ouvert dans l'outil. Elle ne constitue ni une date de capture certaine ni une vérification en direct. Un prix publié peut avoir changé ; une disponibilité déclarée ne garantit pas la livraison en France.

## Comprendre les scénarios

Les calculs économiques dépendent des valeurs retenues : prix de vente, produit, transport, TVA, frais, retours, acquisition et autres coûts. Les éléments saisis par l'utilisateur restent des hypothèses tant qu'ils ne sont pas documentés. Des devises différentes ou une livraison inconnue empêchent certaines comparaisons directes.

Les résultats probabilistes, lorsqu'ils sont disponibles, sont **conditionnels au modèle et aux paramètres affichés**. Ils répondent à une question du type : « Que donnerait ce scénario si ces hypothèses étaient pertinentes ? » Ils ne mesurent pas automatiquement la fréquence réelle des ventes futures.

Des distributions mal choisies peuvent produire une probabilité très précise et pourtant sans valeur prédictive. Un calcul numériquement précis ne corrige pas un modèle mal calibré. Des observations réelles de ventes comparables, une définition stable du résultat et une validation sur des données distinctes seraient nécessaires pour évaluer une capacité prédictive.

**Aucun résultat ne signifie “95 % de chances que votre entreprise réussisse”.** Avec des données insuffisantes, la bonne conclusion peut être de ne pas conclure.

Pour prédire le succès **avant lancement**, il faudrait une cohorte de lancements comparables, comprenant les échecs, et leurs bénéfices après coûts complets. Les jeux publics UCI Online Retail, Google GA4 et Criteo examinés ne fournissent pas cet ensemble. La [note sur les données et la calibration](DATA-AVAILABILITY.md) précise leurs limites et le protocole mathématique possible si un tel historique devient disponible.

## Ce que l'outil ne sait pas

Cette version ne possède pas d'index mondial du commerce en ligne. Elle ne recherche pas automatiquement tous les fournisseurs et ne dispose pas des revenus privés des boutiques ou d'un ensemble de ventes observées comparables permettant de prédire votre demande.

Un prix, une publicité active ou un nombre d'avis ne révèle pas le bénéfice d'un vendeur. L'outil ne certifie pas non plus la qualité physique d'un article, la fiabilité d'un fournisseur, ses droits de distribution ou le respect de ses délais. Il permet d'organiser ce qui est connu et de rendre visibles les vérifications restantes.

## Pourquoi cette approche ?

Des outils de recherche commerciale existent déjà. [Minea](https://www.minea.com/pricing) propose notamment des recherches de publicités, produits et boutiques. [Dropship.io](https://www.dropship.io/pricing) combine bibliothèques commerciales, suivi et recherche concurrentielle. [Koala Inspector](https://koala-apps.io/shopify-supplier-finder/) propose déjà des correspondances fournisseurs, des coûts livrés par pays et des estimations de marge.

Nous ne revendiquons donc pas l'invention de l'analyse concurrentielle ou du calcul de marge. L'objectif ici est plus limité : un dossier local, consultable et explicite sur ses preuves, ses données manquantes et ses hypothèses. Son utilité doit encore être évaluée face à un simple tableur et aux outils existants.

Sources consultées le **29 octobre 2026**. Les descriptions des concurrents proviennent de leurs pages officielles ; elles ne constituent pas une validation indépendante de leurs résultats ni de ceux de ce projet.
