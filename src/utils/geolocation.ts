/**
 * Geolocation Utilities for Event Attendance Tracker
 */

/**
 * Calculates the Haversine distance between two coordinates in meters.
 * 
 * Formula implemented:
 * d = 2r * arcsin(sqrt(sin^2((lat2 - lat1)/2) + cos(lat1)*cos(lat2)*sin^2((lon2 - lon1)/2)))
 * 
 * @param lat1 User Latitude
 * @param lon1 User Longitude
 * @param lat2 Target Event Latitude
 * @param lon2 Target Event Longitude
 * @returns Distance in meters
 */
export const calculateHaversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  // Convert degrees to radians
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.asin(Math.sqrt(a));

  return R * c; // Distance in meters
};

/**
 * Validates the geolocation accuracy strictly per the 100-meter anti-spoofing rule.
 * Throws an error if accuracy is too low.
 * 
 * @param coords The GeolocationCoordinates object from the browser's Geolocation API
 * @throws Error if the accuracy is greater than 100 meters
 */
export const validateGPSAccuracy = (coords: GeolocationCoordinates): void => {
  if (coords.accuracy > 100) {
    throw new Error(
      `GPS accuracy is too low (${Math.round(
        coords.accuracy
      )}m). Please step outside for a better GPS signal before trying to punch in.`
    );
  }
};

/**
 * Validates if the user is within the target radius (e.g., 50 meters)
 * 
 * @param userCoords The user's device coordinates
 * @param targetLat The target event latitude
 * @param targetLng The target event longitude
 * @param maxDistance The maximum allowed distance in meters (default 50m)
 * @returns boolean True if user is within the geofence
 * @throws Error if accuracy is too low
 */
export const isUserWithinGeofence = (
  userCoords: GeolocationCoordinates,
  targetLat: number,
  targetLng: number,
  maxDistance: number = 50
): { isValid: boolean; distance: number } => {
  // Check accuracy first (spoofing mitigation)
  validateGPSAccuracy(userCoords);

  const distance = calculateHaversineDistance(
    userCoords.latitude,
    userCoords.longitude,
    targetLat,
    targetLng
  );

  return {
    isValid: distance <= maxDistance,
    distance,
  };
};
