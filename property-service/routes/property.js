const express = require('express')
const supabase = require('../supabaseClient')
const router = express.Router()

// Create a property
router.post('/', async (req, res) => {
  const { name, address, total_units } = req.body

  const { data, error } = await supabase
    .from('properties')
    .insert([{ name, address, total_units }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
});

//fetch property details by property id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single(); // returns a single object instead of an array

  if (error) {
    return res.status(404).json({ error: 'Property not found' });
  }

  res.json(data);
});

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
  const { name, address, total_units } = req.body

  const { data, error } = await supabase
    .from('properties')
    .update({ name, address, total_units })
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
