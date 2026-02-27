import { Router } from 'express';
import { supabase } from '../../db/supabase.js';

const router = Router();

// Get all clients for a specific advisor
router.get("/:id/clients", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('advisor_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
