import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ status: "error", message: "User ID and password are required" });
    }

    // 1. Fetch user by ID (case-insensitive)
    const { data: loginData, error: loginError } = await supabase
      .from('user_login')
      .select('*')
      .ilike('user_id', userId.trim())
      .single();

    if (loginError || !loginData) {
      return res.status(401).json({ 
        status: "error", 
        message: "Invalid User ID. Please check your credentials." 
      });
    }

    // 2. Case-insensitive password check (as requested: "doesnt mater if ts small or caps")
    if (loginData.password.toLowerCase() !== password.trim().toLowerCase()) {
      return res.status(401).json({ 
        status: "error", 
        message: "Invalid password. Please check your credentials." 
      });
    }

    // 3. Determine role (case-insensitive)
    const profileType = (loginData.profile_type || '').toLowerCase();
    const isAdvisor = profileType === 'advisor';
    const role = isAdvisor ? 'advisor' : 'client';
    const table = isAdvisor ? 'advisors' : 'clients';
    
    // 4. Fetch the actual profile data
    const { data: profileData, error: profileError } = await supabase
      .from(table)
      .select('*')
      .eq('id', loginData.profile_id)
      .single();

    if (profileError || !profileData) {
      return res.status(404).json({ 
        status: "error", 
        message: `Login successful, but your profile details were not found in the '${table}' table.` 
      });
    }

    // 5. Update login_time
    await supabase
      .from('user_login')
      .update({ login_time: new Date().toISOString() })
      .eq('id', loginData.id);

    res.json({ 
      status: "ok", 
      user: profileData,
      role: role
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
