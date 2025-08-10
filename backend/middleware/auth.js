// This is a conceptual middleware. The exact implementation (e.g., req, res)
// would depend on the serverless framework (e.g., Express, Fastify, or a custom handler signature).

const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config');

// This admin client is for server-side operations that require bypassing RLS.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * A middleware function to protect serverless function endpoints.
 * It verifies the JWT from the Authorization header.
 * @param {function} handler - The serverless function handler to wrap.
 * @returns {function} - The wrapped handler with authentication.
 */
const requireAuth = (handler) => async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // The 'res' object might be different depending on the framework.
    // This assumes an Express-like response object.
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error('Token validation error:', error.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    // Attach the authenticated user to the request object
    req.user = user;

    // Proceed to the original handler
    return handler(req, res);

  } catch (error) {
    console.error('An unexpected error occurred during authentication:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { requireAuth };
