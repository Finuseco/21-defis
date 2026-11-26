# Déploiement — Les 21 Défis

## 1. Base de données PostgreSQL
```bash
sudo -u postgres createuser defis --pwprompt
sudo -u postgres createdb defis -O defis
psql postgres://defis:MOT_DE_PASSE@localhost/defis -f db/schema.sql
```

## 2. Application
```bash
git clone https://github.com/Finuseco/21-defis.git /var/www/21defis && cd /var/www/21defis
npm install --omit=dev
cp .env.example .env     # puis renseigner les valeurs
set -a; . ./.env; set +a
pm2 start api/server.js --name defis-api --update-env
pm2 save
```
Mise à jour ensuite : `git pull && npm install --omit=dev && pm2 restart defis-api --update-env`.

## 3. Nginx
```nginx
server {
  server_name votre-domaine.com;
  root /var/www/21defis;  index index.html;
  client_max_body_size 10m;                 # capture de pièce d'identité
  location /api/ { proxy_pass http://127.0.0.1:8096; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; }
  location ~ ^/(data|private|db|api/server\.js|\.git|node_modules)  { deny all; }
  location ~* \.(md|sql|json)$ { deny all; }
  location /public/data/ { allow all; }
}
```

## 4. Configuration à fournir (dans `.env`)
- **Domaine** : `SITE_URL`.
- **CashPay All** : `CASHPAY_API_KEY`, `CASHPAY_API_SECRET`. Enregistrer dans le tableau de bord CashPay le webhook `https://votre-domaine.com/api/webhooks/cashpay`. Les SMS passent par la même clé (solde SMS du compte CashPay).
- **E-mail** : `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- Tant que ces valeurs manquent, la recharge, les SMS et les e-mails restent désactivés (le reste du site fonctionne).

## 5. Points importants
- **`DATA_KEY`** chiffre les numéros de pièce d'identité : la sauvegarder séparément, la perdre rend ces numéros illisibles.
- Le dossier `data/` (captures de pièces, photos) est hors du site public ; à sauvegarder avec la base (`pg_dump`).
- Tarifs modifiables : table `parametres` (`prix_sms_usd`, `prix_email_usd`, `recharge_min_usd`). Âge minimum : `MIN_AGE`.
- Administration : `admin.html` avec la valeur de `ADMIN_TOKEN`.
