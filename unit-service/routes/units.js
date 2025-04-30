const express = require('express');
const router = express.Router();
const supabase = require('../supabaceClient.js');

// Create unit
router.post('/', async (req, res) => {
  const { unit_name, floor, property_id } = req.body;
  const { data, error } = await supabase
    .from('units')
    .insert([{ unit_name, floor, property_id }])
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Get all units
router.get('/', async (_, res) => {
  const { data, error } = await supabase.from('units').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Update unit
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { unit_name, floor, property_id } = req.body;
  const { data, error } = await supabase
    .from('units')
    .update({ unit_name, floor, property_id })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Delete unit
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('units').delete().eq('id', id);
  if (error) return res.status(400).json({ error });
  res.status(204).send();
});

module.exports = router;
