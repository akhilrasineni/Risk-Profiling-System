import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { id, role } = req.body;
    if (!id || !role) {
      return res.status(400).json({ status: "error", message: "ID and role are required" });
    }

    const table = role === 'advisor' ? 'advisors' : 'clients';
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(401).json({ 
        status: "error", 
        message: `Invalid ID or user not found. Ensure the '${table}' table exists and the ID is correct.` 
      });
    }

    res.json({ status: "ok", user: data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
