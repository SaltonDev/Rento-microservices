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
            axios.get(`https://rento-property-microservice.onrender.com/api/properties/${lease.property_id}`)
          ]);

          const tenant = tenantRes.data;

          // Fetch unit data using unit_id from tenant
          let unit = null;
          if (tenant.unit_id) {
            try {
              const unitRes = await axios.get(`https://rento-units-microservice.onrender.com/api/units/unit/${tenant.unit_id}`);
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

//get expiring leases

// Microservice base URLs
const TENANT_SERVICE_URL = "https://rento-tenant-microservice.onrender.com/api/tenants/"; 
const PROPERTY_SERVICE_URL = "https://rento-property-microservice.onrender.com/api/properties/"; 
const UNIT_SERVICE_URL = "https://rento-units-microservice.onrender.com/api/units/unit/"; 

// Reusable fetch function
async function fetchMicroserviceData(url, id) {
  try {
    const res = await axios.get(`${url}${id}`);
    return res.data;
  } catch (err) {
    console.error(`Error fetching from ${url}${id}:`, err.message);
    return null;
  }
}

router.get('/status', async (req, res) => {
  try {
    const { data: leases, error } = await supabase.from('leases').select('*');
    if (error) return res.status(500).json({ error: error.message });

    const today = new Date();
    const expiringSoon = [];
    const expired = [];

    for (const lease of leases) {
      const leaseEndDate = new Date(lease.lease_end);
      const diffDays = Math.ceil((leaseEndDate - today) / (1000 * 60 * 60 * 24));

      // Fetch related data from microservices
      const tenant = await fetchMicroserviceData(TENANT_SERVICE_URL, lease.tenant_id);
      const property = await fetchMicroserviceData(PROPERTY_SERVICE_URL, lease.property_id);
      const unit = tenant?.unit_id
        ? await fetchMicroserviceData(UNIT_SERVICE_URL, tenant.unit_id)
        : null;

      const leaseData = {
        ...lease,
        tenant_name: tenant?.full_name || 'Unknown',
        tenant_email: tenant?.email || 'Unknown',
        property_name: property?.name || 'Unknown',
        property_address: property?.address || 'Unknown',
        unit_name: unit?.unit_name || 'N/A',
        unit_floor: unit?.floor || 'N/A',
      };

      if (diffDays < 0) {
        expired.push({
          ...leaseData,
          status: 'expired',
          days_past: Math.abs(diffDays),
        });
      } else if (diffDays <= 30) {
        expiringSoon.push({
          ...leaseData,
          status: 'expiring',
          remaining_days: diffDays,
        });
      }
    }

    res.json({ expired, expiringSoon });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error occurred.' });
  }
});

module.exports = router;
