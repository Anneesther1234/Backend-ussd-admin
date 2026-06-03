const express = require("express");
const router = express.Router();
const { getDashboard, getResultatsElection, getLogs } = require("../controllers/dashboard.controller");
const { verifierToken } = require("../middleware/auth.middleware");

router.use(verifierToken);
router.get("/", getDashboard);
router.get("/resultats/:electionId", getResultatsElection);
router.get("/logs", getLogs);

module.exports = router;
