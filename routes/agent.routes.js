const express = require("express");
const router = express.Router();
const { listerAgents, creerAgent, loginAgent, changerStatutAgent } = require("../controllers/agent.controller");
const { verifierToken } = require("../middleware/auth.middleware");
const { exigerRole } = require("../middleware/role.middleware");

// Login agent (sans JWT)
router.post("/login", loginAgent);
// Routes protégées admin
router.get("/", verifierToken, listerAgents);
router.post("/", verifierToken, exigerRole("super_admin"), creerAgent);
router.patch("/:id/statut", verifierToken, exigerRole("super_admin"), changerStatutAgent);

module.exports = router;
