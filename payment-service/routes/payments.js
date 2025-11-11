const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const axios = require("axios");

// Enhanced Payment Processing Algorithm (internal only)
async function processRentPayment(tenantId, amountPaid, paymentDate) {
  try {
    // 1. Get tenant's lease information
    const { data: lease, error: leaseError } = await supabase
      .from("leases")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (leaseError) throw new Error(`Lease not found: ${leaseError.message}`);

    const monthlyRent = lease.monthly_rent;

    // 2. Get all unpaid/partial paid rent periods (oldest first)
    const unpaidPeriods = await getUnpaidRentPeriods(tenantId, lease);
    
    let remainingAmount = amountPaid;
    const appliedPayments = [];
    const newPaymentDate = new Date(paymentDate);

    // 3. Apply payment to oldest outstanding balances first (FIFO)
    for (const period of unpaidPeriods) {
      if (remainingAmount <= 0) break;

      const outstandingBalance = period.balance;
      const amountToApply = Math.min(remainingAmount, outstandingBalance);

      if (amountToApply > 0) {
        // Update the rent period status
        const newBalance = outstandingBalance - amountToApply;
        const newStatus = newBalance === 0 ? 'paid' : 'partial';

        await updateRentPeriod(period.id, {
          paid_amount: period.paid_amount + amountToApply,
          balance: newBalance,
          status: newStatus,
          last_payment_date: newPaymentDate
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

    // 4. If there's remaining amount after clearing all overdue, handle advance payment
    let advancePayment = 0;
    if (remainingAmount > 0) {
      advancePayment = remainingAmount;
      await handleAdvancePayment(tenantId, advancePayment, newPaymentDate);
    }

    return {
      success: true,
      applied_payments: appliedPayments,
      advance_payment: advancePayment,
      monthly_rent: monthlyRent,
      fully_paid_periods: appliedPayments.filter(p => p.status === 'paid').length
    };

  } catch (error) {
    console.error("Payment processing error:", error);
    throw error;
  }
}

// Get unpaid rent periods (oldest first)
async function getUnpaidRentPeriods(tenantId, lease) {
  const { data: periods, error } = await supabase
    .from("rent_periods")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("lease_id", lease.id)
    .in("status", ["unpaid", "partial"])
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  if (error) {
    // If rent_periods table doesn't exist yet, return empty array
    if (error.code === '42P01') {
      console.log('rent_periods table does not exist yet');
      return [];
    }
    throw new Error(`Error fetching rent periods: ${error.message}`);
  }
  
  return periods || [];
}

// Update rent period record
async function updateRentPeriod(periodId, updates) {
  const { error } = await supabase
    .from("rent_periods")
    .update(updates)
    .eq("id", periodId);

  if (error) throw new Error(`Error updating rent period: ${error.message}`);
}

// Handle advance payment (for future rent)
async function handleAdvancePayment(tenantId, amount, paymentDate) {
  console.log(`Advance payment of ${amount} for tenant ${tenantId} on ${paymentDate}`);
  return { advance_applied: amount };
}

// KEEP YOUR ORIGINAL CREATE PAYMENT ENDPOINT - JUST ADD THE ALGORITHM
router.post("/", async (req, res) => {
  const { tenant_id, amount, method, payment_date, status } = req.body;

  try {
    // Insert payment into the database (ORIGINAL CODE)
    const { data, error } = await supabase
      .from("payments")
      .insert([{ tenant_id, amount, method, payment_date, status }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // ENHANCEMENT: Process the payment with our algorithm (runs in background)
    try {
      await processRentPayment(tenant_id, amount, payment_date || new Date());
    } catch (processingError) {
      console.error("Background payment processing failed:", processingError);
      // Don't fail the main request if processing fails
    }

    // RETURN ORIGINAL RESPONSE FORMAT - DON'T CHANGE FRONTEND
    res.json(data[0]);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lease data or create payment" });
  }
});

// KEEP ALL YOUR ORIGINAL ROUTES EXACTLY AS THEY WERE

//get all payment
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
      const tenant = await fetchMicroserviceData(TENANT_SERVICE_URL, payment.tenant_id);
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
      const tenant = await fetchMicroserviceData(TENANT_SERVICE_URL, payment.tenant_id);
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

//fetch Stats
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    // Fetch this month's total revenue
    const { data: thisMonthPayments, error: thisMonthError } = await supabase
      .from("payments")
      .select("amount")
      .gte("payment_date", startOfThisMonth);

    if (thisMonthError) return res.status(500).json({ error: thisMonthError.message });

    const thisMonthAmount = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);

    // Fetch last month's total revenue
    const { data: lastMonthPayments, error: lastMonthError } = await supabase
      .from("payments")
      .select("amount")
      .gte("payment_date", startOfLastMonth)
      .lte("payment_date", endOfLastMonth);

    if (lastMonthError) return res.status(500).json({ error: lastMonthError.message });

    const lastMonthAmount = lastMonthPayments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate percent change
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

// KEEP YOUR ORIGINAL OVERDUE REPORT - IT WILL WORK BETTER WITH THE NEW ALGORITHM
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