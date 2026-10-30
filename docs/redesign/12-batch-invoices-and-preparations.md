# Factures groupées, courses et préparations

Implémentation locale des demandes du 30 octobre 2026. Aucun déploiement ni import de données réelles n'a été effectué.

## Factures

Comptabilité › Dépôt accepte plusieurs fichiers ou un PDF contenant plusieurs factures. La limite est de 20 Mo, 200 pages et 50 factures par PDF. Chaque facture reçoit une ligne modifiable et un PDF contenant ses propres pages. Une facture de plusieurs pages reste un document.

L'ajout au journal se fait en lot après vérification. Les lots de plus de 50 lignes sont envoyés en plusieurs requêtes. Une confirmation répétée du même dépôt conserve la même écriture. Les doublons d'achat tiennent compte du fournisseur et du numéro. Les mois verrouillés restent protégés.

Les réponses tronquées, les pages incohérentes et les PDF protégés provoquent une erreur visible. L'original reste disponible pour réessayer jusqu'à réception complète du résultat. Le résultat d'extraction est mis en cache pour réutiliser les PDF séparés après une coupure. La lecture nécessite la configuration IA existante. Les tests utilisent des réponses simulées et de vrais PDF générés pour vérifier le découpage.

## Courses et personnel

Cliquer sur la quantité d'un produit ouvre son besoin et la quantité déjà en stock. Les rayons frais, sec et à classer sont modifiables et enregistrés. Le classement initial repose sur le nom et doit être corrigé pour les produits ambigus. Les exports conservent le rayon.

Les initiales par défaut utilisent le prénom et le nom. Les paramètres signalent les doublons. Les horaires du personnel acceptent par exemple `18h`, `18h30`, `18:00` et une fin à `24:00`. Une fin antérieure au début indique le lendemain. La durée est calculée côté serveur. Les heures manuelles restent possibles en effaçant la plage horaire.

Le remboursement kilométrique peut remplacer distance × tarif. Le montant donné remplace le total calculé et inclut les kilomètres. Modifier les heures ou les kilomètres conserve ce montant donné. « Calcul » retire la dérogation. Les coûts et le tableau du personnel utilisent ces mêmes montants.

## Préparations et assistant

Une recette peut définir plusieurs préparations avec un nom, une note et un nombre de jours avant l'événement. L'ajout de la recette à un événement crée les tâches datées dans la même écriture. Les anciennes lignes proposent d'ajouter les préparations manquantes. Chaque tâche peut être déplacée séparément. Supprimer une ligne de recette retire ses tâches liées.

L'assistant lit les achats enregistrés d'une année avec leurs totaux par mois et fournisseur. Il ne suppose pas que tous les achats de 2026 sont présents. Les factures réelles doivent encore être déposées dans le site.

L'outil de production calcule les ingrédients cumulés à partir des portions et conserve les unités distinctes. Il compte chaque ligne de recette une fois, même si plusieurs préparations la concernent. Les quantités restent celles de la recette entière, car les ingrédients ne sont pas répartis entre ses préparations. L'ordre suggéré commence par les cuissons mentionnées dans les instructions. Les durées, le matériel, les dépendances et la conservation restent à valider. L'assistant ne déplace pas les préparations sans action de l'utilisateur.

## Stock réel

Le stock physique n'est pas calculé à partir des seuls montants de factures. Il faut un inventaire de départ, les quantités achetées avec leurs unités, les sorties pour les recettes, les pertes et les corrections d'inventaire. La présente version conserve le stock saisi dans les listes de courses. Elle ne crée pas de stock physique ni de mouvements de marchandises depuis les factures.
