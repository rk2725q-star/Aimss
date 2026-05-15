import clientPromise from "./_lib/mongodb.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const dbName = process.env.MONGODB_DB;
    if (!dbName) {
      return res.status(500).json({ error: "Missing MONGODB_DB environment variable" });
    }

    const client = await clientPromise;
    const db = client.db(dbName);

    const user = await db.collection("users").findOne({
      email: String(email).trim().toLowerCase(),
      password: String(password)
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: String(user._id),
        email: user.email
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error" });
  }
}
