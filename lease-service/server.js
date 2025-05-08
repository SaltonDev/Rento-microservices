const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const leaseRoutes = require('./routes/leases');
app.use('/api/leases', leaseRoutes);

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Lease service running on port ${PORT}`);
});
