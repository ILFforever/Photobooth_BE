import admin from "firebase-admin";

const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (!credentialsJson) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON env var is required");
}

const serviceAccount = JSON.parse(credentialsJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.GCS_BUCKET_NAME,
});

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
