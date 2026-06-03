// config/db.js
// Connexion à la base de données MySQL
const mysql = require("mysql2/promise");
require("dotenv").config();

// Pool de connexions (plus performant qu'une seule connexion)
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "vote_ussd",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
});

// Tester la connexion au démarrage
const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Connexion MySQL réussie - Base de données:", process.env.DB_NAME);
    conn.release();
  } catch (error) {
    console.error("❌ Erreur connexion MySQL:", error.message);
    process.exit(1);
  }
};

module.exports = { pool, testConnection };
