const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Create a lease
router.post('/', async (req, res) => {
  const {
    tenant_id,
    property_id,
    lease_start,
    lease_end,
    due_date,
    monthly_rent,
    status,
    billing_mode
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('leases')
      .insert([
        {
          tenant_id,
          property_id,
          lease_start,
          lease_end,
          due_date,
          monthly_rent,
          status,
          billing_mode
        }
      ])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create lease.' });
  }
});

// Get all leases
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('leases').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get lease by tenant ID
router.get('/tenant/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();
  if (error) return res.status(404).json({ error: 'Lease not found' });
  res.json(data);
});

// Update a lease
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const { data, error } = await supabase
    .from('leases')
    .update(updateData)
    .eq('id', id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// Delete a lease
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('leases').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
