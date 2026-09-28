/**
 * Herpetoverse's public web origin.
 *
 * Herpetoverse shares Tarantuverse's API and user table. Auth emails
 * (verification, password reset) only name Herpetoverse and link back to
 * herpetoverse.com when the request says where it came from — without this,
 * a reptile keeper gets an email titled "Tarantuverse" pointing at a site
 * they've never heard of.
 *
 * The API allowlists this exact value (apps/api/app/utils/frontend_origin.py).
 * Apex host, no trailing slash.
 */
export const HV_WEB_ORIGIN = 'https://herpetoverse.com';
