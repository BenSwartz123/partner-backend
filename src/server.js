const express = require("express");
const cors = require("cors");
const { initializeDatabase, seedDatabase } = require("./database");
const { createRoutes } = require("./routes");

async function start() {
  const app = express();
  const PORT = process.env.PORT || 3001;

  // Database (now async because sql.js loads WebAssembly)
  const db = await initializeDatabase();
  seedDatabase(db);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    const ts = new Date().toISOString().split("T")[1].split(".")[0];
    console.log(`[${ts}] ${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use("/api", createRoutes(db));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/", (req, res) => {
    res.json({
      name: "Partner API",
      version: "1.0.0",
      demo_accounts: {
        founder: "founder@demo.com / Demo1234!",
        board: "sarah@partner.io / Demo1234!",
      },
    });
  });

  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("  Partner API running on port " + PORT);
    console.log("  Try visiting /health in the browser");
    console.log("");
    console.log("  Demo accounts:");
    console.log("  Founder: founder@demo.com / Demo1234!");
    console.log("  Board:   sarah@partner.io / Demo1234!");
    console.log("");
  });

  process.on("SIGINT", () => { db.close(); process.exit(0); });
}

start().catch(err => {
  console.error("Failed to start:", err);
  process.exit(1);
});