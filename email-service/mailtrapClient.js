const { MailtrapClient } = require("mailtrap");

const client = new MailtrapClient({
  token: process.env.MAILTRAP_TOKEN,
});

module.exports = client

