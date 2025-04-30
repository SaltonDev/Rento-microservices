require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const authRoutes = require('./routes/auth')
app.use('/api/auth', authRoutes)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`))
