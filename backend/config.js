// In a real application, these would be stored in environment variables.
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

module.exports = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
};
