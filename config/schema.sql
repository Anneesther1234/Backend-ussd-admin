-- ============================================================
-- SCHÉMA BASE DE DONNÉES - SYSTÈME DE VOTE USSD
-- INP-HB ESI - Projet UP-PRO 2025-2026
-- Synchronisé avec les diagrammes UML de Quadri
-- ============================================================

CREATE DATABASE IF NOT EXISTS vote_ussd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vote_ussd;

-- -------------------------------------------------------
-- ÉNUMÉRATIONS (via colonnes ENUM MySQL)
-- StatutCompte   : INACTIF | ACTIF | SUSPENDU | BLOQUE
-- StatutElection : EN_PREPARATION | OUVERTE | SUSPENDUE | CLOTUREE | RESULTATS_PUBLIES
-- StatutDemande  : EN_ATTENTE | VALIDEE | REJETEE | TRAITEE | SUSPENDUE
-- StatutSession  : OUVERTE | FERMEE | EXPIREE
-- StatutCandidat : ACTIF | RETIRE
-- -------------------------------------------------------

-- -------------------------------------------------------
-- TABLE : admins_supremes
-- Administrateur suprême — auth via Google OAuth
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins_supremes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  google_id     VARCHAR(100),
  role          ENUM('super_admin', 'admin') DEFAULT 'super_admin',
  statut        ENUM('INACTIF','ACTIF','SUSPENDU','BLOQUE') DEFAULT 'ACTIF',
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- TABLE : agents_cei
-- Agent CEI — auth par matricule + mot de passe
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents_cei (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  matricule     VARCHAR(20) NOT NULL UNIQUE,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NOT NULL,
  statut        ENUM('INACTIF','ACTIF','SUSPENDU','BLOQUE') DEFAULT 'ACTIF',
  agence        VARCHAR(150),
  admin_id      INT,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins_supremes(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : electeurs
-- Enrôlés physiquement par un agent en agence
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS electeurs (
  id                          INT AUTO_INCREMENT PRIMARY KEY,
  numero_electeur             VARCHAR(20)  NOT NULL UNIQUE,  -- Généré à l'enrôlement
  numero_carte                VARCHAR(20)  NOT NULL UNIQUE,  -- Carte physique remise
  nom                         VARCHAR(100) NOT NULL,
  prenom                      VARCHAR(100) NOT NULL,
  date_naissance              DATE NOT NULL,
  lieu_naissance              VARCHAR(150),
  numero_cni                  VARCHAR(30)  NOT NULL UNIQUE,  -- Carte Nationale d'Identité
  numero_telephone            VARCHAR(20)  NOT NULL UNIQUE,
  mot_de_passe                VARCHAR(255),                  -- Hash bcrypt, NULL avant 1ère connexion
  statut                      ENUM('INACTIF','ACTIF','SUSPENDU','BLOQUE') DEFAULT 'INACTIF',
  a_vote                      BOOLEAN DEFAULT FALSE,
  tentatives_echec            INT DEFAULT 0,
  derniere_connexion          DATETIME NULL,
  date_enrolement             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  agent_id                    INT,                           -- Agent qui a fait l'enrôlement
  updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents_cei(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : otp
-- Codes OTP envoyés par SMS (première connexion + reset)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  electeur_id      INT NOT NULL,
  code             VARCHAR(255) NOT NULL,  -- Hashé bcrypt
  date_generation  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_expiration  DATETIME NOT NULL,      -- +10 minutes
  est_utilise      BOOLEAN DEFAULT FALSE,
  type             ENUM('PREMIERE_CONNEXION','REINITIALISATION') DEFAULT 'PREMIERE_CONNEXION',
  FOREIGN KEY (electeur_id) REFERENCES electeurs(id) ON DELETE CASCADE
);

-- -------------------------------------------------------
-- TABLE : sessions_ussd
-- Sessions USSD ouvertes par les électeurs (*155#)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions_ussd (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  electeur_id      INT,                           -- NULL si numéro non reconnu
  numero_telephone VARCHAR(20) NOT NULL,
  date_debut       DATETIME NOT NULL,
  date_fin         DATETIME NULL,
  statut           ENUM('OUVERTE','FERMEE','EXPIREE') DEFAULT 'OUVERTE',
  etape_courante   VARCHAR(50) DEFAULT 'ACCUEIL',
  token_session    VARCHAR(100) UNIQUE,           -- Token pour sécuriser le vote
  token_utilise    BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (electeur_id) REFERENCES electeurs(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : elections
-- (nommé "scrutins" dans le rapport mais "Election" dans l'UML)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS elections (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  titre        VARCHAR(200) NOT NULL,
  description  TEXT,
  date_debut   DATETIME NOT NULL,
  date_fin     DATETIME NOT NULL,
  statut       ENUM('EN_PREPARATION','OUVERTE','SUSPENDUE','CLOTUREE','RESULTATS_PUBLIES') DEFAULT 'EN_PREPARATION',
  admin_id     INT,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins_supremes(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : candidats
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidats (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  election_id   INT NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  photo         VARCHAR(500),             -- URL ou chemin de la photo
  parti         VARCHAR(150),
  description   TEXT,
  numero_ordre  INT NOT NULL,             -- Numéro affiché dans le menu USSD
  statut        ENUM('ACTIF','RETIRE') DEFAULT 'ACTIF',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
  UNIQUE KEY unique_ordre_election (election_id, numero_ordre)
);

-- -------------------------------------------------------
-- TABLE : votes
-- Votes anonymes enregistrés
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  election_id     INT NOT NULL,
  candidat_id     INT NOT NULL,
  electeur_id     INT NOT NULL,           -- Gardé pour vérifier le double vote
  session_ussd    VARCHAR(100),           -- Référence à la session
  date_vote       DATETIME DEFAULT NOW(),
  est_valide      BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (election_id) REFERENCES elections(id),
  FOREIGN KEY (candidat_id) REFERENCES candidats(id),
  FOREIGN KEY (electeur_id) REFERENCES electeurs(id),
  UNIQUE KEY unique_vote_election (electeur_id, election_id)  -- Un seul vote par électeur par élection
);

-- -------------------------------------------------------
-- TABLE : demandes_reinitialisation_mdp
-- Workflow : électeur → admin suprême → agent CEI
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandes_reinitialisation_mdp (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  electeur_id      INT NOT NULL,
  motif            TEXT,
  statut           ENUM('EN_ATTENTE','VALIDEE','REJETEE','TRAITEE','SUSPENDUE') DEFAULT 'EN_ATTENTE',
  -- Étape admin
  admin_id         INT NULL,
  commentaire_admin TEXT NULL,
  date_traitement_admin DATETIME NULL,
  -- Étape agent (assigné par l'admin)
  agent_id         INT NULL,
  date_traitement_agent DATETIME NULL,
  -- Traçabilité
  date_creation    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (electeur_id) REFERENCES electeurs(id),
  FOREIGN KEY (admin_id) REFERENCES admins_supremes(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents_cei(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : demandes_modification_electeur
-- Agent veut modifier les données d'un électeur → admin valide
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandes_modification_electeur (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  electeur_id      INT NOT NULL,
  agent_id         INT NOT NULL,
  champ_modifie    VARCHAR(50) NOT NULL,
  ancienne_valeur  TEXT,
  nouvelle_valeur  TEXT,
  statut           ENUM('EN_ATTENTE','VALIDEE','REJETEE') DEFAULT 'EN_ATTENTE',
  admin_id         INT NULL,
  commentaire_admin TEXT NULL,
  date_creation    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_traitement  DATETIME NULL,
  FOREIGN KEY (electeur_id) REFERENCES electeurs(id),
  FOREIGN KEY (agent_id) REFERENCES agents_cei(id),
  FOREIGN KEY (admin_id) REFERENCES admins_supremes(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : rapports
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rapports (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  type             VARCHAR(50) NOT NULL,
  election_id      INT NULL,
  contenu          LONGTEXT,
  date_generation  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  admin_id         INT NULL,
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES admins_supremes(id) ON DELETE SET NULL
);

-- -------------------------------------------------------
-- TABLE : journal_audit
-- Traçabilité complète de toutes les actions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_audit (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  action      VARCHAR(100) NOT NULL,
  acteur      VARCHAR(50) NOT NULL,         -- Ex: "admin:1", "agent:3", "electeur:12"
  type_acteur ENUM('admin','agent','electeur','systeme') NOT NULL,
  acteur_id   INT NULL,
  details     JSON,
  adresse_ip  VARCHAR(45),
  date_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- DONNÉES INITIALES
-- -------------------------------------------------------
INSERT INTO admins_supremes (nom, email, role)
VALUES ('Admin Suprême CEI', 'admin.cei@gmail.com', 'super_admin')
ON DUPLICATE KEY UPDATE id=id;

-- -------------------------------------------------------
-- INDEX pour les performances
-- -------------------------------------------------------
CREATE INDEX idx_electeurs_telephone  ON electeurs(numero_telephone);
CREATE INDEX idx_electeurs_numero     ON electeurs(numero_electeur);
CREATE INDEX idx_electeurs_cni        ON electeurs(numero_cni);
CREATE INDEX idx_votes_election       ON votes(election_id);
CREATE INDEX idx_otp_electeur         ON otp(electeur_id);
CREATE INDEX idx_sessions_token       ON sessions_ussd(token_session);
CREATE INDEX idx_demandes_reset_statut ON demandes_reinitialisation_mdp(statut);
CREATE INDEX idx_demandes_modif_statut ON demandes_modification_electeur(statut);
CREATE INDEX idx_audit_acteur         ON journal_audit(type_acteur, acteur_id);
