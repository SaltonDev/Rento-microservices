const express = require("express");
const bcrypt = require("bcrypt");
const { signToken } = require("../utils/jwt");
const supabase = require("../supabaseClient");
const router = express.Router();
const nodemailer = require("nodemailer");
const axios = require('axios');
// Register
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

// Login
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
router.post("/forget-password", async (req, res) => {
  const { email } = req.body;
  //see if user exists
  const { user, error } = await getUserByEmail(email);

  if (error) {
    res.status(400).json(error); // → "No user found with that email" or other error
  } else {
    //send reset link
    const emailResponse = await axios.post(
      "http://localhost:3007/send-mail",
      {
        email,
      }
    );
        if (emailResponse.status === 200) {
      res.json({ message: 'Reset email sent' });
    } else {
      res.status(500).json({ error: 'Failed to send reset email' });
    }
  }
});

module.exports = router;
