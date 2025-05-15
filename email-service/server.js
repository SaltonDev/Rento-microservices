require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const email = require('./routes/email')
app.use('/api/email', email);

const PORT = process.env.PORT || 3007
app.listen(PORT, () => console.log(`Email service running on port ${PORT}`))
