import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ProductCard from './ProductCard';

// Mock data that matches the structure of the data from the API
const mockOffer = {
  id: 'offer-1',
  seller_name: 'Digital Haven',
  marketplace: 'Amazon',
  price: 299.99,
  currency: 'USD',
  shipping_est: 0,
  eta_days: 2,
  rating: 4.8,
  reviews_count: 2500,
  affiliate_link: 'https://amazon.com/deal/123',
  product: {
    title: 'Pro-Grade Noise-Cancelling Headphones',
    brand: 'SoundSurge',
    image_urls: ['https://i.imgur.com/3j3XqXj.jpeg'],
  },
};

// A simple wrapper to provide the router context needed by NavLink (if it were used)
const renderWithRouter = (ui, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route);
  return render(ui, { wrapper: BrowserRouter });
};


describe('ProductCard Component', () => {
  it('renders all product information correctly', () => {
    renderWithRouter(<ProductCard offer={mockOffer} />);

    // Check that the product title and brand are displayed
    expect(screen.getByText('Pro-Grade Noise-Cancelling Headphones')).toBeInTheDocument();
    expect(screen.getByText('SoundSurge')).toBeInTheDocument();

    // Check for the formatted price
    expect(screen.getByText('$299.99')).toBeInTheDocument();

    // Check for seller and marketplace information
    expect(screen.getByText(/From/)).toHaveTextContent('From Digital Haven via Amazon');

    // Check for rating and review count
    expect(screen.getByText('⭐ 4.8/5')).toBeInTheDocument();
    expect(screen.getByText('(2500 reviews)')).toBeInTheDocument();

    // Check that the image is rendered with the correct src
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', mockOffer.product.image_urls[0]);

    // Check that the "View Deal" button is a link with the correct href
    const link = screen.getByRole('link', { name: /View Deal/i });
    expect(link).toHaveAttribute('href', mockOffer.affiliate_link);
  });

  it('handles offers with missing optional data gracefully', () => {
    const partialOffer = {
      ...mockOffer,
      rating: null, // No rating
      reviews_count: null,
      product: {
        ...mockOffer.product,
        brand: null, // No brand
      }
    };
    renderWithRouter(<ProductCard offer={partialOffer} />);

    // Brand should fall back to the default
    expect(screen.getByText('Unknown Brand')).toBeInTheDocument();

    // Rating should not be displayed
    expect(screen.queryByText(/⭐/)).not.toBeInTheDocument();
  });
});
