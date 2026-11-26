-- =====================================================================
--  Les 21 Défis — Base de données PostgreSQL (version 14+)
--  Installation :  createdb defis && psql defis -f db/schema.sql
--  Fichier idempotent : peut être relancé sans casser les données.
-- =====================================================================

-- Numéro de membre : commence à 10000 (5 chiffres) et grandit sans limite (6, 7 chiffres…)
CREATE SEQUENCE IF NOT EXISTS membre_numero_seq START 10000;

CREATE TABLE IF NOT EXISTS membres (
  id               BIGSERIAL PRIMARY KEY,
  numero           BIGINT      NOT NULL UNIQUE DEFAULT nextval('membre_numero_seq'),
  prenom           TEXT        NOT NULL,
  nom              TEXT        NOT NULL,
  postnom          TEXT        NOT NULL DEFAULT '',
  date_naissance   DATE        NOT NULL,
  email            TEXT        NOT NULL,
  telephone        TEXT        NOT NULL,            -- normalisé : chiffres uniquement, avec indicatif (ex. 243812345678)
  pays             TEXT        NOT NULL DEFAULT 'RD Congo',
  province         TEXT        NOT NULL DEFAULT '',
  region           TEXT        NOT NULL DEFAULT '', -- région / territoire / secteur de résidence
  ville            TEXT        NOT NULL DEFAULT '',
  -- Pièce d'identité : le numéro n'est jamais stocké en clair
  piece_type       TEXT        NOT NULL,            -- carte_electeur | passeport | permis | carte_identite
  piece_hash       TEXT        NOT NULL,            -- HMAC-SHA256 du numéro normalisé (sert à interdire les doublons)
  piece_chiffre    TEXT        NOT NULL,            -- numéro chiffré AES-256-GCM (lisible seulement par l'administration)
  piece_masque     TEXT        NOT NULL,            -- ex. « ••••4821 » pour l'affichage
  piece_fichier    TEXT        NOT NULL,            -- nom du fichier de la capture (dossier data/pieces/, hors web)
  type             TEXT        NOT NULL DEFAULT 'membre' CHECK (type IN ('membre','sympathisant','benevole')),
  message          TEXT        NOT NULL DEFAULT '',
  mot_de_passe     TEXT        NOT NULL,
  grade            TEXT        NOT NULL DEFAULT 'membre' CHECK (grade IN ('membre','depute','coordinateur','candidat')),
  statut           TEXT        NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','refuse')),
  accepte_messages BOOLEAN     NOT NULL DEFAULT FALSE, -- consentement : recevoir SMS / e-mails du parti et des députés
  code_parrainage  TEXT        NOT NULL UNIQUE DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  parrain_id       BIGINT      REFERENCES membres(id) ON DELETE SET NULL, -- député dont le lien d'invitation a été utilisé
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
  valide_le        TIMESTAMPTZ
);
-- Aucun doublon, jamais : e-mail, téléphone, numéro de pièce d'identité
CREATE UNIQUE INDEX IF NOT EXISTS membres_email_uniq     ON membres (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS membres_telephone_uniq ON membres (telephone);
CREATE UNIQUE INDEX IF NOT EXISTS membres_piece_uniq     ON membres (piece_hash);
CREATE INDEX IF NOT EXISTS membres_province_idx          ON membres (province, statut);

-- Profil public des députés (et coordinateurs / candidat)
CREATE TABLE IF NOT EXISTS deputes (
  membre_id    BIGINT PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
  type_mandat  TEXT NOT NULL DEFAULT 'provincial' CHECK (type_mandat IN ('national','provincial')),
  province     TEXT NOT NULL DEFAULT '',
  secteur      TEXT NOT NULL DEFAULT '',
  profession   TEXT NOT NULL DEFAULT '',
  bio          TEXT NOT NULL DEFAULT '',
  slogan       TEXT NOT NULL DEFAULT '',
  photo_fichier TEXT,
  couleur      TEXT NOT NULL DEFAULT 'bleu' CHECK (couleur IN ('bleu','jaune','rouge','tricolore')),
  couverture   TEXT NOT NULL DEFAULT '',
  reseaux      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {facebook, instagram, x, tiktok, youtube, whatsapp, linkedin, telegram, site}
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidatures (
  id             BIGSERIAL PRIMARY KEY,
  membre_id      BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  type_mandat    TEXT NOT NULL CHECK (type_mandat IN ('national','provincial')),
  province       TEXT NOT NULL,
  secteur        TEXT NOT NULL DEFAULT '',
  profession     TEXT NOT NULL DEFAULT '',
  motivation     TEXT NOT NULL,
  statut         TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','retenue','refusee')),
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS candidature_en_cours ON candidatures (membre_id) WHERE statut IN ('en_attente','retenue');

CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,                       -- empreinte SHA-256 du jeton du cookie
  membre_id BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  expire   TIMESTAMPTZ NOT NULL
);

-- Abonnements des membres aux profils de députés
CREATE TABLE IF NOT EXISTS abonnements (
  membre_id BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  depute_id BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  source    TEXT NOT NULL DEFAULT 'profil',        -- profil | lien
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (membre_id, depute_id)
);
CREATE INDEX IF NOT EXISTS abonnements_depute_idx ON abonnements (depute_id, cree_le);

-- ----------------------------- Portefeuille -----------------------------
CREATE TABLE IF NOT EXISTS parametres (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
INSERT INTO parametres (cle, valeur) VALUES
  ('prix_sms_usd',   '0.20'),   -- 10 $ = 50 SMS
  ('prix_email_usd', '0.10'),   -- 10 $ = 100 e-mails
  ('recharge_min_usd','5')
ON CONFLICT (cle) DO NOTHING;

CREATE TABLE IF NOT EXISTS portefeuilles (
  membre_id      BIGINT PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
  solde_usd      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (solde_usd >= 0),
  credits_sms    INTEGER NOT NULL DEFAULT 0 CHECK (credits_sms >= 0),
  credits_email  INTEGER NOT NULL DEFAULT 0 CHECK (credits_email >= 0),
  maj_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mouvements (
  id            BIGSERIAL PRIMARY KEY,
  membre_id     BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,                     -- recharge | achat_sms | achat_email | campagne | remboursement | ajustement
  montant_usd   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- + entrée / − sortie
  credits_sms   INTEGER NOT NULL DEFAULT 0,
  credits_email INTEGER NOT NULL DEFAULT 0,
  reference     TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mouvements_membre_idx ON mouvements (membre_id, cree_le DESC);

-- Paiements CashPay All (carte bancaire / mobile money) pour approvisionner le portefeuille
CREATE TABLE IF NOT EXISTS paiements (
  id                BIGSERIAL PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  membre_id         BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  montant_usd       NUMERIC(12,2) NOT NULL CHECK (montant_usd > 0),
  statut            TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','reussi','echoue')),
  cashpay_session   TEXT,
  cashpay_tx        TEXT,
  url_paiement      TEXT,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------ Campagnes ------------------------------
-- Contacts importés par un député (il atteste avoir leur consentement)
CREATE TABLE IF NOT EXISTS contacts (
  id          BIGSERIAL PRIMARY KEY,
  depute_id   BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL DEFAULT '',
  telephone   TEXT,
  email       TEXT,
  desabonne   BOOLEAN NOT NULL DEFAULT FALSE,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (telephone IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_tel_uniq   ON contacts (depute_id, telephone) WHERE telephone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_uniq ON contacts (depute_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS campagnes (
  id              BIGSERIAL PRIMARY KEY,
  depute_id       BIGINT NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  canal           TEXT NOT NULL CHECK (canal IN ('sms','email')),
  nom             TEXT NOT NULL,
  sujet           TEXT NOT NULL DEFAULT '',
  message         TEXT NOT NULL,
  signature       TEXT NOT NULL DEFAULT 'depute' CHECK (signature IN ('depute','21defis')),
  sources         TEXT[] NOT NULL DEFAULT '{}',    -- abonnes | province | tous | contacts
  statut          TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','en_cours','terminee','annulee')),
  total           INTEGER NOT NULL DEFAULT 0,
  envoyes         INTEGER NOT NULL DEFAULT 0,
  echecs          INTEGER NOT NULL DEFAULT 0,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  lance_le        TIMESTAMPTZ,
  fini_le         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS campagnes_depute_idx ON campagnes (depute_id, cree_le DESC);

CREATE TABLE IF NOT EXISTS campagne_envois (
  id           BIGSERIAL PRIMARY KEY,
  campagne_id  BIGINT NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL DEFAULT '',
  telephone    TEXT,
  email        TEXT,
  statut       TEXT NOT NULL DEFAULT 'attente' CHECK (statut IN ('attente','envoi','envoye','echec','annule')),
  erreur       TEXT,
  envoye_le    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS envois_file_idx ON campagne_envois (campagne_id, statut);

-- ------------------------------- Média --------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id         BIGSERIAL PRIMARY KEY,
  titre      TEXT NOT NULL,
  categorie  TEXT NOT NULL CHECK (categorie IN ('actualite','politique','visite','evenement')),
  resume     TEXT NOT NULL DEFAULT '',
  contenu    TEXT NOT NULL,
  image      TEXT NOT NULL DEFAULT '',
  publie     BOOLEAN NOT NULL DEFAULT FALSE,
  publie_le  TIMESTAMPTZ,
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================== Fonctions (opérations atomiques) ======================

-- Promeut un membre (député, coordinateur, candidat) : crée son profil, son portefeuille.
CREATE OR REPLACE FUNCTION fn_promouvoir(p_membre BIGINT, p_grade TEXT, p_type TEXT, p_province TEXT, p_secteur TEXT, p_profession TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE membres SET grade = p_grade, province = CASE WHEN p_province <> '' THEN p_province ELSE province END WHERE id = p_membre;
  INSERT INTO deputes (membre_id, type_mandat, province, secteur, profession)
  VALUES (p_membre, p_type, COALESCE(NULLIF(p_province,''), (SELECT province FROM membres WHERE id = p_membre)), p_secteur, p_profession)
  ON CONFLICT (membre_id) DO UPDATE SET
    type_mandat = EXCLUDED.type_mandat,
    province    = CASE WHEN EXCLUDED.province <> '' THEN EXCLUDED.province ELSE deputes.province END,
    secteur     = CASE WHEN EXCLUDED.secteur  <> '' THEN EXCLUDED.secteur  ELSE deputes.secteur  END,
    profession  = CASE WHEN EXCLUDED.profession <> '' THEN EXCLUDED.profession ELSE deputes.profession END;
  INSERT INTO portefeuilles (membre_id) VALUES (p_membre) ON CONFLICT DO NOTHING;
END $$;

-- Confirme un paiement réussi (idempotent : un même paiement ne crédite jamais deux fois)
CREATE OR REPLACE FUNCTION fn_confirmer_paiement(p_reference TEXT, p_tx TEXT)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE r paiements%ROWTYPE;
BEGIN
  UPDATE paiements SET statut = 'reussi', cashpay_tx = p_tx, maj_le = now()
   WHERE reference = p_reference AND statut = 'en_attente' RETURNING * INTO r;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'raison', 'inconnu_ou_deja_traite');
  END IF;
  INSERT INTO portefeuilles (membre_id, solde_usd) VALUES (r.membre_id, r.montant_usd)
    ON CONFLICT (membre_id) DO UPDATE SET solde_usd = portefeuilles.solde_usd + r.montant_usd, maj_le = now();
  INSERT INTO mouvements (membre_id, type, montant_usd, reference, description)
    VALUES (r.membre_id, 'recharge', r.montant_usd, r.reference, 'Recharge CashPay All');
  RETURN json_build_object('ok', true, 'membre_id', r.membre_id, 'montant', r.montant_usd);
END $$;

-- Achète des crédits (SMS ou e-mail) avec le solde en dollars
CREATE OR REPLACE FUNCTION fn_acheter_credits(p_membre BIGINT, p_canal TEXT, p_quantite INTEGER)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE prix NUMERIC; cout NUMERIC; w portefeuilles%ROWTYPE;
BEGIN
  IF p_quantite < 1 OR p_canal NOT IN ('sms','email') THEN RETURN json_build_object('ok', false, 'erreur', 'Quantité invalide'); END IF;
  SELECT valeur::numeric INTO prix FROM parametres WHERE cle = 'prix_' || p_canal || '_usd';
  cout := round(prix * p_quantite, 2);
  UPDATE portefeuilles SET solde_usd = solde_usd - cout,
         credits_sms   = credits_sms   + CASE WHEN p_canal = 'sms'   THEN p_quantite ELSE 0 END,
         credits_email = credits_email + CASE WHEN p_canal = 'email' THEN p_quantite ELSE 0 END, maj_le = now()
   WHERE membre_id = p_membre AND solde_usd >= cout RETURNING * INTO w;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'erreur', 'Solde insuffisant : rechargez votre portefeuille.', 'cout', cout); END IF;
  INSERT INTO mouvements (membre_id, type, montant_usd, credits_sms, credits_email, description)
    VALUES (p_membre, 'achat_' || p_canal, -cout,
            CASE WHEN p_canal = 'sms' THEN p_quantite ELSE 0 END, CASE WHEN p_canal = 'email' THEN p_quantite ELSE 0 END,
            p_quantite || ' crédits ' || p_canal);
  RETURN json_build_object('ok', true, 'cout', cout, 'solde_usd', w.solde_usd, 'credits_sms', w.credits_sms, 'credits_email', w.credits_email);
END $$;

-- Lance une campagne : réserve les crédits (1 par destinataire) puis passe en « en_cours »
CREATE OR REPLACE FUNCTION fn_lancer_campagne(p_campagne BIGINT)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE c campagnes%ROWTYPE; n INTEGER; w portefeuilles%ROWTYPE;
BEGIN
  SELECT * INTO c FROM campagnes WHERE id = p_campagne AND statut = 'brouillon' FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'erreur', 'Campagne introuvable'); END IF;
  SELECT count(*)::int INTO n FROM campagne_envois WHERE campagne_id = p_campagne;
  IF n = 0 THEN RETURN json_build_object('ok', false, 'erreur', 'Aucun destinataire'); END IF;
  UPDATE portefeuilles SET
         credits_sms   = credits_sms   - CASE WHEN c.canal = 'sms'   THEN n ELSE 0 END,
         credits_email = credits_email - CASE WHEN c.canal = 'email' THEN n ELSE 0 END, maj_le = now()
   WHERE membre_id = c.depute_id
     AND (CASE WHEN c.canal = 'sms' THEN credits_sms ELSE credits_email END) >= n RETURNING * INTO w;
  IF NOT FOUND THEN
    SELECT * INTO w FROM portefeuilles WHERE membre_id = c.depute_id;
    RETURN json_build_object('ok', false, 'erreur', 'Crédits insuffisants', 'besoin', n,
           'credits', CASE WHEN c.canal = 'sms' THEN COALESCE(w.credits_sms,0) ELSE COALESCE(w.credits_email,0) END);
  END IF;
  UPDATE campagnes SET statut = 'en_cours', total = n, lance_le = now() WHERE id = p_campagne;
  INSERT INTO mouvements (membre_id, type, credits_sms, credits_email, reference, description)
    VALUES (c.depute_id, 'campagne', CASE WHEN c.canal = 'sms' THEN -n ELSE 0 END, CASE WHEN c.canal = 'email' THEN -n ELSE 0 END,
            'campagne-' || p_campagne, 'Campagne « ' || c.nom || ' »');
  RETURN json_build_object('ok', true, 'total', n);
END $$;

-- Rembourse 1 crédit pour un envoi échoué
CREATE OR REPLACE FUNCTION fn_rembourser_envoi(p_envoi BIGINT, p_erreur TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campagnes%ROWTYPE; e campagne_envois%ROWTYPE;
BEGIN
  UPDATE campagne_envois SET statut = 'echec', erreur = left(p_erreur, 300), envoye_le = now()
   WHERE id = p_envoi AND statut IN ('envoi','attente') RETURNING * INTO e;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM campagnes WHERE id = e.campagne_id;
  UPDATE portefeuilles SET credits_sms = credits_sms + CASE WHEN c.canal = 'sms' THEN 1 ELSE 0 END,
                           credits_email = credits_email + CASE WHEN c.canal = 'email' THEN 1 ELSE 0 END WHERE membre_id = c.depute_id;
  UPDATE campagnes SET echecs = echecs + 1 WHERE id = c.id;
END $$;

-- Annule une campagne : les envois non partis sont remboursés
CREATE OR REPLACE FUNCTION fn_annuler_campagne(p_campagne BIGINT, p_depute BIGINT)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE c campagnes%ROWTYPE; n INTEGER;
BEGIN
  SELECT * INTO c FROM campagnes WHERE id = p_campagne AND depute_id = p_depute AND statut = 'en_cours' FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'erreur', 'Campagne introuvable ou déjà terminée'); END IF;
  UPDATE campagne_envois SET statut = 'annule' WHERE campagne_id = p_campagne AND statut = 'attente';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE portefeuilles SET credits_sms = credits_sms + CASE WHEN c.canal = 'sms' THEN n ELSE 0 END,
                           credits_email = credits_email + CASE WHEN c.canal = 'email' THEN n ELSE 0 END WHERE membre_id = p_depute;
  INSERT INTO mouvements (membre_id, type, credits_sms, credits_email, reference, description)
    VALUES (p_depute, 'remboursement', CASE WHEN c.canal = 'sms' THEN n ELSE 0 END, CASE WHEN c.canal = 'email' THEN n ELSE 0 END,
            'campagne-' || p_campagne, 'Annulation de « ' || c.nom || ' »');
  UPDATE campagnes SET statut = 'annulee', fini_le = now() WHERE id = p_campagne;
  RETURN json_build_object('ok', true, 'rembourses', n);
END $$;
