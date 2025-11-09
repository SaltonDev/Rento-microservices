const express = require('express');
const router = express.Router();
const { sendReminders } = require('../controllers/reminder.controller');

router.post('/send', sendReminders);

module.exports = router;
