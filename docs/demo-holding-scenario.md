# Holding de démonstration — scénario isolé (proposition)

Ce document est un **plan de données fictives**, pas un seed exécuté. Aucun utilisateur, tenant ou enregistrement Neon n'est créé par cette branche.

## Isolation obligatoire
- Créer un tenant dédié `demo-holding` uniquement dans une base de test ou de démonstration.
- N'utiliser que des identités fictives et des domaines réservés (`example.com`).
- Les trois sociétés doivent appartenir au même tenant de démonstration ; les permissions et accès société sont accordés explicitement, jamais déduits du domaine email.
- Tous les appels API utilisent le contexte tenant vérifié ; aucune insertion directe en production.
- Seed idempotent, marqué `DEMO`, supprimable sans affecter les autres tenants ; exiger confirmation avant toute exécution.

## Structure cible : 3 sociétés, 10 magasins

| Société fictive | Devise | Magasins | Entrepôts |
|---|---|---|---|
| Atlas Distribution Démo | TND | Tunis Centre, La Marsa, Sousse, Sfax | Dépôt Tunis |
| Méditerranée Retail Démo | TND | Bizerte, Nabeul, Monastir | Dépôt Nabeul |
| Carthage Mode Démo | TND | Hammamet, Gabès, Djerba | Dépôt Sfax |

**Total : 3 sociétés, 10 magasins, 3 entrepôts.** La devise unique TND permet une vue consolidée sans taux de change fictif.

## Données de test à créer après validation
- Catalogue : 30 références fictives (tailles et couleurs), coûts en unités mineures, stock initial par entrepôt.
- Achats : fournisseurs fictifs, commandes et réceptions cohérentes avec les mouvements de stock.
- Ventes : transactions fictives par magasin avec coûts historiques et retours ; paiements reliés aux factures.
- Finance : comptes de caisse/banque fictifs, charges, créances et dettes avec échéances.
- RH : salariés fictifs, contrats et congés, liés à leur société et au tenant démo.
- Utilisateurs : CEO, CFO, DRH et salarié fictifs, invitations/memberships actives, droits minimaux testés.

## Critères de recette
1. Le CEO voit les trois sociétés, le CFO voit uniquement celles explicitement autorisées.
2. Aucun membre d'un autre tenant ne voit la holding démo.
3. Le tableau de bord montre 3 sociétés et 10 magasins après seed.
4. CA, marge, trésorerie et stocks correspondent aux opérations générées ; pas de chiffres codés en dur.
5. Les montants restent en unités mineures et sont affichés en TND à trois décimales.
6. Aucune exécution de seed ou déploiement automatique n'est déclenchée par ce document.

## Limites actuelles
Le tableau de bord est une vue **opérationnelle cumulative**. Un compte de résultat 2025 exige des dates, un périmètre comptable, des écritures et des règles d'arrêté supplémentaires. Ne pas le présenter comme un bilan certifié.
