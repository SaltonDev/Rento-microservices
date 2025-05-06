const express = require('express')
const bcrypt = require('bcrypt')
const { signToken } = require('../utils/jwt')
const supabase = require('../supabaseClient')
const router = express.Router()

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (existingUser) return res.status(400).json({ error: 'User already exists' })

  const hashedPassword = await bcrypt.hash(password, 10)

  const { data, error } = await supabase
    .from('users')
    .insert([{ email, password: hashedPassword }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const token = signToken(data)
  res.json({ user: { id: data.id, email: data.email }, token })
})

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ success:false, error: 'Invalid credentials' })

  const token = signToken(user)
  res.json({ user: { id: user.id, email: user.email,name:user.name }, token , success:true})
})

module.exports = router
