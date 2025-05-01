const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Create tenant
router.post('/', async (req, res) => {
  const { full_name, email, phone_number, property_id, unit_id, monthly_rent } = req.body;

  const { data, error } = await supabase
    .from('tenants')
    .insert([{ full_name, email, phone_number, property_id, unit_id, monthly_rent }])
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Get all tenants
router.get('/', async (_, res) => {
  const { data, error } = await supabase.from('tenants').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Update tenant
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { full_name, email, phone_number, property_id, unit_id, monthly_rent } = req.body;

  const { data, error } = await supabase
    .from('tenants')
    .update({ full_name, email, phone_number, property_id, unit_id, monthly_rent })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Delete tenant
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('tenants').delete().eq('id', id);
  if (error) return res.status(400).json({ error });
  res.status(204).send();
});

module.exports = router;
