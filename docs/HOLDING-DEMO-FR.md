# Groupe Horizon — démonstration fictive

Cette holding est isolée des sociétés réelles. Trois sociétés, dix magasins et 29 salariés fictifs permettent de présenter le cycle complet. Tous les fournisseurs, visuels, employés et opérations sont des exemples. Les événements historiques ont été générés par le moteur métier, non importés d'une banque ou d'un logiciel comptable.

## Parcours de présentation (15 minutes)

1. Ouvrir le workspace **DÉMO — Groupe Horizon**, puis Gestion du holding. La vue générale montre les banques, caisses, créances, dettes et stocks. Sélectionner Polaris Footwear.
2. **Échantillons & commandes** : montrer la photo illustrative du modèle T9800, ses cinq couleurs et deux pointures. Expliquer prix, quantité minimale et délai fournisseur. La proposition de commande utilise les ventes des 30 derniers jours, la couverture configurée, les stocks et commandes en cours. Elle est déterministe et expliquée ; ce n'est pas une prévision IA entraînée. Un clic crée uniquement un brouillon interne.
3. **Achats & imports** : consulter une commande réceptionnée et une commande expédiée. Montrer les étapes approbation, commande, expédition, douane, réception, ainsi que le financement bancaire. Transport et douane sont incorporés dans le coût du stock ; leurs factures sont payées séparément sans double comptabiliser une charge.
4. **Stocks & transferts** : choisir T9800 et comparer les couleurs, les magasins et l'entrepôt. Consulter les suggestions de distribution et confirmer un transfert. Un ajustement administratif exige un motif et reste audité.
5. **Caisse** : choisir un magasin, ouvrir une session à zéro (les sessions de démonstration ont été clôturées), rechercher ou scanner un article, choisir un client et encaisser. Les références lisibles de démonstration sont par exemple DEMO1140. L'usage d'une douchette nécessite qu'elle envoie cette référence suivie d'Entrée. La caméra doit disposer d'une image de code-barres correspondante et de l'autorisation navigateur. Terminer par une clôture de caisse. Les ventes mensuelles historiques sont des synthèses fictives, les tickets récents sont de petits exemples détaillés.
6. **Ressources humaines** : présenter les salariés par établissement, les paies mensuelles comptabilisées et réglées. Le mois d'octobre 2026 reste à comptabiliser pour permettre une manipulation en direct. Les propriétaires et les rôles Direction/Finance munis de la permission `hr:manage` voient les fiches ; les rôles opérationnels ne reçoivent que les coûts agrégés nécessaires aux indicateurs.
7. **P&L annuel** : revenir à toutes les sociétés, sélectionner 2025, puis expliquer CA, coût vendu, marge, charges, coût employeur, intérêts et résultat. Exporter en CSV ou utiliser Imprimer / PDF.

## Chiffres de l'exercice 2025 (TND)

| Société           |    CA net | Marge brute | Coût employeur | Résultat avant impôts et amortissements |
| ----------------- | --------: | ----------: | -------------: | --------------------------------------: |
| Polaris Footwear  | 1 332 000 |     782 000 |        269 040 |                                 372 560 |
| Atlas Sports      |   787 200 |     460 020 |        195 408 |                                 155 412 |
| Nova Distribution |   537 200 |     314 420 |        158 592 |                                  80 228 |
| Groupe consolidé  | 2 644 400 |   1 544 440 |        623 040 |                                 608 200 |

Les contributions des sociétés comprennent une prestation logistique interne fictive de 12 000 TND facturée par Polaris à Atlas. La ligne groupe élimine cette prestation du CA et des charges ; son résultat reste inchangé. Ce P&L est un rapport de gestion : il exclut TVA, amortissements et impôts, et élimine uniquement les prestations internes enregistrées dans le périmètre. Les sociétés partagent la devise TND ; les devises différentes sont affichées séparément, sans conversion implicite. Les ventes et retours sont reconnus à leur date ; la paie est affectée à son mois ; les autres charges et intérêts suivent les écritures saisies. Le capital emprunté et remboursé n'est pas une recette ou une charge. Le stock n'est passé en coût vendu qu'à la vente.

Le module RH suit les fiches et le coût employeur global. Le taux de charges de 18 % est une hypothèse fictive, pas un taux légal. Les règlements ne ventilent pas net salarié, retenues et organismes sociaux. Les contrats et demandes de congés sont accessibles dans « Contrats & congés », avec le même registre de salariés. Le contrat effectif au premier jour du mois fournit le brut d’une nouvelle comptabilisation. Les écritures déjà comptabilisées restent figées. Les bulletins légaux, le pointage et les déclarations sociales ne sont pas implémentés.

## Reproduction et installation

Après compilation : `node scripts/build-holding-demo.cjs /tmp/holding-demo.json USER_UUID`. Ce script est hors ligne, utilise les commandes validées et le moteur métier réel, contrôle stocks, soldes, clôtures et taille du registre. Les identifiants sont nouveaux à chaque génération. Il n'accède à aucune base et ne supprime rien. L'installation doit créer un nouveau workspace explicitement fictif, un propriétaire et les paramètres standards dans une transaction. Ne jamais remplacer le registre d'un client existant.

Le visuel `apps/web/public/demo/supplier-samples.png` est généré, sans marque réelle. Prompt : photographie catalogue de cinq sneakers basses sans marque, même modèle, noir/blanc/bleu marine/bordeaux/beige, fond ivoire, lumière douce, sans personne, logo ni texte. Mode : génération originale, aucune photo fournisseur réelle utilisée.

## Nouveaux parcours ERP

Le sélecteur « Espace métier » propose Direction, Achats, Logistique, Ventes, Finance et RH. Un choix d'espace ne change pas les droits du compte. Les rôles réels se donnent dans « Accès sociétés » : Achats, Logistique et RH ont des autorisations distinctes contrôlées par l'API.

Après extension de la démonstration :

- Commande `DEMO-ERP-ACHAT-PARTIEL` : 100 articles, bon `DEMO-ERP-BR-40` de 40 articles, reliquat de 60 à réceptionner.
- Transfert `DEMO-ERP-TRANSIT-10` : 10 articles expédiés vers un magasin, à confirmer à destination. La valeur en transit reste au groupe.
- Prestation `DEMO-ERP-SERVICES-2025` : 12 000 TND de logistique interne ; montrer les pièces des deux sociétés puis le passage du CA avant élimination au CA consolidé dans « Pilotage groupe ».

Ces exemples s'ajoutent au registre de démonstration, sans réinitialiser les manipulations déjà effectuées. Voir aussi `docs/ERP-METIERS-FR.md` pour les droits, les contrôles et les limites opérationnelles.
