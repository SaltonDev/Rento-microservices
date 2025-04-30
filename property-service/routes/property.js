const express = require('express')
const supabase = require('../supabaseClient')
const router = express.Router()

// Create a property
router.post('/', async (req, res) => {
  const { property_name, address, total_units } = req.body

  const { data, error } = await supabase
    .from('properties')
    .insert([{ property_name, address, total_units }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// Get all properties
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('properties')
    .select('*')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Update a property
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { property_name, address, total_units } = req.body

  const { data, error } = await supabase
    .from('properties')
    .update({ property_name, address, total_units })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Delete a property
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send() // No Content
})

module.exports = router
