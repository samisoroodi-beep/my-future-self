const SUPABASE_URL =
  "https://agwovveyuxzckohipodh.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_8k4rREhcBlx09y_6VlNdvg_2awXY9DG";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log("✅ Supabase Connected");