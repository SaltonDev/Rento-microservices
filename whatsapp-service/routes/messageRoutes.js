import express from "express";
import { sendSingle, sendBulk } from "../controllers/messageController.js";

const router = express.Router();

// POST /api/messages/send-single
router.post("/send-single", sendSingle);

// POST /api/messages/send-bulk
router.post("/send-bulk", sendBulk);

export default router;
