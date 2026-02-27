import "dotenv/config";
import express from "express";
import cors from "cors";
import versionsRouter from "./routes/versions";
import releasesRouter from "./routes/releases";
import authRouter from "./routes/auth";
import { db, bucket } from "./config";

const app = express();
const port = parseInt(process.env.PORT || "3001");

app.use(cors());
// Increase body size limits for large file uploads
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// GET /health - basic health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /api/status - detailed status with service checks
app.get("/api/status", async (_req, res) => {
  const status = {
    server: "ok",
    timestamp: new Date().toISOString(),
    services: {
      firestore: "checking",
      storage: "checking",
    },
  };

  // Check Firestore
  try {
    await db.collection("releases").limit(1).get();
    status.services.firestore = "ok";
  } catch {
    status.services.firestore = "error";
  }

  // Check GCS
  try {
    await bucket.exists();
    status.services.storage = "ok";
  } catch {
    status.services.storage = "error";
  }

  const allOk = Object.values(status.services).every((s) => s === "ok");
  res.status(allOk ? 200 : 503).json(status);
});

app.use("/api/versions", versionsRouter);
app.use("/api/releases", releasesRouter);
app.use("/api/auth", authRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
