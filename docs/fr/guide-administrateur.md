# Guide administrateur — holdings, accès, exports et Caisse

Version du 18 octobre 2026. Ce guide décrit le pilote présent dans la branche `feat/claude-frontend-integration`. Les fonctions indiquées « À développer » ne sont pas encore disponibles. Elles constituent la cible du produit, pas des boutons déjà livrés.

## 1. Comprendre les niveaux

| Niveau                   | Exemple                                         | Responsabilité                                       |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| Éditeur de la plateforme | Vous, fournisseur du SaaS                       | Administrer les clients et l’exploitation du service |
| Holding cliente          | Ben Makhlouf                                    | Superviser ses sociétés et leurs utilisateurs        |
| Société                  | Polaris                                         | Gérer ses achats, stocks, ventes et trésorerie       |
| Marque                   | Une marque de chaussures distribuée par Polaris | Identifier les produits et configurer l’activité     |
| Emplacement              | Entrepôt central, magasin Tunis, magasin Sousse | Identifier où se trouve le stock                     |

Un espace de travail représente actuellement une holding. Une société appartient à une holding et ses produits, comptes, partenaires et opérations lui appartiennent. Une même personne peut être membre de plusieurs holdings.

Le propriétaire d’une holding n’est pas automatiquement administrateur de toute la plateforme. Le premier compte créé ne devient pas automatiquement super-administrateur.

## 2. Ce qui est disponible aujourd’hui

| Besoin                                                          | État réel                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Créer une holding                                               | Disponible : nouvelle organisation / espace de travail                                              |
| Créer une société et ses marques                                | Disponible : Gestion du holding → Sociétés & configuration                                          |
| Ajouter entrepôts et magasins                                   | Disponible : sélectionner la société → Catalogue & réseau                                           |
| Inviter ou retirer un membre                                    | Disponible : Membres                                                                                |
| Attribuer un rôle par société                                   | Disponible : Gestion du holding → Accès sociétés                                                    |
| Retirer l’accès à une société                                   | Disponible : Accès sociétés → Révoquer                                                              |
| Activer des fonctions par société                               | Disponible : configuration de la société                                                            |
| Voir le stock dans les différents magasins                      | Disponible : Stocks & transferts, pour les personnes autorisées à la société entière                |
| Saisir une vente                                                | Disponible : Ventes ; ce n’est pas encore une interface Caisse dédiée                               |
| Exporter la synthèse financière                                 | Disponible : bouton Exporter → CSV du périmètre affiché                                             |
| Exporter toutes les données métier et pièces jointes            | À développer ; le CSV actuel n’est pas un export complet                                            |
| Suspendre, archiver ou supprimer une holding depuis l’interface | À développer                                                                                        |
| Archiver ou supprimer une société depuis l’interface            | À développer                                                                                        |
| Administrer tous les clients depuis une console éditeur         | À développer ; un rôle technique de plateforme existe, sans console complète de gestion des clients |
| Limiter un utilisateur à un magasin ou masquer les finances     | À développer ; les rôles actuels portent sur la société entière                                     |
| Utiliser une vraie Caisse avec tickets et clôture               | À développer                                                                                        |

## 3. Donner des accès : procédure actuelle

### Ajouter un collaborateur à une holding

1. Ouvrir la bonne organisation dans le sélecteur de la barre latérale.
2. Ouvrir **Membres**.
3. Inviter son adresse email avec le rôle d’espace adapté.
4. Copier le lien d’invitation et le transmettre à la personne. L’envoi automatique par email n’est pas configuré.
5. La personne utilise cette même adresse, se connecte et accepte l’invitation.
6. Pour un utilisateur qui n’est pas propriétaire du holding, attribuer ensuite les sociétés autorisées dans **Accès sociétés**.

Une invitation non acceptée ne donne pas accès aux données. Une simple adhésion à la holding ne donne pas accès aux sociétés pour un non-propriétaire.

### Choisir le rôle dans la holding

| Rôle d’espace | Usage                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Owner         | Propriétaire de la holding : voit et administre toutes ses sociétés, gère les membres et les accès      |
| Member        | Collaborateur de l’espace ; ses accès métier dépendent des attributions par société                     |
| Viewer        | Accès limité aux fonctions de l’espace ; ses droits métier dépendent aussi des attributions par société |

Les rôles d’espace et de société sont deux niveaux distincts. Par exemple, attribuer « Responsable » sur Polaris à un membre « Viewer » lui donne bien les pouvoirs métier de Responsable sur Polaris. Le rôle d’espace Viewer ne constitue donc pas une limite absolue à ses droits métier.

Le système interdit de retirer ou rétrograder le dernier Owner de la holding.

### Attribuer un rôle dans une société

1. Ouvrir **Gestion du holding**.
2. Sélectionner **Polaris** dans le périmètre en haut.
3. Ouvrir **Accès sociétés**.
4. Choisir un membre actif et son rôle.
5. Enregistrer. Répéter pour les autres sociétés autorisées.

| Rôle société            | Pouvoirs principaux                                                                                                                  | Visibilité       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Responsable / MANAGER   | Configurer la société, approuver les achats, gérer les opérations et la trésorerie                                                   | Toute la société |
| Finance / FINANCE       | Créer les partenaires, comptes, factures, règlements, dépenses et transferts de trésorerie                                           | Toute la société |
| Opérations / OPERATIONS | Produits, partenaires, achats, avancement des commandes approuvées, transferts et ventes ; pas d’approbation initiale ni de paiement | Toute la société |
| Lecteur / VIEWER        | Consulter sans modifier                                                                                                              | Toute la société |

Les restrictions sont vérifiées par le serveur. Masquer un bouton n’est pas la seule protection.

**Limite importante : ces rôles ne masquent pas les finances ou les autres magasins de la société.** Ne pas utiliser le rôle Opérations comme rôle de caissier restreint. Un rôle Caisse avec accès par magasin doit être développé avant cet usage.

### Retirer des accès

- Pour une société seulement : sélectionner cette société → **Accès sociétés → Révoquer**.
- Pour la holding entière : **Membres → retirer le membre**. Cela retire son adhésion à cette holding, sans supprimer son compte utilisateur ni ses adhésions aux autres holdings.
- Retirer une attribution de société ne limite pas un Owner : son rôle de propriétaire lui donne accès à toutes les sociétés de la holding.
- Après retrait puis nouvelle invitation, les anciennes attributions de société ne redeviennent pas valides automatiquement. Les réattribuer explicitement.

## 4. Configurer une société

Dans **Sociétés & configuration**, définir le nom, pays, devise, marques, délai de réapprovisionnement, couverture souhaitée, minimum de stock et fonctions activées. Vérifier le récapitulatif avant confirmation.

La devise est fixe après création. Les fonctions désactivées ne sont pas supprimées : les données historiques restent consultables et les nouvelles opérations correspondantes sont bloquées. Désactiver un module n’archive pas une société et ne remplace pas la révocation des accès.

## 5. Supprimer ou archiver : fonctionnement à prévoir

Il n’existe actuellement ni bouton ni API de suppression de holding/société. Ne pas supprimer des lignes directement dans la base pour simuler cette fonction. Ne pas utiliser `docker compose down --volumes` : cela détruirait la base locale entière, pas un seul client.

La console cible doit distinguer trois actions :

| Action cible             | Effet attendu                                                                                                         | Disponibilité                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Suspendre                | Bloquer les nouvelles opérations / connexions selon le périmètre, conserver les données et permettre une réactivation | À développer dans la console |
| Archiver                 | Retirer de l’activité courante, conserver l’historique en lecture seule et permettre une restauration                 | À développer                 |
| Supprimer définitivement | Purger explicitement un périmètre après export et contrôles de conservation                                           | À développer                 |

La suppression d’une holding devra afficher les sociétés et données concernées, demander une confirmation explicite du nom et vérifier le droit de l’administrateur. La suppression d’une société devra traiter ses stocks, comptes et opérations liés sans supprimer ceux des autres sociétés. Les règles de conservation et le délai de restauration restent à définir avant mise en production.

L’archivage doit être l’action ordinaire de fermeture d’un client ; la suppression définitive doit être une action séparée. Aucune suppression n’a été exécutée lors de la rédaction de ce guide.

## 6. Exporter et sauvegarder

### Export disponible

Dans **Gestion du holding → Vue holding**, choisir toutes les sociétés autorisées ou une société, puis **Exporter**. Le CSV contient la synthèse : société, devise, banques, caisses, dettes, créances, stock, ventes et marge brute.

Il ne contient pas les lignes de vente, produits, mouvements, factures, règlements, utilisateurs, droits, journal d’audit ou fichiers. Il ne permet pas de restaurer le système.

### Export complet cible

L’écran d’export devra proposer : holding ou société, période, catégories de données et formats CSV/JSON. Une archive complète devra inclure les référentiels, commandes et lignes, expéditions, ventes et retours, stocks et mouvements, comptes et opérations, factures et règlements, configurations et historique d’audit. Les pièces jointes seront ajoutées lorsque leur stockage sera implémenté.

Les exports devront respecter les mêmes périmètres que l’interface, être journalisés et exclure mots de passe, sessions, jetons d’invitation et secrets techniques. Les permissions administratives ne doivent pas être réimportées aveuglément depuis un fichier.

### Sauvegarde technique

Une sauvegarde PostgreSQL protège l’installation entière ; c’est une opération d’exploitation distincte de l’export client. Aujourd’hui, il n’existe pas d’écran de sauvegarde/restauration. Une procédure de sauvegardes automatiques avec test de restauration doit être mise en place avant commercialisation. Conserver le volume Docker et le fichier de configuration local protège les redémarrages, mais ne remplace pas une sauvegarde.

## 7. Interface Caisse pour les clients

### État actuel

L’écran **Ventes** sait enregistrer une vente avec plusieurs articles, retirer le stock et créer une créance. L’encaissement est enregistré séparément dans **Banques & trésorerie**. Les disponibilités par emplacement se consultent dans **Stocks & transferts**.

Il n’existe pas encore de parcours Caisse réunissant recherche, panier et paiement, ni de compte caissier limité à son magasin. Les tickets imprimables, sessions de caisse, lecteur de codes-barres, remises contrôlées, paiements mixtes et clôtures ne sont pas implémentés.

### Parcours Caisse cible

1. Le caissier se connecte à son magasin autorisé et ouvre sa session avec un fond de caisse.
2. Il scanne un code-barres ou recherche une référence, taille et couleur.
3. Il voit le prix, le stock disponible du magasin et, selon ses droits, la disponibilité ailleurs.
4. Il ajoute les articles au panier. Les remises au-delà de son seuil nécessitent une autorisation.
5. Il encaisse selon les moyens configurés : espèces, carte, paiement mixte ou crédit autorisé. Un terminal carte nécessite une intégration ; enregistrer « carte » ne déclenche pas de paiement bancaire.
6. La validation enregistre atomiquement la vente, la sortie de stock et le règlement. Un double clic ou une nouvelle tentative ne doit pas doubler la vente.
7. Il remet le ticket et retrouve les ventes de sa session.
8. En fin de journée, il déclare la caisse comptée, compare le montant attendu et soumet les écarts au responsable.

### Consulter un article ailleurs

Pour une chaussure noire taille 42, la recherche cible montrera le stock physique, les réservations, le disponible à vendre et les transferts en cours de chaque emplacement autorisé de **la même société**. Le caissier pourra demander un transfert ou une réservation selon ses droits.

La disponibilité dans une autre société sera bloquée par défaut. Un partage entre sociétés exige un workflow intersociétés distinct ; un stock visible n’est pas automatiquement transférable.

Aujourd’hui, le système affiche du stock physique, sans réservations ni transferts en transit. Il ne faut pas présenter ce chiffre comme une disponibilité garantie tant que ces mécanismes ne sont pas développés.

### Droits Caisse à ajouter

| Profil cible         | Vendre                             | Stock ailleurs                             | Remises / retours                             | Trésorerie et coûts                                |
| -------------------- | ---------------------------------- | ------------------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| Caissier             | Son magasin et sa session          | Lecture limitée aux emplacements autorisés | Selon seuils, avec autorisation si nécessaire | Aucun accès aux comptes bancaires ou coûts d’achat |
| Responsable magasin  | Son magasin et son équipe          | Réseau autorisé de la société              | Validation dans ses limites                   | Sa caisse, ses clôtures et écarts                  |
| Responsable société  | Tous ses magasins                  | Toute sa société                           | Paramétrage et validation                     | Selon rôle financier                               |
| Propriétaire holding | Vue de supervision de ses sociétés | Ses sociétés                               | Supervision et délégation                     | Vue autorisée du holding                           |

Ces profils sont une spécification à implémenter. Ils ne correspondent pas encore aux quatre rôles société actuels.

## 8. Priorités pour une administration flexible

1. Console éditeur avec liste des holdings, statut, responsables et accès administrateur traçables.
2. Droits configurables par action, société et magasin, avec séparation de la consultation financière.
3. Suspension, archivage, restauration et suppression contrôlée des holdings/sociétés.
4. Export métier complet, sauvegardes automatiques et restauration testée.
5. Caisse dédiée : catalogue, panier, encaissement, ticket et session de caisse.
6. Disponibilités fiables : réservations, transferts demandés/expédiés/reçus et suivi des écarts.
7. Connexions POS/paiement/banque et obligations comptables adaptées aux pays d’exploitation.

Le guide décrit cette cible pour conserver l’ensemble de vos besoins. Il ne signifie pas que ces développements sont déjà réalisés.
