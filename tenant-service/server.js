const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const tenantsRouter = require('./routes/tenants');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());
app.use('/api/tenants', tenantsRouter);

app.listen(PORT, () => {
  console.log(`Tenant Service running on port ${PORT}`);
});
