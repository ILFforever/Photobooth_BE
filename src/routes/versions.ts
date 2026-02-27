import { Router, Request, Response } from "express";
import { db } from "../config";

const router = Router();

// GET /api/versions/latest?type=msi|vm
router.get("/latest", async (req: Request, res: Response) => {
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

  const doc = snapshot.docs[0];
  const data = doc.data();
  // Strip internal fields — don't expose GCS paths or URLs
  const { gcs_path, download_url, ...safeData } = data;
  res.json({ id: doc.id, ...safeData, has_download: !!(gcs_path || download_url) });
});

// GET /api/versions?type=msi|vm&limit=10&offset=0
router.get("/", async (req: Request, res: Response) => {
  const type = req.query.type as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  let query = db
    .collection("releases")
    .orderBy("created_at", "desc");

  if (type && ["msi", "vm"].includes(type)) {
    query = query.where("type", "==", type);
  }

  const snapshot = await query.offset(offset).limit(limit).get();

  const releases = snapshot.docs.map((doc) => {
    const { gcs_path, download_url, ...safeData } = doc.data();
    return { id: doc.id, ...safeData, has_download: !!(gcs_path || download_url) };
  });

  res.json({ releases, count: releases.length });
});

// GET /api/versions/changelog?type=msi|vm
router.get("/changelog", async (req: Request, res: Response) => {
  const type = req.query.type as string;

  if (!type || !["msi", "vm"].includes(type)) {
    res.status(400).json({ error: "Query param 'type' must be 'msi' or 'vm'" });
    return;
  }

  const snapshot = await db
    .collection("releases")
    .where("type", "==", type)
    .orderBy("created_at", "desc")
    .get();

  const changelog = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      version: data.version,
      release_notes: data.release_notes || [],
      created_at: data.created_at,
    };
  });

  res.json({ type, changelog });
});

export default router;
