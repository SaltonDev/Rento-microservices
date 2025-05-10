const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const axios = require('axios');

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
  try {
    // Step 1: Fetch all leases
    const { data: leases, error } = await supabase.from('leases').select('*');
    if (error) return res.status(500).json({ error: error.message });

    // Step 2: Enrich each lease
    const enrichedLeases = await Promise.all(
      leases.map(async lease => {
        try {
          // Fetch tenant and property in parallel
          const [tenantRes, propertyRes] = await Promise.all([
            axios.get(`https://rento-tenant-microservice.onrender.com/api/tenants/${lease.tenant_id}`),
            axios.get(`http://localhost:3002/api/properties/${lease.property_id}`)
          ]);

          const tenant = tenantRes.data;

          // Fetch unit data using unit_id from tenant
          let unit = null;
          if (tenant.unit_id) {
            try {
              const unitRes = await axios.get(`http://localhost:3003/api/units/unit/${tenant.unit_id}`);
              unit = unitRes.data;
            } catch (unitErr) {
              console.error('Error fetching unit data:', unitErr.message);
            }
          }

          return {
            ...lease,
            tenant: {
              ...tenant,
              unit: unit // attach unit data inside tenant
            },
            property: propertyRes.data
          };
        } catch (err) {
          console.error('Error enriching lease:', err.message);
          return {
            ...lease,
            tenant: null,
            property: null,
            error: 'Failed to fetch related data'
          };
        }
      })
    );

    res.json(enrichedLeases);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
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
