require("dotenv").config();
const nodemailler = require("nodemailer");
const express = require("express");
const router = express.Router();
const transporter = nodemailler.createTransport({
  host: process.env.GMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

router.post("/send-reset-password", async (req, res) => {
  const { email, token } = req.body;
  const resetLink = `https://yourfrontend.com/reset-password?token=${token}`;
  
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: "Rento - Rest Your Password",
    text: resetLink,
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).json({ error: error });
    } else {
      return res.status(201).json({ message: "Email sent", info });
    }
  });

 
});

module.exports = router;
