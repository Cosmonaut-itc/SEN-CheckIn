/**
 * Shared dashboard timezone fallback.
 *
 * This lives in a dashboard-local helper so the server and client
 * resolve the same default timezone when organization settings are absent.
 */
export const DEFAULT_DASHBOARD_TIME_ZONE = 'America/Mexico_City';
