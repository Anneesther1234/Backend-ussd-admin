// server.js — Backend Admin Vote USSD v4
// Synchronisé avec les diagrammes UML de Quadri
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const session = require("express-session");
const passport = require("./config/googleAuth");
const { testConnection } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(session({
  secret: process.env.SESSION_SECRET || "secret_dev",
  resave: false, saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Routes publiques (sans JWT) ──────────────────────────
app.use("/api/public",         require("./routes/public.routes"));
// ── Routes USSD (Kouassi) ───────────────────────────────
app.use("/api/ussd",           require("./routes/ussd.routes"));
// ── Reset mot de passe ──────────────────────────────────
app.use("/api/reset-password", require("./routes/resetPassword.routes"));
// ── Auth admin suprême ──────────────────────────────────
app.use("/api/auth",           require("./routes/auth.routes"));
// ── Routes admin protégées JWT ──────────────────────────
app.use("/api/elections",      require("./routes/scrutin.routes"));
app.use("/api/candidats",      require("./routes/candidat.routes"));
app.use("/api/agents",         require("./routes/agent.routes"));
app.use("/api/electeurs",      require("./routes/electeur.routes"));
app.use("/api/dashboard",      require("./routes/dashboard.routes"));

app.get("/", (req, res) => {
  res.json({
    message: "API Backend Administration - Systeme de Vote USSD",
    version: "4.0.0",
    statut: "En ligne",
    nouveautes_v4: [
      "Journal audit complet (refus inclus)",
      "SMS OTP envoye automatiquement a l'enrolement",
      "Modification mot de passe electeur actif",
      "Reset MDP : electeur USSD -> agent (verif physique) -> admin -> OTP SMS",
    ],
    routes_ussd: [
      "POST /api/ussd/verifier-acces",
      "POST /api/ussd/renvoyer-otp      (si OTP expire)",
      "POST /api/ussd/valider-otp",
      "POST /api/ussd/definir-mot-de-passe",
      "POST /api/ussd/modifier-mot-de-passe  (MDP volontaire)",
      "POST /api/ussd/authentifier",
      "POST /api/ussd/voter",
      "POST /api/ussd/statut-vote",
    ],
    routes_reset: [
      "POST /api/reset-password/demande-ussd   (electeur signale)",
      "POST /api/reset-password/agent-soumettre (agent apres verif physique)",
      "GET  /api/reset-password                 (admin liste)",
      "PATCH /api/reset-password/:id/valider    (admin valide -> OTP SMS)",
    ],
  });
});

app.use((req, res) => res.status(404).json({ succes: false, message: `Route introuvable: ${req.method} ${req.originalUrl}` }));
app.use((err, req, res, next) => {
  console.error("Erreur:", err);
  res.status(500).json({ succes: false, message: "Erreur serveur", details: process.env.NODE_ENV === "development" ? err.message : undefined });
});

const demarrer = async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log("\n================================================");
    console.log("  Backend Admin - Systeme Vote USSD v4");
    console.log("  INP-HB ESI - UP-PRO 2025-2026");
    console.log(`  http://localhost:${PORT}`);
    console.log("================================================\n");
  });
};
demarrer();
