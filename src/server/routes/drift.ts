import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';
import { checkPortfolioDrift } from '../services/driftService.ts';

const router = Router();

// Get drift events for a specific portfolio
router.get("/portfolio/:portfolio_id", async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    
    const { data, error } = await supabase
      .from('drift_events')
      .select(`*`)
      .eq('portfolio_id', portfolio_id)
      .eq('resolved_flag', false);
      
    if (error) throw error;
    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get pending drift events for a client
router.get("/pending/:client_id", async (req, res) => {
  try {
    const { client_id } = req.params;
    
    // First find portfolios for this client
    const { data: portfolios, error: pError } = await supabase
      .from('portfolios')
      .select('id')
      .eq('client_id', client_id);
      
    if (pError) throw pError;
    if (!portfolios || portfolios.length === 0) {
      return res.json({ status: "ok", data: [] });
    }
    
    const portfolioIds = portfolios.map(p => p.id);

    const { data, error } = await supabase
      .from('drift_events')
      .select(`
        *,
        portfolio:portfolios (client_id),
        ips:ips_documents (
          *,
          target_allocations (*)
        )
      `)
      .in('portfolio_id', portfolioIds)
      .eq('resolved_flag', false);

    if (error) throw error;
    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get health status for a client
router.get("/health-status/:client_id", async (req, res) => {
  try {
    const { client_id } = req.params;
    
    // 1. Get all portfolios for this client
    const { data: portfolios, error: pError } = await supabase
      .from('portfolios')
      .select('id')
      .eq('client_id', client_id);
      
    if (pError) throw pError;
    if (!portfolios || portfolios.length === 0) {
      return res.json({ status: "ok", health_status: "Healthy" });
    }
    
    const portfolioIds = portfolios.map(p => p.id);

    // 2. Check if any of these portfolios have a drift event with resolved_flag = false
    const { data: driftEvents, error: dError } = await supabase
      .from('drift_events')
      .select('id')
      .in('portfolio_id', portfolioIds)
      .eq('resolved_flag', false);
      
    if (dError) throw dError;
    
    const isUnhealthy = driftEvents && driftEvents.length > 0;
    
    res.json({ 
      status: "ok", 
      health_status: isUnhealthy ? "drift_detected" : "healthy" 
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get pending drift events for an advisor (all their clients)
router.get("/advisor/:advisor_id", async (req, res) => {
  try {
    const { advisor_id } = req.params;
    
    // Find all clients for this advisor
    const { data: clients, error: cError } = await supabase
      .from('clients')
      .select('id')
      .eq('advisor_id', advisor_id);
      
    if (cError) throw cError;
    if (!clients || clients.length === 0) {
      return res.json({ status: "ok", data: [] });
    }
    
    const clientIds = clients.map(c => c.id);
    
    // Find portfolios for these clients
    const { data: portfolios, error: pError } = await supabase
      .from('portfolios')
      .select('id, client_id')
      .in('client_id', clientIds);
      
    if (pError) throw pError;
    if (!portfolios || portfolios.length === 0) {
      return res.json({ status: "ok", data: [] });
    }
    
    const portfolioIds = portfolios.map(p => p.id);
    

    const allDriftEvents = [];
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < portfolioIds.length; i += CHUNK_SIZE) {
      const chunk = portfolioIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('drift_events')
        .select(`*`)
        .in('portfolio_id', chunk)
        .eq('resolved_flag', false);
      
      if (error) {
        throw error;
      }
      if (data) {
        // Manually map client_id
        const dataWithPortfolio = data.map(event => {
          const portfolio = portfolios.find(p => p.id === event.portfolio_id);
          return {
            ...event,
            portfolio: portfolio ? { client_id: portfolio.client_id } : null
          };
        });
        allDriftEvents.push(...dataWithPortfolio);
      }
    }
    
    res.json({ status: "ok", data: allDriftEvents });
  } catch (error: any) {
    
    res.status(500).json({ status: "error", message: error.message || "An unknown error occurred" });
  }
});

// Manually check for drift for a portfolio
router.post("/check/:portfolio_id", async (req, res) => {
  try {
    const { portfolio_id } = req.params;
    const result = await checkPortfolioDrift(portfolio_id);
    res.json({ status: "ok", message: result.driftDetected ? "Drift detected" : "No drift detected", data: result.data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Update drift event with AI analysis
router.put("/:id/ai-analysis", async (req, res) => {
  try {
    const { id } = req.params;
    const { ai_analysis } = req.body;
    
    const { data, error } = await supabase
      .from('drift_events')
      .update({ 
        ai_analysis,
        alert_sent_flag: true // Mark as sent once AI analysis is attached
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

// Mark drift event as sent
router.put("/:id/mark-sent", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('drift_events')
      .update({ alert_sent_flag: true })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
