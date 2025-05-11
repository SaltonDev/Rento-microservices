const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const axios = require("axios");

// Create Payment Endpoint
router.post("/", async (req, res) => {
  const { tenant_id, amount, method, payment_date, status } = req.body;

  try {
    // Insert payment into the database
    const { data, error } = await supabase
      .from("payments")
      .insert([{ tenant_id, amount, method, payment_date, status }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch lease data or create payment" });
  }
});
//get all payment
// Microservice endpoints
const TENANT_SERVICE_URL =
  "https://rento-tenant-microservice.onrender.com/api/tenants/";
const PROPERTY_SERVICE_URL =
  "https://rento-property-microservice.onrender.com/api/properties/";

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

// Route to fetch all payments
router.get("/", async (req, res) => {
  try {
    // Fetch payment records
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*");
    if (error) return res.status(500).json({ error: error.message });

    const result = [];

    for (const payment of payments) {
      // Get tenant info
      const tenant = await fetchMicroserviceData(
        TENANT_SERVICE_URL,
        payment.tenant_id
      );
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      // Get property info
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
// Route
router.get("/recent", async (req, res) => {
  try {
    // Fetch the 5 most recent payment records
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: error.message });

    const result = [];

    for (const payment of payments) {
      // Get tenant info
      const tenant = await fetchMicroserviceData(
        TENANT_SERVICE_URL,
        payment.tenant_id
      );
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      // Get property info
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

    // Return empty array if no payments found (200 status)
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


// Helper function to ensure valid due dates
function setSafeDueDate(date, dueDay) {
  const result = new Date(date);
  const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dueDay, daysInMonth));
  return result;
}

router.get("/overdue-report", async (req, res) => {
  try {
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('*')
      
    if (tenantsError) throw new Error(tenantsError.message);

    const overdueReport = [];
    const today = new Date();

    for (const tenant of tenants) {
      try {
        // 1. Get lease info
        const { data: lease, error: leaseError } = await supabase
          .from('leases')
          .select('*')
          .eq('tenant_id', tenant.id)
          .single();
        
        if (leaseError) throw new Error(leaseError.message);

        // 2. Get all payments (sorted newest first)
        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('payment_date', { ascending: false });
        
        if (paymentsError) throw new Error(paymentsError.message);

        // 3. Calculate payment expectations
        const leaseStart = new Date(lease.lease_start);
        const leaseEnd = new Date(lease.lease_end);
        const dueDay = lease.due_date;
        const monthlyRent = lease.monthly_rent;
        const billingMode = lease.billing_mode || 'prepaid';

        // 4. Organize payments by period
        const paymentMap = new Map();
        payments.forEach(payment => {
          const paymentDate = new Date(payment.payment_date);
          const periodKey = `${paymentDate.getFullYear()}-${(paymentDate.getMonth() + 1).toString().padStart(2, '0')}`;
          
          if (!paymentMap.has(periodKey)) {
            paymentMap.set(periodKey, {
              totalPaid: 0,
              payments: []
            });
          }
          
          paymentMap.get(periodKey).totalPaid += payment.amount;
          paymentMap.get(periodKey).payments.push({
            date: payment.payment_date,
            amount: payment.amount,
            method: payment.method
          });
        });

        // 5. Calculate overdue periods
        let currentDate = new Date(leaseStart);
        let monthsOverdue = 0;
        let totalDebt = 0;
        const overdueDetails = [];

        while (currentDate <= today && currentDate <= leaseEnd) {
          const periodKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
          const periodPayments = paymentMap.get(periodKey) || { totalPaid: 0, payments: [] };
          const expectedPayment = billingMode === 'prepaid' 
            ? monthlyRent 
            : (currentDate > leaseStart ? monthlyRent : 0);

          if (periodPayments.totalPaid < expectedPayment) {
            const amountDue = expectedPayment - periodPayments.totalPaid;
            monthsOverdue++;
            totalDebt += amountDue;

            overdueDetails.push({
              period: periodKey,
              due_date: setSafeDueDate(new Date(currentDate), dueDay).toISOString().split('T')[0],
              expected_amount: expectedPayment,
              paid_amount: periodPayments.totalPaid,
              balance: amountDue,
              payments: periodPayments.payments,
              is_partial: periodPayments.totalPaid > 0 && periodPayments.totalPaid < expectedPayment
            });
          }

          currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // 6. Add to report if overdue
        if (overdueDetails.length > 0) {
          const { data: property } = await supabase
            .from('properties')
            .select('name')
            .eq('id', tenant.property_id)
            .single();

          overdueReport.push({
            tenant_id: tenant.id,
            tenant_name: tenant.full_name,
            property_name: property?.name || 'Unknown',
            lease_id: lease.id,
            billing_mode: billingMode,
            monthly_rent: monthlyRent,
            total_months_overdue: monthsOverdue,
            total_amount_due: totalDebt,
            overdue_details: overdueDetails,
            last_payment_date: payments[0]?.payment_date || null,
            lease_start: lease.lease_start,
            lease_end: lease.lease_end
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
