import express from "express";
import dotenv from "dotenv";
import messageRoutes from "./routes/messageRoutes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

dotenv.config();
const app = express();

app.use(express.json());

// Routes
app.use("/api/messages", messageRoutes);

// Health check
app.get("/", (_req, res) => res.json({ status: "success", message: "Reminder Service Running ✅" }));

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Reminder microservice running on port ${PORT}`));
