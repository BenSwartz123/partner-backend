/*
  DATABASE SCHEMA & INITIALIZATION (sql.js version)
  ===================================================
  
  sql.js is SQLite compiled to WebAssembly. Unlike better-sqlite3,
  it doesn't need native compilation so it works on any Node version.
  
  KEY CONCEPT: Adapter Pattern
  We wrap sql.js to match better-sqlite3's API so routes.js
  doesn't need ANY changes. Same .prepare().get(), .prepare().all(),
  .prepare().run() interface.
*/

const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "partner.db");

function createDbWrapper(sqlDb) {
  const wrapper = {
    _db: sqlDb,

    _save() {
      const data = this._db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    },

    prepare(sql) {
      const db = this._db;
      const save = () => wrapper._save();

      return {
        run(...params) {
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          stmt.step();
          stmt.free();
          save();
          const changes = db.getRowsModified();
          const r = db.exec("SELECT last_insert_rowid() as id");
          const lastInsertRowid = r.length > 0 ? r[0].values[0][0] : 0;
          return { changes, lastInsertRowid };
        },

        get(...params) {
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        },

        all(...params) {
          const results = [];
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        },
      };
    },

    exec(sql) {
      this._db.run(sql);
      this._save();
    },

    pragma(str) {
      try { this._db.run(`PRAGMA ${str}`); } catch (e) {}
    },

    transaction(fn) {
      return (...args) => {
        // sql.js doesn't need explicit transactions for our use case
        // Just run the function and save once at the end
        const result = fn(...args);
        this._save();
        return result;
      };
    },

    close() {
      this._save();
      this._db.close();
    },
  };
  return wrapper;
}

async function initializeDatabase() {
  const SQL = await initSqlJs();
  let sqlDb;

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  const db = createDbWrapper(sqlDb);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('founder', 'board')),
      specialty   TEXT,
      bio         TEXT,
      linkedin    TEXT,
      website     TEXT,
      location    TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      company_name    TEXT NOT NULL,
      one_liner       TEXT NOT NULL,
      industry        TEXT NOT NULL,
      stage           TEXT NOT NULL,
      team_size       TEXT,
      website         TEXT,
      problem         TEXT NOT NULL,
      solution        TEXT NOT NULL,
      traction        TEXT NOT NULL,
      looking_for     TEXT NOT NULL,
      funding_target  TEXT,
      additional_notes TEXT,
      status          TEXT NOT NULL DEFAULT 'new'
                        CHECK(status IN ('new', 'under_review', 'more_info', 'approved', 'passed')),
      rating          REAL,
      submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS board_notes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id     INTEGER NOT NULL REFERENCES submissions(id),
      user_id           INTEGER NOT NULL REFERENCES users(id),
      text              TEXT NOT NULL,
      founder_visible   INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tagged_members (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id   INTEGER NOT NULL REFERENCES submissions(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      tagged_by       INTEGER NOT NULL REFERENCES users(id),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(submission_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id   INTEGER NOT NULL REFERENCES submissions(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      text            TEXT NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notification_prefs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      notif_type      TEXT NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, notif_type)
    );
    CREATE TABLE IF NOT EXISTS partnerships (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id   INTEGER NOT NULL REFERENCES submissions(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'accepted', 'declined')),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at    DATETIME,
      UNIQUE(submission_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS meeting_requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id   INTEGER NOT NULL REFERENCES submissions(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      message         TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

function seedDatabase(db) {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (userCount.count > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("Seeding database with demo data...");
  const hp = bcrypt.hashSync("Demo1234!", 10);

  const insertUser = db.prepare(
    "INSERT INTO users (email, password, name, role, specialty, bio, location) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const seedAll = db.transaction(() => {
    insertUser.run("founder@demo.com", hp, "Alex Chen", "founder", null, "Serial entrepreneur focused on financial inclusion.", "San Francisco, CA");
    insertUser.run("sarah@partner.io", hp, "Sarah Kingston", "board", "Healthcare & BioTech", null, null);
    insertUser.run("james@partner.io", hp, "James Morrow", "board", "FinTech & SaaS", null, null);
    insertUser.run("aisha@partner.io", hp, "Aisha Patel", "board", "AI & Deep Tech", null, null);
    insertUser.run("david@partner.io", hp, "David Chen", "board", "Operations & Growth", null, null);
    insertUser.run("maya@partner.io", hp, "Maya Roberts", "board", "Impact & CleanTech", null, null);

    const insertSub = db.prepare(
      "INSERT INTO submissions (user_id, company_name, one_liner, industry, stage, team_size, website, problem, solution, traction, looking_for, funding_target, status, rating, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    insertSub.run(1, "NeuralPay", "AI-powered fraud detection for African mobile money platforms", "FinTech", "Seed", "6-15", "https://neuralpay.io", "Mobile money fraud costs African platforms $4.2B annually.", "ML models trained on African mobile money patterns. 84% fraud reduction.", "3 telco pilots. $180K ARR. 2M transactions/month.", "Investment,Strategic Partnerships", "$2M Seed Round", "under_review", 4, "2026-02-10");
    insertSub.run(1, "PayFlow", "Instant cross-border payments for freelancers in Africa", "FinTech", "Series A", "16-50", "https://payflow.io", "Cross-border payments take 3-5 days and cost 8-12% in fees.", "Instant settlement via stablecoin rails with local currency on/off ramps.", "12K active users. $2.1M monthly volume. $480K ARR.", "Investment,Board Advisors", "$5M Series A", "approved", 5, "2026-01-20");
    insertSub.run(1, "QuickLedger", "Automated bookkeeping for SMBs in emerging markets", "FinTech", "Pre-Seed", "2-5", "", "SMBs spend 15+ hours/week on manual bookkeeping.", "OCR-powered receipt scanning with automated categorization.", "200 beta users. 30 interviews completed.", "Investment,Mentorship", "$400K Pre-Seed", "passed", 2, "2025-12-05");

    const insertNote = db.prepare("INSERT INTO board_notes (submission_id, user_id, text, founder_visible, created_at) VALUES (?, ?, ?, ?, ?)");
    insertNote.run(1, 2, "Strong product-market fit. Requesting financial projections.", 1, "2026-02-13");
    insertNote.run(2, 2, "Exceptional traction. Connecting with our healthcare network.", 1, "2026-02-01");
    insertNote.run(2, 3, "Internal: verify regulatory compliance before introductions.", 0, "2026-02-03");
    insertNote.run(3, 2, "Market too competitive. Encouraged to reapply.", 1, "2025-12-15");

    const insertTag = db.prepare("INSERT INTO tagged_members (submission_id, user_id, tagged_by) VALUES (?, ?, ?)");
    insertTag.run(1, 3, 2);
    insertTag.run(1, 4, 2);

    const insertChat = db.prepare("INSERT INTO chat_messages (submission_id, user_id, text, created_at) VALUES (?, ?, ?, ?)");
    insertChat.run(1, 2, "Strong FinTech play. @James evaluate fraud claims?", "2026-02-11T09:15:00");
    insertChat.run(1, 3, "84% fraud reduction credible. Want false positive breakdown.", "2026-02-11T14:30:00");
    insertChat.run(1, 4, "ML approach solid. Requesting training data methodology.", "2026-02-12T10:45:00");
  });

  seedAll();
  console.log("Database seeded successfully.");
}

module.exports = { initializeDatabase, seedDatabase };
