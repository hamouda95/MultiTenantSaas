# Administration, accès et Caisse — guide utilisateur

Version correspondant à la branche `feat/admin-pos-render-review`. Les changements doivent être déployés avant d’apparaître dans votre installation. Le [rapport de revue et de déploiement](../development/neon-render-review.md) donne les observations réelles sur Neon et Render.

## Administrer les holdings

Ouvrir **Administration** depuis la liste des organisations, ou **Administration des holdings** dans la barre latérale. Un propriétaire voit ses holdings ; un administrateur plateforme voit tous les clients. Créer un compte ne donne pas automatiquement le rôle administrateur plateforme.

| Action    | Effet                                                            |
| --------- | ---------------------------------------------------------------- |
| Active    | Autorise les opérations et restaure un holding bloqué            |
| Suspendue | Bloque les accès métier, sans effacer les données                |
| Archivée  | Bloque les accès métier et marque la fermeture de l’activité     |
| Corbeille | Suppression logique restaurable ; les données restent conservées |

Pour changer l’état, sélectionner la nouvelle valeur, saisir exactement le nom du holding et renseigner un motif. Une caisse ouverte bloque la fermeture du holding : clôturer d’abord les sessions. Un utilisateur dont le holding est bloqué ne peut plus consulter ni modifier ses données métier. Le propriétaire ou l’administrateur peut toujours exporter et restaurer depuis la console.

La suppression n’est **pas une purge définitive**. Aucune donnée existante n’est effacée par le fait de déployer cette fonction. Une purge conforme à une politique de conservation nécessite une future procédure distincte.

## Gérer les sociétés

Dans **Gestion du holding → Sociétés & configuration**, sélectionner une société. Le propriétaire peut l’archiver, la placer dans la corbeille ou la restaurer, après confirmation exacte de son nom. L’historique, les produits, comptes et mouvements sont conservés. Les opérations sont bloquées tant que la société est inactive ; les autres sociétés continuent à fonctionner. Les sessions de caisse doivent être fermées avant archivage/suppression.

## Inviter et attribuer des droits

1. Dans **Membres**, inviter l’adresse email du collaborateur et transmettre le lien privé. L’envoi automatique d’email n’est pas configuré.
2. Le collaborateur accepte avec la même adresse.
3. Dans **Gestion du holding**, sélectionner la société puis **Accès sociétés**.
4. Choisir le membre actif, son rôle et, pour les rôles Caisse, les magasins autorisés.

| Rôle société        | Droits                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsable         | Société entière : configuration, achats, approbations, stocks, ventes, finances, tarifs et rapprochement des écarts de caisse                                    |
| Finance             | Société entière en lecture ; opérations de trésorerie et partenaires                                                                                             |
| Opérations          | Société entière en lecture ; produits, achats, avancement des commandes approuvées, transferts et ventes, sans paiements                                         |
| Lecteur             | Consultation de la société entière                                                                                                                               |
| Caissier            | Interface Caisse des magasins attribués ; tarifs autorisés, ventes et sa propre session ; aucune donnée bancaire ni coût d’achat transmis                        |
| Responsable magasin | Caisse des magasins attribués, sessions/tickets du magasin, remises et remboursements ; pas de configuration bancaire ni validation finale des écarts comptables |

Un Owner de la holding voit toutes ses sociétés. Une attribution Caissier ne peut pas restreindre un Owner : ne pas attribuer ce rôle d’espace à un caissier. Les rôles d’espace Member/Viewer et les rôles société sont distincts ; les permissions de l’espace continuent à gouverner les fonctions communes comme l’annuaire.

**Révoquer** retire l’attribution à une société. Retirer un membre dans **Membres** retire son adhésion à la holding, sans supprimer son compte ni ses autres adhésions. Une nouvelle invitation ne réactive pas ses anciennes attributions. Le dernier Owner ne peut pas être retiré.

## Exporter toutes les données métier

Dans **Administration des holdings**, cliquer **Exporter toutes les données métier**. Le JSON contient le holding, les sociétés (y compris archives/corbeille), catalogue, achats, ventes, stocks, comptes, factures, règlements, caisses, configurations, membres, rôles et historique d’audit. Il est autorisé côté serveur et journalisé.

Les mots de passe, jetons d’invitation, sessions d’authentification et secrets techniques sont exclus. Aucun fichier joint n’est inclus : son stockage n’est pas implémenté. Cet export ne remplace pas une sauvegarde PostgreSQL ni une restauration testée. La synthèse CSV reste disponible dans **Vue holding → Exporter**.

## Préparer la Caisse d’un magasin

Le responsable société doit :

1. Créer le magasin et ses variantes produit dans **Catalogue & réseau**.
2. Définir le **tarif et code-barres** de chaque variante. Le caissier ne choisit pas librement le prix.
3. Créer un compte de type Caisse, un compte pour enregistrer les règlements carte et un client comptoir.
4. Renseigner **Configurer la Caisse du magasin** : magasin, comptes, client et remise maximale caissier.
5. Attribuer les utilisateurs et magasins dans **Accès sociétés**.
6. Enregistrer le stock réel disponible et un solde de caisse cohérent avec les fonds existants.

Une caisse ne peut pas être partagée par deux sessions actives. Le fond d’ouverture fait partie du solde existant ; l’ouverture ne crée pas d’argent fictif. Les écritures de trésorerie extérieures à la session sont bloquées sur une caisse ouverte.

## Vendre

1. Ouvrir **Caisse** et sélectionner le magasin autorisé.
2. Ouvrir la session avec le fond de caisse.
3. Scanner le code-barres et appuyer sur Entrée, ou chercher le produit puis cliquer **Ajouter**.
4. Ajuster le panier ; les remises sont limitées côté serveur.
5. Renseigner la part carte ; le reste est dû en espèces. Indiquer les espèces remises pour calculer la monnaie.
6. **Valider la vente et le règlement** enregistre ensemble vente, sortie de stock, créance et encaissements. Les nouvelles tentatives d’une même commande ne doublent pas la vente.
7. Ouvrir le ticket, puis l’imprimer si nécessaire.

Les cartes sont **enregistrées après un paiement externe** : le logiciel ne déclenche pas de transaction sur un terminal bancaire. Les tickets sont internes, non fiscaux et non certifiés. Le mode hors ligne, les taxes détaillées et les périphériques spécialisés ne sont pas intégrés. Un lecteur qui saisit un code comme un clavier peut utiliser le champ de recherche.

## Consulter les disponibilités ailleurs

Sous chaque variante, ouvrir **Stock dans les autres emplacements**. Les stocks physiques des magasins et entrepôts de la même société sont consultables. Les autres sociétés restent exclues du compte caissier.

Ce stock ne tient pas compte de réservations ni de marchandises en transit : ces workflows restent à développer. La consultation ne réserve pas un article et ne crée pas de transfert. Le responsable utilise les transferts existants lorsque nécessaire.

## Rembourser et clôturer

Un responsable magasin/société peut effectuer un remboursement intégral d’un ticket Caisse avec motif, dans une session ouverte du même magasin. Le logiciel restaure les quantités et coûts d’origine et inverse les règlements une seule fois, sous réserve de fonds suffisants. Les retours partiels et l’exécution bancaire du remboursement carte ne sont pas intégrés.

En clôture, saisir les espèces réellement comptées et un commentaire. Le système calcule l’attendu et l’écart. Une clôture équilibrée est rapprochée immédiatement. Un écart bloque la prochaine ouverture de cette caisse jusqu’à validation du responsable **société**, qui ajuste alors le solde enregistré. Le caissier et le responsable magasin ne peuvent pas valider eux-mêmes cet ajustement.

## Devenir administrateur plateforme

Un opérateur disposant de la connexion de schéma `DATABASE_ADMIN_URL` peut désigner le **premier** administrateur pour un compte actif déjà créé :

```sh
node scripts/bootstrap-admin.cjs email@example.com email@example.com
```

Les deux emails doivent correspondre. Ne pas placer la connexion ou le mot de passe dans la commande ni dans Git. Le script refuse un rôle SQL non opérateur et refuse de fonctionner si un administrateur plateforme existe déjà. Cette opération technique doit être consignée par l’opérateur ; il n’existe aucune route HTTP d’auto-promotion.

## Ce qui reste à livrer

La comptabilité légale et TVA, consolidation intersociétés/changes, paie, réservations, transferts en transit, réceptions/retours partiels, pièces jointes, intégrations banque/terminal, récupération de compte/email, abonnements commerciaux, assistant IA et modèles prédictifs ne sont pas encore implémentés. Les fonctionnalités de pilotage restent fondées sur les opérations saisies et des règles explicables.

Avant commercialisation à grande échelle : normaliser les collections actuellement limitées à 8 Mo par holding, ajouter pagination et archivage technique, tester la charge, définir les règles de conservation et tester sauvegarde/restauration. Ne pas considérer cette version comme un ERP complet certifié.
