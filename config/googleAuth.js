// config/googleAuth.js
// Table utilisée : admins_supremes
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { pool } = require("./db");
require("dotenv").config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const google_id = profile.id;
        const nom = profile.displayName;

        const [rows] = await pool.execute(
          "SELECT * FROM admins_supremes WHERE email = ? OR google_id = ?",
          [email, google_id]
        );

        if (rows.length > 0) {
          const admin = rows[0];
          if (admin.statut === 'BLOQUE' || admin.statut === 'SUSPENDU') {
            return done(null, false, { message: "Compte désactivé." });
          }
          if (!admin.google_id) {
            await pool.execute("UPDATE admins_supremes SET google_id = ? WHERE id = ?", [google_id, admin.id]);
          }
          return done(null, admin);
        } else {
          return done(null, false, { message: "Email non autorisé. Contactez le super-administrateur." });
        }
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((admin, done) => done(null, admin.id));

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, nom, email, role FROM admins_supremes WHERE id = ?", [id]
    );
    done(null, rows[0] || null);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
