const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const axios = require("axios");

// Microservice endpoints
const TENANT_SERVICE_URL = "https://rento-tenant-microservice.onrender.com/api/tenants/";
const PROPERTY_SERVICE_URL = "https://rento-property-microservice.onrender.com/api/properties/";

// Reusable fetch helper
async function fetchMicroserviceData(baseUrl, id) {
  try {
    const response = await axios.get(`${baseUrl}${id}`);
    return response.data;
  } catch (err) {
    console.error(`Error fetching ${baseUrl}${id}:`, err.message);
    return null;
  }
}

// ==================== RENT PAYMENT ALGORITHM ====================

// Ensure rent periods exist for current and previous months
async function ensureRentPeriodsExist(lease, paymentDate) {
  try {
    const periodsToCreate = [];
    const paymentDateObj = new Date(paymentDate);
    const today = new Date();
    
    // Start from lease start or 6 months before current period (whichever is later)
    let startDate = new Date(lease.lease_start);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    if (sixMonthsAgo > startDate) {
      startDate = sixMonthsAgo;
    }

    let currentDate = new Date(startDate);
    const endDate = new Date(Math.min(
      new Date(lease.lease_end).getTime(),
      today.getTime()
    ));

    // Check each month and create period if it doesn't exist
    while (currentDate <= endDate) {
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      // Check if period already exists
      const { data: existingPeriod } = await supabase
        .from("rent_periods")
        .select("id")
        .eq("lease_id", lease.id)
        .eq("month", month)
        .eq("year", year)
        .single();

      if (!existingPeriod) {
        periodsToCreate.push({
          lease_id: lease.id,
          tenant_id: lease.tenant_id,
          month: month,
          year: year,
          due_amount: lease.monthly_rent,
          paid_amount: 0,
          balance: lease.monthly_rent,
          status: 'unpaid',
          due_date: new Date(year, month - 1, lease.due_date || 1)
        });
      }

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Create missing periods
    if (periodsToCreate.length > 0) {
      const { error } = await supabase
        .from("rent_periods")
        .insert(periodsToCreate);

      if (error) console.error("Error creating rent periods:", error.message);
    }
  } catch (error) {
    console.error("Error ensuring rent periods exist:", error.message);
  }
}

// Get unpaid rent periods (oldest first)
async function getUnpaidRentPeriods(tenantId, lease) {
  try {
    const { data: periods, error } = await supabase
      .from("rent_periods")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("lease_id", lease.id)
      .in("status", ["unpaid", "partial"])
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        console.log('rent_periods table does not exist yet');
        return [];
      }
      throw error;
    }
    
    return periods || [];
  } catch (error) {
    console.error("Error getting unpaid periods:", error.message);
    return [];
  }
}

// Update rent period record
async function updateRentPeriod(periodId, updates) {
  try {
    const { error } = await supabase
      .from("rent_periods")
      .update(updates)
      .eq("id", periodId);

    if (error) throw error;
  } catch (error) {
    console.error("Error updating rent period:", error.message);
  }
}

// Main payment processing algorithm
async function processRentPayment(tenantId, amountPaid, paymentDate) {
  try {
    // 1. Get tenant's lease information
    const { data: lease, error: leaseError } = await supabase
      .from("leases")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (leaseError) {
      console.error("Lease not found:", leaseError.message);
      return { success: false, error: "Lease not found" };
    }

    // 2. Ensure rent periods exist
    await ensureRentPeriodsExist(lease, paymentDate);

    // 3. Get unpaid periods (oldest first)
    const unpaidPeriods = await getUnpaidRentPeriods(tenantId, lease);
    
    let remainingAmount = amountPaid;
    const appliedPayments = [];

    // 4. Apply payment to oldest outstanding balances first (FIFO)
    for (const period of unpaidPeriods) {
      if (remainingAmount <= 0) break;

      const outstandingBalance = period.balance;
      const amountToApply = Math.min(remainingAmount, outstandingBalance);

      if (amountToApply > 0) {
        const newBalance = outstandingBalance - amountToApply;
        const newStatus = newBalance === 0 ? 'paid' : 'partial';

        await updateRentPeriod(period.id, {
          paid_amount: period.paid_amount + amountToApply,
          balance: newBalance,
          status: newStatus,
          last_payment_date: paymentDate
        });

        remainingAmount -= amountToApply;

        appliedPayments.push({
          period: `${period.month}/${period.year}`,
          amount_applied: amountToApply,
          previous_balance: outstandingBalance,
          new_balance: newBalance,
          status: newStatus
        });
      }
    }

    // 5. Log the result (can be used for debugging)
    console.log(`Payment processed: ${amountPaid} for tenant ${tenantId}`);
    console.log(`Applied to:`, appliedPayments);
    console.log(`Remaining: ${remainingAmount}`);

    return {
      success: true,
      applied_payments: appliedPayments,
      remaining_amount: remainingAmount,
      monthly_rent: lease.monthly_rent
    };

  } catch (error) {
    console.error("Payment processing error:", error);
    return { success: false, error: error.message };
  }
}

// ==================== EXISTING ROUTES (UNCHANGED) ====================

// Create Payment Endpoint (Enhanced with algorithm)
router.post("/", async (req, res) => {
  const { tenant_id, amount, method, payment_date, status } = req.body;

  try {
    // 1. Insert payment into the database (ORIGINAL BEHAVIOR)
    const { data, error } = await supabase
      .from("payments")
      .insert([{ tenant_id, amount, method, payment_date, status }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // 2. Process the payment with our algorithm (runs in background)
    processRentPayment(tenant_id, amount, payment_date || new Date())
      .then(result => {
        console.log("Background payment processing completed:", result);
      })
      .catch(err => {
        console.error("Background payment processing failed:", err);
      });

    // 3. RETURN ORIGINAL RESPONSE FORMAT - DON'T CHANGE FRONTEND
    res.json(data[0]);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lease data or create payment" });
  }
});

// Route to fetch all payments
router.get("/", async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*");
    if (error) return res.status(500).json({ error: error.message });

    const result = [];

    for (const payment of payments) {
      const tenant = await fetchMicroserviceData(TENANT_SERVICE_URL, payment.tenant_id);
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      const property = propertyId
        ? await fetchMicroserviceData(PROPERTY_SERVICE_URL, propertyId)
        : null;
      const propertyName = property?.name || "Unknown";

      result.push({
        id: payment.id,
        tenant: tenantName,
        property: propertyName,
        method: payment.method,
        amount: payment.amount,
        status: payment.status,
        payment_date: payment.payment_date,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Error fetching tenants", err.message);
    res.status(500).json({ error: "Unexpected error occurred." });
  }
});

//fetch recent payments
router.get("/recent", async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: error.message });

    const result = [];

    for (const payment of payments) {
      const tenant = await fetchMicroserviceData(TENANT_SERVICE_URL, payment.tenant_id);
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      const property = propertyId
        ? await fetchMicroserviceData(PROPERTY_SERVICE_URL, propertyId)
        : null;
      const propertyName = property?.name || "Unknown";

      result.push({
        id: payment.id,
        tenant: tenantName,
        property: propertyName,
        method: payment.method,
        amount: payment.amount,
        status: payment.status,
        payment_date: payment.payment_date,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Error fetching tenants", err.message);
    res.status(500).json({ error: "Unexpected error occurred." });
  }
});

//fetch Stats
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    const { data: thisMonthPayments, error: thisMonthError } = await supabase
      .from("payments")
      .select("amount")
      .gte("payment_date", startOfThisMonth);

    if (thisMonthError) return res.status(500).json({ error: thisMonthError.message });

    const thisMonthAmount = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);

    const { data: lastMonthPayments, error: lastMonthError } = await supabase
      .from("payments")
      .select("amount")
      .gte("payment_date", startOfLastMonth)
      .lte("payment_date", endOfLastMonth);

    if (lastMonthError) return res.status(500).json({ error: lastMonthError.message });

    const lastMonthAmount = lastMonthPayments.reduce((sum, p) => sum + p.amount, 0);

    const percentChange = lastMonthAmount === 0
      ? 100
      : Number((((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100).toFixed(1));

    res.json({
      totalRevenue: {
        amount: thisMonthAmount,
        percentChange,
      }
    });
  } catch (err) {
    console.error("Error calculating total revenue:", err.message);
    res.status(500).json({ error: "Unexpected error occurred." });
  }
});

// Get payment history by tenant ID
router.get("/tenant/:tenantId", async (req, res) => {
  const { tenantId } = req.params;
  console.log(tenantId);
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a payment
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("payments")
    .update(req.body)
    .eq("id", id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// Delete a payment
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

// ==================== MIGRATION ENDPOINT ====================

// One-time migration to initialize rent periods for existing leases
router.post("/migrate-rent-periods", async (req, res) => {
  try {
    console.log("Starting rent periods migration...");
    
    const { data: leases, error } = await supabase
      .from("leases")
      .select("*");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    let migratedCount = 0;

    for (const lease of leases) {
      try {
        await ensureRentPeriodsExist(lease, new Date());
        migratedCount++;
      } catch (err) {
        console.error(`Error migrating lease ${lease.id}:`, err.message);
      }
    }

    console.log(`Migration completed: ${migratedCount} leases processed`);
    res.json({ 
      success: true, 
      message: `Rent periods initialized for ${migratedCount} leases` 
    });
  } catch (error) {
    console.error("Migration failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENHANCED OVERDUE REPORT ====================

router.get("/overdue-report", async (req, res) => {
  try {
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('*');
      
    if (tenantsError) throw new Error(tenantsError.message);

    const overdueReport = [];

    for (const tenant of tenants) {
      try {
        // Use rent_periods table for accurate overdue calculation
        const { data: rentPeriods, error: periodsError } = await supabase
          .from('rent_periods')
          .select('*')
          .eq('tenant_id', tenant.id)
          .in('status', ['unpaid', 'partial'])
          .order('year', { ascending: true })
          .order('month', { ascending: true });

        if (periodsError) {
          if (periodsError.code === '42P01') continue; // Table doesn't exist yet
          throw new Error(periodsError.message);
        }

        if (rentPeriods && rentPeriods.length > 0) {
          const { data: property } = await supabase
            .from('properties')
            .select('name')
            .eq('id', tenant.property_id)
            .single();

          const { data: lease } = await supabase
            .from('leases')
            .select('monthly_rent, billing_mode')
            .eq('tenant_id', tenant.id)
            .single();

          overdueReport.push({
            tenant_id: tenant.id,
            tenant_name: tenant.full_name,
            property_name: property?.name || 'Unknown',
            monthly_rent: lease?.monthly_rent || 0,
            billing_mode: lease?.billing_mode || 'prepaid',
            overdue_periods: rentPeriods.map(period => ({
              period: `${period.month}/${period.year}`,
              due_date: period.due_date,
              expected_amount: period.due_amount,
              paid_amount: period.paid_amount,
              balance: period.balance,
              status: period.status,
              last_payment_date: period.last_payment_date
            })),
            total_overdue: rentPeriods.reduce((sum, p) => sum + p.balance, 0),
            oldest_overdue: rentPeriods[0] ? `${rentPeriods[0].month}/${rentPeriods[0].year}` : 'None'
          });
        }
      } catch (err) {
        console.error(`Error processing tenant ${tenant.id}:`, err.message);
        continue;
      }
    }

    res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      data: overdueReport
    });
  } catch (error) {
    console.error("Report generation error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;