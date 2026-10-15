/**
 * Centralized API configuration.
 * Uses 127.0.0.1 instead of localhost to prevent Windows IPv6 [::1] collisions with other daemons (e.g. Docker Desktop).
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
