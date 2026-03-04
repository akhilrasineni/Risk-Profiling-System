import { supabase } from './src/db/supabase.js';
async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql: "ALTER TABLE ips_documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;" });
  console.log(error);
}
run();
