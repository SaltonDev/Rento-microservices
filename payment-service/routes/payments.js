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

// Route
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
        payment_date:payment.payment_date
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Error in /payments/with-info:", err.message);
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

router.get("/overdue-report", async (req, res) => {
  try {
    const tenantsResponse = await axios.get(
      "https://rento-tenant-microservice.onrender.com/api/tenants"
    );
    const tenants = tenantsResponse.data;

    const overdueReport = [];

    for (let tenant of tenants) {
      try {
        const leaseResponse = await axios.get(
          `http://localhost:3006/api/leases/tenant/${tenant.id}`
        );
        const lease = leaseResponse.data;

        const paymentResponse = await axios.get(
          `http://localhost:3005/api/payments/tenant/${tenant.id}`
        );
        const payments = paymentResponse.data;

        const today = new Date();
        const leaseStartDate = new Date(lease.lease_start);
        const leaseEndDate = new Date(lease.lease_end);
        const dueDay = lease.due_date;
        const rentAmount = lease.monthly_rent;
        const billingMode = lease.billing_mode || "prepaid";

        payments.sort(
          (a, b) => new Date(b.payment_date) - new Date(a.payment_date)
        );
        let lastPaymentDate =
          payments.length > 0 ? new Date(payments[0].payment_date) : null;

        if (lastPaymentDate && lastPaymentDate < leaseStartDate) {
          lastPaymentDate = leaseStartDate;
        }

        let expectedPaymentDate;
        let totalDaysOverdue = 0;
        let monthsOverdue = 0;

        if (lastPaymentDate) {
          expectedPaymentDate = new Date(lastPaymentDate);
          expectedPaymentDate.setDate(dueDay);

          // Adjust based on billing mode
          if (billingMode === "prepaid") {
            expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + 1);
          }
        } else {
          expectedPaymentDate = new Date(leaseStartDate);
          expectedPaymentDate.setDate(dueDay);

          if (leaseStartDate.getDate() > dueDay) {
            expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + 1);
          }

          // Prepaid starts from lease start, postpaid starts a month later
          if (billingMode === "postpaid") {
            expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + 1);
          }
        }

        while (
          expectedPaymentDate <= today &&
          expectedPaymentDate < leaseEndDate
        ) {
          monthsOverdue++;

          const periodEnd = new Date(expectedPaymentDate);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          periodEnd.setDate(dueDay);

          if (periodEnd > today) {
            totalDaysOverdue += Math.floor(
              (today - expectedPaymentDate) / (1000 * 60 * 60 * 24)
            );
          } else {
            totalDaysOverdue += Math.floor(
              (periodEnd - expectedPaymentDate) / (1000 * 60 * 60 * 24)
            );
          }

          expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + 1);
        }

        if (monthsOverdue > 0) {
          overdueReport.push({
            tenant_name: tenant.full_name,
            months_overdue: monthsOverdue,
            days_overdue: totalDaysOverdue,
            last_payment_date: lastPaymentDate
              ? lastPaymentDate.toISOString().split("T")[0]
              : "Never",
            property: tenant.property_id,
            total_amount_due: monthsOverdue * rentAmount,
            due_day_of_month: dueDay,
            billing_mode: billingMode,
          });
        }
      } catch (err) {
        console.error(`Error processing tenant ${tenant.id}:`, err);
        // Continue with next tenant
      }
    }

    res.status(200).json(overdueReport);
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({ error: "Error generating overdue report" });
  }
});

module.exports = router;
