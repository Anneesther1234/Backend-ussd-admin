# 🗳️ Backend Module Administration — Système de Vote USSD
**INP-HB ESI — Projet UP-PRO 2025-2026**  
Développé par : **DAGO LILIAN**

---

## 📁 Structure du projet

```
backend-admin/
├── server.js                        ← Point d'entrée
├── .env.example                     ← Modèle de configuration
├── config/
│   ├── db.js                        ← Connexion MySQL (pool)
│   ├── googleAuth.js                ← Passport Google OAuth 2.0
│   └── schema.sql                   ← Script BDD (à donner à Quadri)
├── middleware/
│   ├── auth.middleware.js           ← Vérification JWT
│   ├── role.middleware.js           ← Vérification rôle admin
│   └── logger.middleware.js         ← Enregistrement des actions
├── notifications/
│   └── notifyAdmin.js               ← Emails de notification (Nodemailer)
├── controllers/
│   ├── auth.controller.js           ← Auth Google → JWT
│   ├── scrutin.controller.js        ← CRUD scrutins
│   ├── candidat.controller.js       ← CRUD candidats
│   ├── agent.controller.js          ← CRUD agents
│   ├── electeur.controller.js       ← Lecture électeurs + workflow modification
│   └── dashboard.controller.js      ← Stats + rapports + logs
└── routes/
    ├── auth.routes.js
    ├── scrutin.routes.js
    ├── candidat.routes.js
    ├── agent.routes.js
    ├── electeur.routes.js
    └── dashboard.routes.js
```

---

## ⚙️ Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# → Remplir les valeurs dans .env

# 3. Créer la base de données
# Donner config/schema.sql à Quadri Goodness
# ou exécuter directement :
mysql -u root -p < config/schema.sql

# 4. Démarrer le serveur
npm run dev        # développement (avec nodemon)
npm start          # production
```

---

## 🔌 Toutes les routes API

### Authentification (`/api/auth`)
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/api/auth/google` | Lancer connexion Google | ❌ |
| GET | `/api/auth/google/callback` | Callback OAuth → renvoie JWT | ❌ |
| GET | `/api/auth/me` | Profil admin connecté | ✅ JWT |
| POST | `/api/auth/logout` | Déconnexion | ✅ JWT |

### Scrutins (`/api/scrutins`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/scrutins` | Lister (filtre: `?statut=actif`) |
| GET | `/api/scrutins/:id` | Détail + candidats |
| POST | `/api/scrutins` | Créer |
| PUT | `/api/scrutins/:id` | Modifier |
| PATCH | `/api/scrutins/:id/statut` | Changer statut |
| DELETE | `/api/scrutins/:id` | Supprimer (brouillon uniquement) |

### Candidats (`/api/candidats`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/candidats/:scrutinId` | Candidats d'un scrutin |
| POST | `/api/candidats` | Ajouter |
| PUT | `/api/candidats/:id` | Modifier |
| DELETE | `/api/candidats/:id` | Supprimer |

### Agents (`/api/agents`) — super_admin uniquement pour écriture
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/agents` | Lister |
| POST | `/api/agents` | Créer un compte agent |
| PATCH | `/api/agents/:id/statut` | Activer/désactiver |
| DELETE | `/api/agents/:id` | Supprimer |

### Électeurs (`/api/electeurs`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/electeurs` | Lister (recherche + pagination) |
| GET | `/api/electeurs/:id` | Détail |
| PATCH | `/api/electeurs/:id/bloquer` | Bloquer/débloquer |
| GET | `/api/electeurs/demandes` | Demandes de modification en attente |
| POST | `/api/electeurs/demandes` | Agent soumet une demande |
| PATCH | `/api/electeurs/demandes/:id/traiter` | Admin approuve/refuse |

### Dashboard (`/api/dashboard`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/dashboard` | Stats temps réel |
| GET | `/api/dashboard/resultats/:scrutinId` | Résultats d'un scrutin |
| GET | `/api/dashboard/logs` | Historique activités |

---

## 🔔 Flux de modification d'un électeur

```
Agent en agence
      ↓
POST /api/electeurs/demandes
{ electeur_id, agent_id, champ_modifie, nouvelle_valeur }
      ↓
Statut = "en_attente" enregistré en base
      ↓
📧 Email automatique envoyé à l'admin CEI
      ↓
Admin consulte GET /api/electeurs/demandes
      ↓
PATCH /api/electeurs/demandes/:id/traiter
{ decision: "approuve" | "refuse", commentaire }
      ↓
Si approuvé → modification appliquée en base
Si refusé  → demande archivée, aucun changement
```

---

## 🤝 Coordination équipe

| Membre | Responsabilité | Interface avec ce backend |
|--------|---------------|--------------------------|
| **Sibli Salomon** | Frontend admin | Consomme toutes les routes API |
| **Quadri Goodness** | BDD + déploiement | Exécuter `config/schema.sql` |
| **Kouassi Anne-Esther** | Module vote/vérif USSD | Partage tables `electeurs` et `votes` |

> **Important pour Sibli :** Après `GET /api/auth/google/callback`, le token JWT arrive dans l'URL (`?token=...`). Le frontend doit le stocker en mémoire et l'envoyer dans chaque requête en header : `Authorization: Bearer <token>`

---

## 🔐 Sécurité
- **JWT** : expire après 8h
- **Rôles** : `super_admin` (tout) vs `admin` (lecture + scrutins/candidats)
- **Google OAuth** : seuls les emails préalablement enregistrés en base peuvent se connecter
- **Logs** : toute action admin est enregistrée dans `logs_activite`
- **Soft delete** : les suppressions n'effacent pas réellement les données (traçabilité)
