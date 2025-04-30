const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const unitsRouter = require('./routes/units');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());
app.use('/api/units', unitsRouter);

app.listen(PORT, () => {
  console.log(`Unit Service running on port ${PORT}`);
});
