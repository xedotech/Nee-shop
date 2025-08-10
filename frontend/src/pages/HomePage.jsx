import React, { useState, useEffect } from 'react';
import { getOffers } from '../services/api';
import ProductCard from '../components/ProductCard';
import './HomePage.css';

const HomePage = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        setLoading(true);
        const data = await getOffers();
        setOffers(data);
        setError(null);
      } catch (err) {
        setError('Failed to load offers. The backend might not be running or an error occurred.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, []); // The empty dependency array ensures this effect runs only once on mount

  const renderContent = () => {
    if (loading) {
      return <div className="loading-indicator">Loading offers...</div>;
    }

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    if (offers.length === 0) {
      return <div className="no-offers">No offers available at the moment. Please check back later.</div>;
    }

    return (
      <div className="offers-list">
        {offers.map(offer => <ProductCard key={offer.id} offer={offer} />)}
      </div>
    );
  };

  return (
    <div className="homepage-container">
      <header className="homepage-header">
        <h1>Latest Deals</h1>
        <p>Find the best prices from across the web, all in one place.</p>
      </header>
      {renderContent()}
    </div>
  );
};

export default HomePage;
