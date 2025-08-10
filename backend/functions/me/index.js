const { requireAuth } = require('../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../../config');

// Re-creating the admin client here, or it could be imported from a shared module.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// The main logic for our serverless function
const meHandler = async (req, res) => {
  // Thanks to the 'requireAuth' middleware, we know 'req.user' is present.
  const { user } = req;

  try {
    // Optionally, fetch the user's public profile from the 'profiles' table.
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignore 'range not found' errors for users without profiles
        console.error('Error fetching profile:', error);
    }

    // Return a composite object of auth user and profile data
    res.status(200).json({
      id: user.id,
      email: user.email,
      last_sign_in_at: user.last_sign_in_at,
      profile: profile || null, // Send profile if it exists, otherwise null
    });

  } catch (error) {
    console.error('Error in /me handler:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Wrap the handler with our authentication middleware.
// The serverless hosting provider (e.g., Vercel, Netlify) will call this exported function.
module.exports = requireAuth(meHandler);
