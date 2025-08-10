// A simple API client to fetch data from our backend

// In development, Vite's proxy will forward requests from /api to the backend.
// In production, the frontend and backend will likely be served from the same domain.
const BASE_URL = '/api';

/**
 * Fetches all product offers from the backend.
 * @returns {Promise<Array>} A promise that resolves to an array of offers.
 */
export const getOffers = async () => {
  try {
    // We don't need to specify the full URL because of the proxy.
    const response = await fetch(`${BASE_URL}/offers`);

    if (!response.ok) {
      // Create an error object with more info
      const errorBody = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch offers:", error);
    // Re-throw the error so the calling component can handle it
    throw error;
  }
};

// Other API functions, such as for user authentication, can be added here.
// For example:
// export const login = async (email, password) => { ... };
// export const getProfile = async (token) => { ... };
