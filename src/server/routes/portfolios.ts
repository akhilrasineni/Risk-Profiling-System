import { Router } from 'express';
import { supabase } from '../../db/supabase.js';

const router = Router();

// Get portfolio for client
router.get("/client/:client_id", async (req, res) => {
  try {
    const { client_id } = req.params;
    const { data, error } = await supabase
      .from('portfolios')
      .select(`
        *,
        holdings:portfolio_holdings (
          *,
          security:securities (*)
        ),
        ips:ips_documents (
          *,
          target_allocations (*)
        )
      `)
      .eq('client_id', client_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    res.json({ status: "ok", data: data || null });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Approve Portfolio
router.put("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('portfolios')
      .update({
        client_approved: true,
        client_approved_at: new Date().toISOString(),
        approval_status: 'Approved'
      })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    
    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Update Portfolio Holdings (Advisor Only)
router.put("/:id/holdings", async (req, res) => {
  try {
    const { id } = req.params;
    const { holdings, cash_balance } = req.body; // Array of { security_id, allocated_percent, allocated_amount, units }

    // 1. Delete existing holdings
    const { error: deleteError } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('portfolio_id', id);

    if (deleteError) throw deleteError;

    // 2. Insert new holdings
    const holdingsToInsert = holdings.map((h: any) => ({
      portfolio_id: id,
      security_id: h.security_id,
      allocated_percent: h.allocated_percent,
      allocated_amount: h.allocated_amount,
      units: h.units
    }));

    const { error: insertError } = await supabase
      .from('portfolio_holdings')
      .insert(holdingsToInsert);

    if (insertError) throw insertError;

    // 3. Update portfolio total amount if needed (optional, depends on UI)
    const totalAmount = holdings.reduce((sum: number, h: any) => sum + h.allocated_amount, 0);
    
    const updateData: any = { total_investment_amount: totalAmount };
    if (cash_balance !== undefined) {
      updateData.cash_balance = cash_balance;
    }

    await supabase
      .from('portfolios')
      .update(updateData)
      .eq('id', id);

    res.json({ status: "ok" });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get all securities
router.get("/securities/all", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('securities')
      .select('*')
      .order('security_name');

    if (error) throw error;
    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get all unique asset classes
router.get("/securities/asset-classes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('securities')
      .select('asset_class');

    if (error) throw error;
    
    const uniqueClasses = Array.from(new Set(data.map(s => s.asset_class)));
    res.json({ status: "ok", data: uniqueClasses });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
