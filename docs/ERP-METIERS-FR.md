# Parcours ERP et consolidation de gestion

Cette version organise les tâches par métier et conserve les données des sociétés dans leur holding. L'écran « Pilotage groupe » fournit une consolidation de gestion, pas des comptes consolidés réglementaires.

## Espaces et droits

Le sélecteur « Espace métier » organise les écrans ; il ne change pas l'identité ni les autorisations. Un propriétaire peut présenter tous les espaces avec son compte. Pour donner de vrais droits distincts : inviter un membre, lui faire accepter l'invitation, puis lui attribuer un rôle dans « Accès sociétés ».

| Rôle société                        | Usage                                                                | Restrictions                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Direction / MANAGER                 | Configuration, approbations et opérations de la société              | Accès limité aux sociétés attribuées ; droits RH explicites nécessaires hors propriétaire                                |
| Achats / BUYER                      | Fournisseurs, articles, échantillons, commandes et suivi d'import    | Pas d'approbation de sa commande, de réception, de banque ou de paie                                                     |
| Logistique / WAREHOUSE              | Réception, emplacement, stock, expédition et réception de transferts | Pas de commande fournisseur, de prix fournisseurs, de banque ou de paie                                                  |
| Finance / FINANCE                   | Trésorerie, factures, financements, P&L et prestations intragroupe   | Accès financier aux deux sociétés obligatoire pour les opérations internes ; les salaires individuels exigent l'accès RH |
| RH / HR                             | Salariés, contrats, congés et préparation du coût mensuel            | Pas de banques ni de règlement des salaires ; périmètre limité aux sociétés attribuées                                   |
| Caisse / CASHIER                    | Encaissement et disponibilité des articles des magasins autorisés    | Pas d'accès au registre financier général                                                                                |
| Responsable magasin / STORE_MANAGER | Caisse, retours et clôtures de ses magasins                          | Périmètre magasin attribué                                                                                               |
| Opérations / OPERATIONS             | Ancien rôle polyvalent achats, stock et ventes                       | Conserve la lecture étendue historique de la société ; préférer les rôles spécialisés pour séparer les métiers           |
| Lecture / VIEWER                    | Consultation financière des sociétés attribuées                      | Aucune écriture ; pas de fiches individuelles de paie                                                                    |

Le rôle RH dédié permet de gérer les salariés sans transformer le collaborateur en propriétaire du holding. Le rôle Finance ou Direction avec permission `hr:manage` peut accéder aux données RH de ses sociétés ; la création de personnel reste réservée à la Direction/RH, le règlement à la Direction/Finance. L'interface des rôles standard ne configure pas toutes les permissions personnalisées.

## Achats, réception et dette

1. L'acheteur prépare une commande et ses variantes ; la Direction l'approuve.
2. L'acheteur avance Commandée → Expédiée → Douane.
3. La logistique ouvre « Réceptions fournisseurs », choisit la commande et saisit une référence de bon ainsi que les quantités réellement reçues.
4. Chaque réception crée du stock, une pièce de réception et une dette de marchandises liée. Une réception partielle garde le reliquat ouvert. Le moteur refuse les doublons de référence, les variantes étrangères et les quantités excédentaires.
5. Les frais d'import sont répartis progressivement, sans frais négatifs ni double imputation. Les factures de transport/douane sont saisies séparément et rapprochées manuellement. La pièce de gestion de marchandises ne remplace pas une facture fournisseur légale ou une procédure complète de rapprochement à trois pièces.
6. La finance règle les dettes. Les réceptions complètes historiques restent disponibles ; leur historique n'est pas réécrit.

## Transferts suivis

Dans « Transferts suivis », saisir l'origine, la destination, la variante, la quantité et une référence. L'expédition retire le disponible à l'origine. Le magasin destinataire ne peut vendre la quantité qu'après confirmation de réception. Le stock en transit conserve sa valeur dans le stock détenu par la société et le groupe. Les propositions de réassort déduisent les quantités déjà en route. La réception est complète et unique par transfert ; les réceptions partielles de transferts ne sont pas encore proposées.

Les anciens transferts immédiats restent utilisables pour les mouvements physiquement simultanés. Aucun mouvement ne passe d'une société à une autre par ce module.

## Prestations internes et consolidation

« Intragroupe » enregistre une **prestation de services** entre deux sociétés actives d'une même devise : produit chez l'émetteur, charge chez le bénéficiaire, créance et dette liées. Le règlement saisit ensemble l'encaissement de l'émetteur et le décaissement du bénéficiaire. Le système refuse le paiement isolé d'une des deux pièces. Les soldes bancaires restent déclaratifs : aucune instruction de virement n'est envoyée à une banque.

Dans « Pilotage groupe », choisir année, mois et devise. Le rapport présente les contributions des sociétés avant élimination, les prestations internes éliminées et les montants après élimination. Une opération n'est éliminée que si ses deux sociétés appartiennent au périmètre autorisé affiché. Le CA et la charge internes disparaissent ; le résultat cumulé reste identique. Le P&L annuel utilise les mêmes éliminations. Les devises ne sont jamais additionnées ou converties implicitement.

Les banques, caisses, stocks et créances/dettes sont des **positions actuelles** ; le filtre de période concerne le P&L. Les sociétés archivées/supprimées restent dans l'historique financier. Les documents à traiter relient les approbations, reliquats de réception, transferts en transit et échéances à la société concernée.

## Limites avant commercialisation à volume élevé

Le stockage pilote reste un registre JSONB par holding, plafonné à 8 Mio et sérialisé à l'écriture. Les collections devront être normalisées, indexées et paginées, avec tests de charge, avant d'équiper un réseau de magasins à fort volume. Cette version n'implémente pas encore les commandes clients avec réservations/livraisons partielles, la comptabilité en partie double, TVA, amortissements, clôtures, conversion de devises, élimination des ventes internes de marchandises/marges latentes, ni la paie légale. Les états restent des états de gestion. Les connexions bancaires et autres intégrations externes nécessitent développement et configuration fournisseur, pas seulement des identifiants.
