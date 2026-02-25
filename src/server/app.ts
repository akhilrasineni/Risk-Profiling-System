import express from "express";
import { createServer as createViteServer } from "vite";
import authRoutes from "./routes/auth.ts";
import advisorRoutes from "./routes/advisors.ts";
import clientRoutes from "./routes/clients.ts";
import questionnaireRoutes from "./routes/questionnaires.ts";
import assessmentRoutes from "./routes/assessments.ts";
import { supabase } from "../db/supabase.ts";

export async function createApp() {
  const app = express();

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // DB Health check
  app.get("/api/health/db", async (req, res) => {
    try {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return res.status(500).json({ 
          status: "error", 
          message: "Missing Supabase credentials in environment variables." 
        });
      }
      const { error } = await supabase.from('clients').select('id').limit(1);
      if (error) throw error;
      res.json({ status: "ok", message: "Supabase connected" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/advisors", advisorRoutes);
  app.use("/api/clients", clientRoutes);
  app.use("/api/questionnaires", questionnaireRoutes);
  app.use("/api/assessments", assessmentRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  return app;
}
