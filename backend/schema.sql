-- Note: This schema assumes it's being run in a Supabase environment
-- where the 'auth' schema and 'gen_random_uuid()' function are available.

-- We'll create a 'profiles' table to store public user data,
-- linked to the private 'auth.users' table.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    country VARCHAR(2),
    currency VARCHAR(3),
    prefs JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.profiles IS 'Stores public profile information for each user.';

-- Products table to store canonical product information
CREATE TABLE IF NOT EXISTS public.products (
    canonical_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    brand TEXT,
    description TEXT,
    normalized_specs JSONB,
    image_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.products IS 'Canonical information about a specific product.';

-- Seller Offers table for different sellers' offerings of a product
CREATE TABLE IF NOT EXISTS public.seller_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(canonical_id) ON DELETE CASCADE,
    seller_name TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    shipping_est NUMERIC(10, 2),
    eta_days INTEGER,
    rating NUMERIC(3, 2) CHECK (rating >= 0 AND rating <= 5),
    reviews_count INTEGER,
    affiliate_link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.seller_offers IS 'Specific offers for a product from various sellers/marketplaces.';

-- Price Snapshots table for historical pricing data
CREATE TABLE IF NOT EXISTS public.price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    offer_id UUID NOT NULL REFERENCES public.seller_offers(id) ON DELETE CASCADE,
    price NUMERIC(10, 2) NOT NULL,
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.price_snapshots IS 'Stores historical price data for an offer.';

-- Watchlists table for users to track products
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(canonical_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);
COMMENT ON TABLE public.watchlists IS 'Allows users to "watch" products for alerts.';

-- Function to update 'updated_at' columns automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles
CREATE TRIGGER set_profiles_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- Trigger for seller_offers
CREATE TRIGGER set_seller_offers_timestamp
BEFORE UPDATE ON public.seller_offers
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();
