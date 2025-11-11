const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const axios = require("axios");

// Enhanced Payment Processing Algorithm
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
    const billingMode = lease.billing_mode || 'prepaid';
    const dueDay = lease.due_date;

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
  // You can create an advance_payments table or handle this as needed
  console.log(`Advance payment of ${amount} for tenant ${tenantId} on ${paymentDate}`);
  // Implementation depends on your business logic for advance payments
  return { advance_applied: amount };
}

// Initialize rent periods for a lease (run when lease is created)
async function initializeRentPeriods(leaseId, tenantId, leaseStart, leaseEnd, monthlyRent) {
  const periods = [];
  let currentDate = new Date(leaseStart);
  const endDate = new Date(leaseEnd);

  while (currentDate <= endDate) {
    periods.push({
      lease_id: leaseId,
      tenant_id: tenantId,
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear(),
      due_amount: monthlyRent,
      paid_amount: 0,
      balance: monthlyRent,
      status: 'unpaid',
      due_date: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  const { error } = await supabase
    .from("rent_periods")
    .insert(periods);

  if (error) throw new Error(`Error initializing rent periods: ${error.message}`);
}

// Enhanced Create Payment Endpoint with Overdue Algorithm
router.post("/", async (req, res) => {
  const { tenant_id, amount, method, payment_date, status } = req.body;

  try {
    // 1. First, insert the basic payment record
    const { data: paymentData, error: paymentError } = await supabase
      .from("payments")
      .insert([{ 
        tenant_id, 
        amount, 
        method, 
        payment_date: payment_date || new Date().toISOString(), 
        status: status || 'completed' 
      }])
      .select();

    if (paymentError) {
      return res.status(400).json({ error: paymentError.message });
    }

    // 2. Process the payment using our algorithm
    const processingResult = await processRentPayment(
      tenant_id, 
      amount, 
      payment_date || new Date()
    );

    // 3. Return combined result
    res.json({
      payment_record: paymentData[0],
      processing_result: processingResult
    });

  } catch (error) {
    console.error("Payment processing failed:", error);
    res.status(500).json({ 
      error: "Failed to process payment", 
      details: error.message 
    });
  }
});

// Get payment history with rent period information
router.get("/tenant/:tenantId", async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    // Get payment records
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("payment_date", { ascending: false });

    if (paymentsError) {
      return res.status(500).json({ error: "Database error" });
    }

    // Get rent periods to see payment application
    const { data: rentPeriods, error: periodsError } = await supabase
      .from("rent_periods")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    res.status(200).json({
      payments: payments || [],
      rent_periods: rentPeriods || [],
      summary: {
        total_payments: payments?.length || 0,
        open_periods: rentPeriods?.filter(p => p.status !== 'paid').length || 0,
        total_balance: rentPeriods?.reduce((sum, p) => sum + p.balance, 0) || 0
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Enhanced Overdue Report with new algorithm
router.get("/overdue-report", async (req, res) => {
  try {
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('*');
      
    if (tenantsError) throw new Error(tenantsError.message);

    const overdueReport = [];

    for (const tenant of tenants) {
      try {
        // Get rent periods with unpaid/partial status
        const { data: rentPeriods, error: periodsError } = await supabase
          .from('rent_periods')
          .select('*')
          .eq('tenant_id', tenant.id)
          .in('status', ['unpaid', 'partial'])
          .order('year', { ascending: true })
          .order('month', { ascending: true });

        if (periodsError) {
          // If table doesn't exist, skip this tenant
          if (periodsError.code === '42P01') continue;
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

// KEEP ALL YOUR EXISTING ROUTES - Make sure they're properly defined

// Get all payments
router.get("/", async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*");
    
    if (error) return res.status(500).json({ error: error.message });

    const result = [];

    for (const payment of payments) {
      const tenant = await fetchMicroserviceData(
        "https://rento-tenant-microservice.onrender.com/api/tenants/",
        payment.tenant_id
      );
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      const property = propertyId
        ? await fetchMicroserviceData(
            "https://rento-property-microservice.onrender.com/api/properties/",
            propertyId
          )
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

// Reusable fetch helper (make sure this is defined)
async function fetchMicroserviceData(baseUrl, id) {
  try {
    const response = await axios.get(`${baseUrl}${id}`);
    return response.data;
  } catch (err) {
    console.error(`Error fetching ${baseUrl}${id}:`, err.message);
    return null;
  }
}

// Recent payments
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
      const tenant = await fetchMicroserviceData(
        "https://rento-tenant-microservice.onrender.com/api/tenants/",
        payment.tenant_id
      );
      const tenantName = tenant?.full_name || "Unknown";
      const propertyId = tenant?.property_id;

      const property = propertyId
        ? await fetchMicroserviceData(
            "https://rento-property-microservice.onrender.com/api/properties/",
            propertyId
          )
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

// Stats endpoint
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

// Make sure module.exports is at the very end
module.exports = router;