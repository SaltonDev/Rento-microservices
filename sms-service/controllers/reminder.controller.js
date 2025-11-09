const AfricasTalking = require('africastalking')(credentials);
const personalize = require('../utils/personalizeTemplate');

const credentials = {
    apiKey: 'YOUR_API_KEY',         // use your sandbox app API key for development in the test environment
    username: 'YOUR_USERNAME',      // use 'sandbox' for development in the test environment
};

const sendReminders = async (req, res) => {
  const { messageTemplate, tenants } = req.body;

  if (!messageTemplate || !Array.isArray(tenants) || tenants.length === 0) {
    return res.status(400).json({ error: 'messageTemplate and tenants[] are required' });
  }

  const results = await Promise.allSettled(
    tenants.map(async (tenant) => {
      const text = personalize(messageTemplate, tenant);
      const payload = {
        to: tenant.phone,
        text,        
      };

      try {
        const response = await pindoClient.post('/sms/', payload);
        return { tenant: tenant.name, status: 'sent', data: response.data };
      } catch (err) {
        return {
          tenant: tenant.name,
          status: 'failed',
          error: err.response?.data || err.message,
        };
      }
    })
  );

  res.status(200).json({
    message: 'Reminders processed',
    results,
  });
};

module.exports = { sendReminders };
