const axios = require('axios');

const pindoClient = axios.create({
  baseURL: 'https://api.pindo.io/v1',
  headers: {
    Authorization: `Bearer ${process.env.PINDO_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

module.exports = pindoClient;
