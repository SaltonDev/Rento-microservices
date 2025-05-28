const express = require("express");
const bcrypt = require("bcrypt");
const saltRounds =10;
const { nanoid } = require('nanoid');
const { signToken } = require("../utils/jwt");
const supabase = require("../supabaseClient");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
//Register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  // Check if user exists
  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existingUser)
    return res.status(400).json({ error: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("users")
    .insert([{ email, password: hashedPassword }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const token = signToken(data);
  res.json({ user: { id: data.id, email: data.email }, token });
});
//Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user || !(await bcrypt.compare(password, user.password)))
    return res
      .status(401)
      .json({ success: false, error: "Invalid credentials" });

  const token = signToken(user);
  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
    success: true,
  });
});
//get user by email
const getUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return { error: "No user found with that email" };
    }
    // Other errors
    return { error: error.message };
  }

  return { user: data };
};
//generate token
function generateResetToken() {
  return nanoid(64); // Generates a 64-character secure token
}
//forget-password link
router.post("/forget-password", async (req, res) => {
  const { email } = req.body;

  // Step 1: Check if user exists
  const { user, error } = await getUserByEmail(email);

  if (error) {
    return res.status(400).json({ error });
  }

  const token = generateResetToken();
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  // Optional: Hash token for extra security before saving
  const hashedToken = await bcrypt.hash(token, saltRounds);

  // Step 2: Insert token + expiry into password_reset_tokens
  const { error: insertError } = await supabase
    .from("password_reset_tokens")
    .insert([
      {
        user_id: user.id, // assuming auth.users UUID
        token: hashedToken,
        expires_at: expires.toISOString(),
      },
    ]);

  if (insertError) {
    return res.status(500).json({ error: "Failed to store reset token" });
  }

  // Step 3: Send email with the original (non-hashed) token
  try {
    const emailResponse = await axios.post(
      "https://email-service-agj3.onrender.com/api/email/send-reset-password",
      {
        "email":email,
        "token":token, // plain token
      }
    );

    if (emailResponse.data.success) {
      return res
        .status(201)
        .json({ message: "Reset password link sent to your email" });
    } else {
      return res.status(500).json({ error: "Failed to send reset email" });
    }
  } catch (err) {
    return res.status(500).json({ error: "Error sending reset email" });
  }
});
//check valid reset token
router.post("/check-reset-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token is required" });

  // Fetch all unused tokens
  const { data: tokens, error } = await supabase
    .from("password_reset_tokens")
    .select("*")
    .eq("used", false);

  if (error) return res.status(500).json({ error: "Database error" });

  const now = new Date();

  for (const record of tokens) {
    // Check if token has expired
    const expiresAt = new Date(record.expires_at);
    if (expiresAt < now) continue; // Skip expired token

    // Check token match
    const isMatch = await bcrypt.compare(token, record.token);
    if (isMatch) {
      return res.status(200).json({
        success:true,
        message: "Token is valid",
        user_id: record.user_id,
        token_id: record.id // useful for marking token as used later
      });
    }
  }

  return res.status(400).json({ success:false,error: "Invalid or expired token" });
});
//update password
router.put("/update-password", async (req, res) => {
  const { id, newPassword } = req.body;

  if (!id || !newPassword) {
    return res.status(400).json({ error: "Email and new password are required" });
  }

  // Check if the user exists
  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update the password in the database
  const { error: updateError } = await supabase
    .from("users")
    .update({ password: hashedPassword })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ message: "Password updated successfully" });
});
//update profile
router.put("/update-profile", async (req, res) => {
  const { id,email, name, password } = req.body;

  const updateFields = {};

  if (email) updateFields.email = email;
  if (name) updateFields.name = name;
  if (password) updateFields.password = await bcrypt.hash(password, 10);

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("users")
    .update(updateFields)
    .eq("id",id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ user: { id: data.id, email: data.email, name: data.name } });
});
module.exports = router;
