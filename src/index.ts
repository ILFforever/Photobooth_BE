import "dotenv/config";
import express from "express";
import cors from "cors";
import versionsRouter from "./routes/versions";
import releasesRouter from "./routes/releases";
import authRouter from "./routes/auth";
import { db, bucket } from "./config";

const app = express();
const port = parseInt(process.env.PORT || "3001");

// Debug logging helper
const debugLog = (level: "INFO" | "WARN" | "ERROR", message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  console.log(logEntry, data ? JSON.stringify(data, null, 2) : "");
};

// Startup logging
debugLog("INFO", "=== APPLICATION STARTING ===");
debugLog("INFO", `Node version: ${process.version}`);
debugLog("INFO", `Environment: ${process.env.NODE_ENV || "development"}`);
debugLog("INFO", `Port: ${port}`);
debugLog("INFO", `Platform: ${process.platform}`);
debugLog("INFO", `Memory at startup: ${JSON.stringify(process.memoryUsage())}`);

// Check environment variables
const requiredEnvVars = ["GOOGLE_APPLICATION_CREDENTIALS_JSON", "GCS_BUCKET_NAME"];
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnvVars.length > 0) {
  debugLog("ERROR", `Missing required environment variables: ${missingEnvVars.join(", ")}`);
}
debugLog("INFO", `Environment check complete. Missing vars: ${missingEnvVars.length}`);

app.use(cors());
// Increase body size limits for large file uploads
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  debugLog("INFO", `Incoming request: ${req.method} ${req.path}`, {
    ip: req.ip,
    headers: {
      "user-agent": req.headers["user-agent"],
      "fly-client-ip": req.headers["fly-client-ip"],
      "fly-region": req.headers["fly-region"],
    },
  });

  // Log response when done
  res.on("finish", () => {
    const duration = Date.now() - start;
    debugLog("INFO", `Response: ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// GET /health - basic health check (must respond quickly for Fly.io)
app.get("/health", (_req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  res.json({
    status: "ok",
    uptime: `${Math.floor(uptime)}s`,
    memory: {
      used: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/status - detailed status with service checks
app.get("/api/status", async (_req, res) => {
  const status = {
    server: "ok",
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    services: {
      firestore: "checking",
      storage: "checking",
    },
  };

  // Check Firestore
  try {
    debugLog("INFO", "Checking Firestore connection...");
    const snapshot = await db.collection("releases").limit(1).get();
    status.services.firestore = "ok";
    debugLog("INFO", `Firestore check passed, documents found: ${snapshot.size}`);
  } catch (error) {
    status.services.firestore = "error";
    debugLog("ERROR", "Firestore check failed", error);
  }

  // Check GCS
  try {
    debugLog("INFO", "Checking GCS bucket connection...");
    const exists = await bucket.exists();
    status.services.storage = exists[0] ? "ok" : "not_found";
    debugLog("INFO", `GCS check passed, bucket exists: ${exists[0]}`);
  } catch (error) {
    status.services.storage = "error";
    debugLog("ERROR", "GCS check failed", error);
  }

  const allOk = Object.values(status.services).every((s) => s === "ok");
  if (allOk) {
    debugLog("INFO", "All services healthy");
  } else {
    debugLog("WARN", "Some services unhealthy", status.services);
  }
  res.status(allOk ? 200 : 503).json(status);
});

app.use("/api/versions", versionsRouter);
app.use("/api/releases", releasesRouter);
app.use("/api/auth", authRouter);

// 404 handler
app.use((_req, res) => {
  debugLog("WARN", `404 - Route not found: ${_req.method} ${_req.path}`);
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  debugLog("ERROR", "Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  debugLog("ERROR", "UNCAUGHT EXCEPTION", error);
  debugLog("ERROR", "Stack trace", error.stack);
  // Give time for logging before exiting
  setTimeout(() => process.exit(1), 1000);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  debugLog("ERROR", "UNHANDLED PROMISE REJECTION", { reason, promise });
});

// Handle SIGTERM for graceful shutdown (Fly.io sends this)
process.on("SIGTERM", () => {
  debugLog("INFO", "=== SIGTERM RECEIVED - Starting graceful shutdown ===");
  debugLog("INFO", `Uptime at shutdown: ${Math.floor(process.uptime())}s`);
  setTimeout(() => {
    debugLog("INFO", "=== Graceful shutdown complete ===");
    process.exit(0);
  }, 500);
});

// Handle SIGINT for graceful shutdown
process.on("SIGINT", () => {
  debugLog("INFO", "=== SIGINT RECEIVED - Starting graceful shutdown ===");
  setTimeout(() => {
    debugLog("INFO", "=== Graceful shutdown complete ===");
    process.exit(0);
  }, 500);
});

const server = app.listen(port, () => {
  debugLog("INFO", `=== SERVER STARTED ===`);
  debugLog("INFO", `Server listening on port ${port}`);
  debugLog("INFO", `Health check available at http://localhost:${port}/health`);
  debugLog("INFO", `Status endpoint available at http://localhost:${port}/api/status`);
});

// Set server timeout to avoid hanging connections
server.setTimeout(30000); // 30 second timeout
debugLog("INFO", `Server timeout set to 30000ms`);
