const express = require("express");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const { nanoid } = require("nanoid");
const { signToken } = require("../utils/jwt");
const supabase = require("../supabaseClient");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
//Register
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  const { data: usersList, error: userListError } =
    await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

  if (userListError) {
    return res
      .status(500)
      .json({ success: "false 1", message: userListError.message });
  }
  
  const user = usersList.users.find((u) => u.email === email);

  if (user)
    return res
      .status(400)
      .json({ success: "false 2", message: "User already exists" });

  // Create new user
  const { data, error: newUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name || "" },
  });

  if (newUserError)
    return res.status(500).json({ success: "false 3", error: error.message });

  res.status(200).json({ success: true }, user);
});
//Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: User, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
   console.log(User);
  if (error) {
    return res.status(401).json({ success: "false", message: error.message });
  }

  const { session, user } = User;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || "",
    },
    token: session.access_token,
    success: true,
  });
});
//get user by email helper function
const getUserByEmail = async (email) => {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (error) {
    return { user: null, error: "Failed to fetch users" };
  }

  const user = data.users.find((u) => u.email === email);
  if (user) {
    return { user, error: null };
  } else {
    return { user: null, error: "User not found" };
  }
};

//generate token
function generateResetToken() {
  return nanoid(64); // Generates a 64-character secure token
}
//forget-password link
router.post("/forget-password", async (req, res) => {
  const { email } = req.body;

  // ✅ Step 1: Use local helper to find user
  const { user, error } = await getUserByEmail(email);

  if (error) {
    return res.status(error === "User not found" ? 404 : 500).json({ error });
  }

  try {
    // ✅ Step 2: Send token to email service
    const emailResponse = await axios.post(
      "https://email-service-agj3.onrender.com/api/email/send-reset-password",
      {
        email,
      }
    );

    if (emailResponse.data.success) {
      return res
        .status(201)
        .json({ message: emailResponse.data.message });
    } else {
      return res.status(500).json({ error: emailResponse.data.error || "Failed to send reset email" });
    }
  } catch (err) {
    console.error("Forget password error:", err);
    return res.status(500).json({ error: "Failed to process request" });
  }
});
//check valid reset token
router.post("/check-reset-token", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    // Fetch all unused and unexpired tokens
    const { data: tokens, error } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("used", false);

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    const now = new Date();

    for (const record of tokens) {
      const expiresAt = new Date(record.expires_at);
      if (expiresAt < now) continue; // Skip expired

      const isMatch = await bcrypt.compare(token, record.token);
      if (isMatch) {
        return res.status(200).json({
          success: true,
          message: "Token is valid",
          user_id: record.user_id,
          token_id: record.id,
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: "Invalid or expired token",
    });
  } catch (err) {
    console.error("Token check error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

//update password
router.put("/update-password", async (req, res) => {
  const {  newPassword } = req.body;

  if ( !newPassword) {
    return res
      .status(400)
      .json({ error: "Email and new password are required" });
  }

  const {data,error} = await supabase.auth.updateUser({ password: newPassword});
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ message: "Password updated successfully" });
});
//update profile
router.put("/update-profile", async (req, res) => {
  const { id, email, name, password } = req.body;

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
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ user: { id: data.id, email: data.email, name: data.name } });
});
module.exports = router;
