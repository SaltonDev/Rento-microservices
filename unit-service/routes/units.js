const express = require("express");
const router = express.Router();
const supabase = require("../supabaceClient.js");

// Create unit
router.post("/", async (req, res) => {
  const { unit_name, floor, property_id } = req.body;
  const status = "vacant";
  // Validation: Ensure all fields are provided
  if (!unit_name || !floor || !property_id) {
    return res.status(400).json({ error: "All fields (unit_name, floor, property_id) are required." });
  }
 
  // Insert the new unit into the database
  const { data, error } = await supabase
    .from("units")
    .insert([{ unit_name, floor, property_id ,status}])
    .select()
    .single();

  // Handle any database errors
  if (error) {
    console.error("Error creating unit:", error); // Log the error for debugging
    return res.status(500).json({ error: "Failed to create unit. Please try again later." });
  }

  // Return the created unit as a response
  res.status(201).json(data); // 201 is the appropriate status code for created resources
});

// Get all units
router.get("/", async (_, res) => {
  const { data, error } = await supabase.from("units").select("*");
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Update unit
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { unit_name, floor, property_id,status } = req.body;
  const { data, error } = await supabase
    .from("units")
    .update({ unit_name, floor, property_id,status })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Delete unit
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) return res.status(400).json({ error });
  res.status(204).send();
});
// 1. Get all vacant units
router.get("/vacant", async (req, res) => {
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("status", "vacant");

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch vacant units" });
  }

  res.status(200).json(data);
});

// 2. Get vacant units by property ID
router.get('/vacant/:id',async(req,res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("property_id", id)
    .eq("status", "vacant");

  if (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to fetch vacant units for property" });
  }

  res.status(200).json(data);
});


// 3. Get all units by property ID
router.get('/:id',async(req,res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("property_id", id);

  if (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to fetch units for property" });
  }

  res.status(200).json(data);
});
//4 .get getall unit details by unit ID
router.get('/unit/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("id", id)
    .single(); // ensures only one unit is returned

  if (error) {
    console.error(error);
    return res.status(404).json({ error: "Unit not found" });
  }

  res.status(200).json(data);
});

module.exports = router;
