const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Create tenant
router.post("/", async (req, res) => {
  const { full_name, email, phone_number, property_id, unit_id, monthly_rent } =
    req.body;

  const { data, error } = await supabase
    .from("tenants")
    .insert([
      { full_name, email, phone_number, property_id, unit_id, monthly_rent },
    ])
    .select()
    .single();

  if (error) return res.status(400).json({ error });

  res.json(data);
});

// Get all tenants
router.get("/", async (_, res) => {
  const { data, error } = await supabase.from("tenants").select("*");
  if (error) return res.status(500).json({ error });
  res.json(data);
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
