const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Create a payment
router.post('/', async (req, res) => {
  const { tenant_id, amount, payment_date } = req.body;

  // Get tenant info
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('monthly_rent, rent_due_day')
    .eq('id', tenant_id)
    .single();

  if (tenantError || !tenant) return res.status(404).json({ error: 'Tenant not found' });

  const now = new Date(payment_date || new Date());
  const dueDate = new Date(now.getFullYear(), now.getMonth(), tenant.rent_due_day);
  const daysLate = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
  const status = daysLate > 0 ? 'overdue' : 'paid';

  const { data, error } = await supabase.from('payments').insert([{
    tenant_id,
    amount,
    payment_date: now.toISOString(),
    due_date: dueDate.toISOString(),
    status,
    note: daysLate > 0 ? `Paid ${daysLate} day(s) late` : null
  }]).select().single();

  if (error) return res.status(400).json({ error });
  res.json(data);
});

// Get all payments
router.get('/', async (_, res) => {
  const { data, error } = await supabase.from('payments').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get overdue payments
router.get('/overdue', async (req, res) => {
    try {
      const today = new Date();
      const maxMonthsBack = 12;
  
      const { data: tenants, error: tErr } = await supabase
        .from('tenants')
        .select('id, full_name, property_id, unit_id, monthly_rent, rent_due_day');
      if (tErr) return res.status(500).json({ error: tErr.message });
  
      const overdueList = [];
  
      for (const tenant of tenants) {
        let overdueMonths = [];
  
        // 1. Fetch all payments made by tenant in last year
        const fromDate = new Date(today.getFullYear(), today.getMonth() - maxMonthsBack, 1).toISOString();
        const { data: allPayments, error: pErr } = await supabase
          .from('payments')
          .select('payment_date, amount')
          .eq('tenant_id', tenant.id)
          .gte('payment_date', fromDate);
  
        if (pErr) continue;
  
        // 2. Collect unpaid months
        for (let i = 1; i <= maxMonthsBack; i++) {
          const checkDate = new Date(today.getFullYear(), today.getMonth() - i, tenant.rent_due_day);
          if (checkDate > today) continue;
  
          const startOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1);
          const endOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0);
  
          const paidInThisMonth = allPayments.some(p => {
            const date = new Date(p.payment_date);
            return date >= startOfMonth && date <= endOfMonth;
          });
  
          if (!paidInThisMonth) {
            overdueMonths.push(checkDate);
          }
        }
  
        // 3. Match recent payments to overdue months (assume full payments cover oldest months)
        const paymentsSorted = allPayments
          .filter(p => p.amount >= tenant.monthly_rent)
          .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)); // newest first
  
        const uncoveredMonths = overdueMonths.slice(Math.max(0, paymentsSorted.length));
  
        if (uncoveredMonths.length > 0) {
          const earliest = uncoveredMonths[0];
          const daysOverdue = Math.floor((today - earliest) / (1000 * 60 * 60 * 24));
  
          overdueList.push({
            tenant_id: tenant.id,
            name: tenant.full_name,
            property_id: tenant.property_id,
            unit_id: tenant.unit_id,
            months_due: uncoveredMonths.length,
            first_due_date: earliest.toISOString(),
            days_overdue: daysOverdue,
            combined_total_due: tenant.monthly_rent * uncoveredMonths.length,
          });
        }
      }
  
      res.json(overdueList);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error calculating overdue payments' });
    }
  });
  

module.exports = router;
