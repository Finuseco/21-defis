# Déploiement 21 Défis
1. `git clone https://github.com/Finuseco/21-defis.git /var/www/21-defis`
2. Créer le dossier de données inscriptible : `mkdir -p /var/www/21-defis/data`
3. API (Node 22, sans npm install) :
   `ADMIN_TOKEN='choisissez-un-long-secret' pm2 start /var/www/21-defis/api/server.js --name defis-api && pm2 save`
4. Nginx (dans le bloc server du domaine) :
```
root /var/www/21-defis;
index index.html;
location /api/ { proxy_pass http://127.0.0.1:8096; proxy_set_header X-Forwarded-For $remote_addr; }
location ~ ^/(data|private|deploy\.md|README\.md|\.git) { deny all; }   # base de données et défis privés : jamais servis en fichier
```
5. Mise à jour : `cd /var/www/21-defis && git pull origin main && pm2 restart defis-api`
Les membres sont dans `data/membres.sqlite` (sauvegardez ce fichier).
