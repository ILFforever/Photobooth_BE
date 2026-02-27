import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "../config";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const JWT_EXPIRES_IN = "24h";

// Admin credentials stored in Firestore
interface AdminUser {
  email: string;
  password_hash: string;
}

function hashPassword(password: string): string {
  // Simple hash for demo - use bcrypt in production
  return Buffer.from(password).toString("base64");
}

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    // Get admin user from Firestore
    const adminsSnapshot = await db
      .collection("admins")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (adminsSnapshot.empty) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const adminDoc = adminsSnapshot.docs[0];
    const admin = adminDoc.data();

    // Verify password
    if (admin.password_hash !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Generate JWT
    const token = jwt.sign(
      { email: admin.email, id: adminDoc.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, email: admin.email });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/setup (only if no admins exist)
router.post("/setup", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    // Check if any admins exist
    const adminsSnapshot = await db.collection("admins").limit(1).get();

    if (!adminsSnapshot.empty) {
      res.status(403).json({ error: "Admin already exists" });
      return;
    }

    // Create first admin
    await db.collection("admins").add({
      email,
      password_hash: hashPassword(password),
      created_at: new Date(),
    });

    res.json({ message: "Admin created successfully" });
  } catch (error) {
    console.error("Setup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
