# Vérification du prototype Trace

29 octobre 2026, Chromium système local. Aucun compte, appel fournisseur, commande ni paiement.

**Résultat : les contrôles automatisés passent après correction du rendu des GPX très fragmentés.** Commande :

```sh
python route-poster/tests/browser_test.py
```

Le test lance un serveur HTTP temporaire sur `127.0.0.1`, puis le ferme. Les exports sont téléchargés dans un dossier temporaire, supprimé à la fin.

Contrôles réalisés :

- Haversine : un degré de longitude à l’équateur ≈ 111,195 km ; aucun pont de distance entre deux segments éloignés.
- GPX avec espace de noms et routes `rte`, coordonnées bornées et finies, rejet XML malformé, DOCTYPE/ENTITY, fichier >2 Mo et >20 000 points.
- Passage de l’antiméridien : trajet 179,9° → −179,9° ≈ 22,24 km, projection finie.
- Limite de rendu 2 000 points avec extrémités conservées : 1 000 segments de 20 points → 1 000 polylines et 2 000 points ; deux segments longs gardent leurs propres extrémités.
- Import réel, changement de titre/date/palette, retour à la démonstration et conservation du dernier aperçu en cas de fichier invalide.
- Titre contenant `<script>` et `&` correctement échappé dans le SVG ; aucun élément script créé.
- Téléchargements réels : SVG 300 × 400 mm et PNG **3 543 × 4 724 pixels**, sans erreur JavaScript.
- Aucun débordement horizontal aux largeurs 320, 375, 768 et 1 280 px. Inspection visuelle de la page à 375 et 1 280 px, puis d’un PNG exporté : titre, tracé, distance et date lisibles, sans chevauchement constaté.
- Aucune requête externe pendant import et export ; trafic limité au serveur local et aux images `blob:`.

## Régression trouvée et corrigée

L’ancienne sélection globale d’un point sur N pouvait supprimer toutes les lignes d’un GPX comportant 10 000 segments de deux points. Le correctif réserve désormais deux extrémités à chaque segment dessinable et refuse explicitement les fichiers dépassant 1 000 segments dessinables. Les tests couvrent les deux comportements. Les points isolés n’ont pas de ligne à afficher ; ils ne créent pas de jonction artificielle.

## Portée

Cette vérification qualifie le prototype local et ses fichiers exportés. Elle ne teste ni une commande chez un imprimeur, ni fond perdu/profil colorimétrique fournisseur, ni qualité papier, ni conversion commerciale. Le PNG et le SVG utilisent les polices locales ; leur espacement typographique peut légèrement différer. Les longs tracés sont simplifiés pour l’affiche ; la distance reste calculée sur tous les points importés.
