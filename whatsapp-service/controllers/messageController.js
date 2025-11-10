import { sendSingleMessage, sendBulkMessages } from "../services/wasenderService.js";

// Single message
// Single message
export const sendSingle = async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      status: "error",
      message: "'to' and 'message' are required"
    });
  }

  try {
    const result = await sendSingleMessage({ to, text: message });

    if (result.success) {
      return res.status(200).json({
        status: "success",
        message: "Message sent ✅",
        messageId: result.messageId
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Failed to send message",
      error: result.error
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Unexpected error"
    });
  }
};

// Bulk messages
export const sendBulk = async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "'messages' array is required"
    });
  }

  try {
    const results = await sendBulkMessages(
      messages.map((m) => ({ to: m.to, text: m.message }))
    );

    return res.status(200).json({
      status: "success",
      message: "Bulk messages processed ✅",
      results
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Failed to process bulk messages"
    });
  }
};

