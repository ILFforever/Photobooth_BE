import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { db, bucket } from "../config";
import { requireAuth, AuthRequest } from "../middleware/jwt";
import { PassThrough } from "stream";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// POST /api/releases
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    console.log("[UPLOAD] ===== Upload request received =====");
    console.log("[UPLOAD] Request headers:", {
      "content-type": req.get("content-type"),
      "content-length": req.get("content-length"),
      "user-agent": req.get("user-agent"),
    });
    console.log("[UPLOAD] Request body keys:", Object.keys(req.body));
    console.log("[UPLOAD] File received:", req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      fieldName: req.file.fieldname,
    } : "NO FILE");

    const file = req.file;
    const { type, version, release_notes } = req.body;

    console.log("[UPLOAD] Parsed data:", { type, version, hasReleaseNotes: !!release_notes });

    if (!file || !type || !version) {
      console.log("[UPLOAD] ERROR: Missing required fields", { hasFile: !!file, hasType: !!type, hasVersion: !!version });
      res.status(400).json({ error: "Missing required fields: file, type, version" });
      return;
    }

    if (!["msi", "vm"].includes(type)) {
      console.log("[UPLOAD] ERROR: Invalid type", type);
      res.status(400).json({ error: "Type must be 'msi' or 'vm'" });
      return;
    }

    console.log("[UPLOAD] Checking for duplicate version...");
    // Check for duplicate version
    const existing = await db
      .collection("releases")
      .where("type", "==", type)
      .where("version", "==", version)
      .get();

    if (!existing.empty) {
      console.log("[UPLOAD] ERROR: Duplicate version found");
      res.status(409).json({ error: `Version ${version} already exists for type ${type}` });
      return;
    }

    console.log("[UPLOAD] Computing file hash...");
    // Compute file hash
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    console.log("[UPLOAD] File hash:", `sha256:${hash.substring(0, 16)}...`);

    // Upload to GCS with progress tracking
    const fileName = `${type}/${type}-v${version}${getExtension(file.originalname)}`;
    console.log("[UPLOAD] Target GCS file:", fileName);

    const gcsFile = bucket.file(fileName);

    // Use resumable upload with progress callback
    const uploadStream = gcsFile.createWriteStream({
      contentType: file.mimetype,
      metadata: { version, type },
    });

    // Set up SSE headers for progress updates
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    console.log("[UPLOAD] Starting GCS upload...");
    const fileSize = file.buffer.length;
    let bytesUploaded = 0;

    uploadStream.on("progress", (progress) => {
      bytesUploaded = progress.bytesWritten;
      const percent = Math.round((bytesUploaded / fileSize) * 100);
      console.log(`[UPLOAD] Progress: ${percent}% (${bytesUploaded}/${fileSize} bytes)`);
      res.write(`data: ${JSON.stringify({ status: "progress", percent, bytesUploaded, fileSize })}\n\n`);
    });

    uploadStream.on("error", (err) => {
      console.error("[UPLOAD] GCS stream error:", err);
      res.write(`data: ${JSON.stringify({ status: "error", error: err.message })}\n\n`);
      res.end();
    });

    uploadStream.on("finish", async () => {
      console.log("[UPLOAD] GCS upload finished, saving to Firestore...");
      try {
        // Parse release notes
        let notes: string[] = [];
        if (release_notes) {
          try {
            notes = JSON.parse(release_notes);
          } catch {
            notes = [release_notes];
          }
        }

        // Write to Firestore — store GCS path instead of public URL
        const docRef = await db.collection("releases").add({
          type,
          version,
          gcs_path: fileName,
          file_hash: `sha256:${hash}`,
          file_size: file.size,
          release_notes: notes,
          created_at: new Date(),
        });
        console.log("[UPLOAD] Firestore document created:", docRef.id);

        // Delete old GCS files but keep Firestore docs for changelog history
        console.log("[UPLOAD] Cleaning up old releases...");
        const oldReleases = await db
          .collection("releases")
          .where("type", "==", type)
          .where("version", "!=", version)
          .get();

        console.log("[UPLOAD] Found", oldReleases.docs.length, "old releases to clean up");
        for (const doc of oldReleases.docs) {
          const data = doc.data();
          // Delete GCS file to save space
          if (data.gcs_path) {
            await bucket.file(data.gcs_path).delete().catch(() => {});
          }
          // Keep Firestore doc for changelog - just clear the gcs_path
          await doc.ref.update({ gcs_path: null });
        }

        console.log("[UPLOAD] ===== Upload complete =====");
        res.write(`data: ${JSON.stringify({
          status: "complete",
          id: docRef.id,
          releaseType: type,
          version,
          file_hash: `sha256:${hash}`,
          file_size: file.size,
        })}\n\n`);
        res.end();
      } catch (err: any) {
        console.error("[UPLOAD] Error during finish handler:", err);
        res.write(`data: ${JSON.stringify({ status: "error", error: err.message, stack: err.stack })}\n\n`);
        res.end();
      }
    });

    // Create a readable stream from the buffer and pipe to upload
    console.log("[UPLOAD] Creating buffer stream and piping to GCS...");
    const bufferStream = new PassThrough();
    bufferStream.end(file.buffer);
    bufferStream.pipe(uploadStream);
  }
);

// GET /api/releases/download?type=msi|vm — proxy download from GCS
router.get("/download", async (req: Request, res: Response) => {
  const type = req.query.type as string;

  if (!type || !["msi", "vm"].includes(type)) {
    res.status(400).json({ error: "Query param 'type' must be 'msi' or 'vm'" });
    return;
  }

  const snapshot = await db
    .collection("releases")
    .where("type", "==", type)
    .orderBy("created_at", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    res.status(404).json({ error: `No ${type} releases found` });
    return;
  }

  const data = snapshot.docs[0].data();
  // Support both new gcs_path and legacy download_url fields
  let gcsPath = data.gcs_path as string | undefined;
  if (!gcsPath && data.download_url) {
    // Extract GCS path from legacy URL: https://storage.googleapis.com/bucket/type/file
    const url = data.download_url as string;
    const bucketPrefix = `https://storage.googleapis.com/${bucket.name}/`;
    if (url.startsWith(bucketPrefix)) {
      gcsPath = url.substring(bucketPrefix.length);
    }
  }

  if (!gcsPath) {
    res.status(404).json({ error: "Download not available for this release" });
    return;
  }

  const gcsFile = bucket.file(gcsPath);
  const [exists] = await gcsFile.exists();

  if (!exists) {
    res.status(404).json({ error: "File not found in storage" });
    return;
  }

  const [metadata] = await gcsFile.getMetadata();
  const fileName = gcsPath.split("/").pop() || `${type}-v${data.version}`;

  res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  if (metadata.size) {
    res.setHeader("Content-Length", metadata.size.toString());
  }

  gcsFile.createReadStream().pipe(res);
});

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.substring(lastDot) : "";
}

export default router;
