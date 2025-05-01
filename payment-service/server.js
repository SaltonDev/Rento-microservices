const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const paymentsRouter = require('./routes/payments');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use('/api/payments', paymentsRouter);

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});
