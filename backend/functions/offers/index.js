const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../../config');

// For server-side logic, we can use the service role key to bypass RLS.
// For a production app where this endpoint is public, you'd typically use the anon key
// and ensure your RLS policies on the 'products' and 'seller_offers' tables allow public read access.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Serverless function handler for fetching product offers.
 * This endpoint is public and does not require authentication.
 */
const offersHandler = async (req, res) => {
  try {
    // Supabase allows for joining tables in a single query.
    // Here, we fetch all columns from seller_offers and nest the related
    // product's title, brand, and image_urls.
    const { data: offers, error } = await supabase
      .from('seller_offers')
      .select(`
        id,
        seller_name,
        marketplace,
        price,
        currency,
        shipping_est,
        eta_days,
        rating,
        reviews_count,
        affiliate_link,
        product:products (
          canonical_id,
          title,
          brand,
          description,
          image_urls
        )
      `)
      // Optional: Add ordering to the results
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching offers from Supabase:', error);
      return res.status(500).json({ error: 'An internal error occurred while fetching offers.' });
    }

    if (!offers) {
      return res.status(404).json({ message: 'No offers were found.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(offers);

  } catch (error) {
    console.error('An unexpected error occurred in the offers handler:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = offersHandler;
