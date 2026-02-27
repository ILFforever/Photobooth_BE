import admin from "firebase-admin";

// Debug logging helper
const debugLog = (level: "INFO" | "WARN" | "ERROR", message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] [FIREBASE] ${message}`;
  console.log(logEntry, data ? JSON.stringify(data, null, 2) : "");
};

debugLog("INFO", "Initializing Firebase Admin SDK...");

const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (!credentialsJson) {
  debugLog("ERROR", "GOOGLE_APPLICATION_CREDENTIALS_JSON env var is required");
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON env var is required");
}

debugLog("INFO", "Credentials found, parsing JSON...");
let serviceAccount: Record<string, unknown>;
try {
  serviceAccount = JSON.parse(credentialsJson);
  debugLog("INFO", "Credentials parsed successfully", {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
  });
} catch (error) {
  debugLog("ERROR", "Failed to parse credentials JSON", error);
  throw new Error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON");
}

const bucketName = process.env.GCS_BUCKET_NAME;
if (!bucketName) {
  debugLog("WARN", "GCS_BUCKET_NAME not set, storage operations may fail");
} else {
  debugLog("INFO", `GCS Bucket: ${bucketName}`);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    storageBucket: bucketName,
  });
  debugLog("INFO", "Firebase Admin SDK initialized successfully");
} catch (error) {
  debugLog("ERROR", "Firebase initialization failed", error);
  throw error;
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();

debugLog("INFO", "Firestore and Storage bucket exports ready");
