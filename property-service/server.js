require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const propertyRoutes = require('./routes/property')
app.use('/api/properties', propertyRoutes)

const PORT = process.env.PORT || 3002
app.listen(PORT, () => console.log(`Property service running on port ${PORT}`))
