// Setup script to create the first admin user
// Run with: tsx scripts/setup-admin.ts <email> <password>

import dotenv from "dotenv";
dotenv.config();

import { admin } from "../src/config";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: tsx scripts/setup-admin.ts <email> <password>");
  process.exit(1);
}

function hashPassword(password: string): string {
  return Buffer.from(password).toString("base64");
}

async function setupAdmin() {
  const { db } = await import("../src/config");

  try {
    // Check if any admins exist
    const adminsSnapshot = await db.collection("admins").limit(1).get();

    if (!adminsSnapshot.empty) {
      console.error("Error: An admin user already exists. Setup can only be run once.");
      process.exit(1);
    }

    // Create admin user
    await db.collection("admins").add({
      email,
      password_hash: hashPassword(password),
      created_at: new Date(),
    });

    console.log(`✅ Admin user created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`\nYou can now login at: http://localhost:3000/admin/login`);
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
}

setupAdmin();
