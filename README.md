# EPC — Version test : formulaire ECU avant PayPal

## Fonctionnement
Le client choisit ses prestations, renseigne ses informations et téléverse un fichier ECU de 8 Mo maximum. Le fichier reste temporairement en mémoire du serveur. Une fois la capture PayPal vérifiée côté serveur, un e-mail est envoyé à `ORDER_EMAIL` avec le fichier en pièce jointe.

## Déploiement Render
Remplacer les fichiers du dépôt GitHub par ceux du ZIP (sans téléverser les secrets). `npm install` et `npm start` restent inchangés. Conserver les variables PayPal existantes. Ajouter dans Render > Environment : `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=Engineperformancechiptuning@gmail.com`, `SMTP_PASSWORD=<mot de passe d'application Gmail>` et `ORDER_EMAIL=Engineperformancechiptuning@gmail.com`. Le mot de passe d'application Gmail exige généralement la validation en deux étapes. Ne jamais mettre ce mot de passe dans GitHub, le ZIP ou le chat.

## Limites importantes — NE PAS utiliser en production
Prototype pour tests Sandbox uniquement : commandes et fichiers temporaires en mémoire. Redémarrage Render = perte des fichiers et du suivi des commandes. Envoi SMTP peut échouer et n'est pas garanti ; vérifier l'e-mail. Les fichiers sont supprimés après envoi réussi ou expiration des téléversements non associés (1 heure). Les téléversements associés à une commande non payée restent en mémoire jusqu'au redémarrage : prévoir nettoyage et politique de conservation avant production. Le site ne comporte ni base de données durable, ni webhooks PayPal, ni traitement robuste des remboursements/échecs, ni antivirus des fichiers. Pour la production, mettre en place stockage privé durable chiffré, base de données, tâche de purge, vérification de webhook, anti-abus et conformité RGPD. Les prestations doivent respecter la réglementation applicable.
