const express = require("express");
const router = express.Router();
const axios = require("axios");
const supabase = require("../supabaseClient");

// Create tenant
router.post("/", async (req, res) => {
  const { full_name, email, phone_number, property_id, unit_id, monthly_rent } =
    req.body;

    //add tenant
  const { data, error } = await supabase
    .from("tenants")
    .insert([
      { full_name, email, phone_number, property_id, unit_id, monthly_rent },
    ])
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  
  // Update unit status to "occupied"
  try {
    await axios.put(
      `https://rento-units-microservice.onrender.com/api/units/${unit_id}`,
      { status: "occupied" }
    );
  } catch (unitError) {
    console.error("Failed to update unit status:", unitError.message);
    // Optional: return a warning along with tenant data
    return res.status(207).json({
      warning: "Tenant created, but failed to update unit status",
      tenant: data,
    });
  }


  res.json(data);
});

// Get all tenants
router.get("/", async (_, res) => {
try {
    const { data: tenants, error } = await supabase.from("tenants").select("*");
    if (error) return res.status(500).json({ error });

    const tenantsWithDetails = await Promise.all(
      tenants.map(async (tenant) => {
        let unitName = null;
        let propertyName = null;

        try {
          // Step 1: Fetch unit details
          const unitRes = await axios.get(`https://rento-units-microservice.onrender.com/api/units/unit/${tenant.unit_id}`);
          const unit = unitRes.data;
          unitName = unit.unit_name;
          
          // Step 2: Fetch property details using property_id from unit
          const propertyRes = await axios.get(`https://rento-property-microservice.onrender.com/api/properties/${unit.property_id}`);
          const property = propertyRes.data;
          propertyName = property.name;

        } catch (err) {
          console.error(`Error fetching unit or property for tenant ${tenant.id}:`, err.message);
        }

        return {
          "id":tenant.id,
          "tenant":tenant.full_name,
          "email":tenant.email,
          "tel":tenant.phone_number,
          "rent":tenant.monthly_rent,
          "property":propertyName,
          "unit":unitName,         
        };
      })
    );

    res.json(tenantsWithDetails);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//Stats
router.get("/stats", async (_, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    // Count tenants this month
    const { count: thisMonthCount, error: thisMonthError } = await supabase
      .from("tenants")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfThisMonth);

      

    if (thisMonthError) return res.status(500).json({ error: thisMonthError.message });

    // Count tenants last month
    const { count: lastMonthCount, error: lastMonthError } = await supabase
      .from("tenants")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfLastMonth)
      .lte("created_at", endOfLastMonth);

    if (lastMonthError) return res.status(500).json({ error: lastMonthError.message });

    // Calculate percent change
    const percentChange = lastMonthCount === 0
      ? 100
      : Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100);

    res.json({
      totalTenants: {
        count: thisMonthCount,
        percentChange,
      },
    });
  } catch (err) {
    console.error("Error fetching tenants summary:", err.message);
    res.status(500).json({ error: "Unexpected error occurred." });
  }
});

// get tenant by tenant id
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single(); // Ensures only one record is returned

  if (error) return res.status(500).json({ error });
  if (!data) return res.status(404).json({ error: "Tenant not found" });

  res.json(data);
});

// Update tenant
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { full_name, email, phone_number, property_id, unit_id, monthly_rent } =
    req.body;

  const { data, error } = await supabase
    .from("tenants")
    .update({
      full_name,
      email,
      phone_number,
      property_id,
      unit_id,
      monthly_rent,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Delete tenant
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) return res.status(400).json({ error });
  res.status(204).send();
});

module.exports = router;
