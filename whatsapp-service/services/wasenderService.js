import { createWasender } from "wasenderapi";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.WASENDER_API_KEY;
const personalAccessToken = process.env.WASENDER_PERSONAL_ACCESS_TOKEN;

// Initialize Wasender SDK
const wasender = createWasender(apiKey, personalAccessToken);

// Send a single text message
export const sendSingleMessage = async ({ to, text }) => {
  try {
    const response = await wasender.send({
      messageType: "text",
      to,
      text
    });
    return { success: true, messageId: response.response.message?.key?.id };
  } catch (error) {
    return { success: false, error: error.apiMessage || error.message };
  }
};

// Send bulk messages
export const sendBulkMessages = async (messages, delay = 1000) => {
  const results = [];

  for (const msg of messages) {
    const result = await sendSingleMessage(msg);
    results.push({ ...msg, ...result });

    // Delay to avoid rate limit
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return results;
};
