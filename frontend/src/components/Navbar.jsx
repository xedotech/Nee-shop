import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      // The onAuthStateChange listener will handle state updates.
      // Navigate to home after logout.
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand">
        PriceRoute
      </NavLink>
      <nav className="navbar-links">
        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Home
        </NavLink>
        {user ? (
          <>
            {/* Future link to a profile page */}
            {/* <NavLink to="/profile" className="nav-link">Profile</NavLink> */}
            <button onClick={handleLogout} className="nav-link-button">
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Login
          </NavLink>
        )}
      </nav>
    </header>
  );
};

export default Navbar;
