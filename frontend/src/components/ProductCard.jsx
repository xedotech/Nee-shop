import React from 'react';
import './ProductCard.css';

const ProductCard = ({ offer }) => {
  // Destructure with default values to prevent errors if data is missing
  const {
    seller_name = 'N/A',
    marketplace = 'N/A',
    price = 0,
    currency = 'USD',
    shipping_est = 0,
    eta_days,
    rating,
    reviews_count,
    affiliate_link,
    product,
  } = offer;

  // Nested destructuring for the product object
  const {
    title = 'Untitled Product',
    brand = 'Unknown Brand',
    image_urls = [],
  } = product || {};

  const displayPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(price);

  const displayShipping = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(shipping_est);

  return (
    <div className="product-card">
      <div className="product-image-container">
        <img src={image_urls[0] || 'https://via.placeholder.com/150'} alt={title} className="product-image" />
      </div>
      <div className="product-details">
        <p className="product-brand">{brand}</p>
        <h3 className="product-title">{title}</h3>

        <div className="offer-details">
          <p className="offer-price">{displayPrice}</p>
          <p className="offer-seller">
            From <strong>{seller_name}</strong> via <strong>{marketplace}</strong>
          </p>
          <p className="offer-shipping">Shipping: {displayShipping} | ETA: {eta_days || 'N/A'} days</p>
          {rating && (
            <div className="offer-rating">
              <span>⭐ {rating}/5</span>
              <span>({reviews_count || 0} reviews)</span>
            </div>
          )}
        </div>

        <a href={affiliate_link} target="_blank" rel="noopener noreferrer" className="buy-button">
          View Deal
        </a>
      </div>
    </div>
  );
};

export default ProductCard;
