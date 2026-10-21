# EPC — Paiement PayPal multi-prestations

## Installation
1. Installer Node.js 18+ (Node.js 20+ recommandé).
2. Dans ce dossier : `npm install`
3. Copier `.env.example` en `.env`.
4. Dans `.env`, renseigner **localement** `PAYPAL_CLIENT_SECRET` obtenu dans PayPal Developer (ne jamais le mettre dans le HTML, GitHub ou une conversation).
5. Vérifier que le Client ID et le Secret appartiennent **au même mode** (Sandbox ou Live).
6. Démarrer : `npm start`, puis ouvrir `http://localhost:3000`.
7. Tester en Sandbox avec un compte acheteur Sandbox. Pour de vrais paiements, utiliser les identifiants Live et `PAYPAL_MODE=live`, après tests et sécurisation.

## Sécurité / limites
- Les 29 tarifs sont définis dans `catalog.json` et recalculés sur le serveur. Le navigateur n’envoie que des identifiants.
- Le paiement est confirmé via PayPal Orders v2 et le montant capturé est contrôlé côté serveur.
- **Prototype technique**, non prêt pour production : commandes gardées uniquement en mémoire, sans base de données ni webhooks, sans envoi automatique de fichier, sans workflow de remboursement. Avant lancement commercial, ajouter stockage persistant, webhooks PayPal vérifiés, journal des commandes, informations légales, CGV et politique de confidentialité.
- Certaines modifications ECU peuvent être illégales sur route ouverte ; vérifier les prestations et leur destination avant de les commercialiser.
- Ne jamais partager votre Secret PayPal.
