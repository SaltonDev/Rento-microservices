require('dotenv').config();
const express = require('express');
const reminderRoutes = require('./routes/reminder.route');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Routes
app.use('/api/reminders', reminderRoutes);

// Root endpoint (optional)
app.get('/', (req, res) => {
  res.send('📨 SMS Reminder Microservice is running');
});

// Start server
const PORT = process.env.PORT || 3008;
app.listen(PORT, () => {
  console.log(`🚀 Server is live on http://localhost:${PORT}`);
});
