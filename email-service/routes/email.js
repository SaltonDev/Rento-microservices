require("dotenv").config();
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabaseClient"); // Make sure this is correct

router.post("/send-reset-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, message: "Reset email sent via Supabase",data: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || "An error occurred while sending the reset email" });
  }
});

module.exports = router;
