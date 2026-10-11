export const SITE_URL = 'https://hundetimer.no';
export const SITE_TITLE = 'Hundetimer | Finn hundetrener, kurs og hundetrening';
export const SITE_DESCRIPTION = 'Finn hundetrenere, privattimer, kurs, aktiviteter og nettkurs for hund i Norge. Bestill hundetrening enkelt gjennom Hundetimer.';

export const PRIVATE_PATHS = [
  '/admin', '/trainer-dashboard', '/trainer-onboarding', '/account', '/account-deleted',
  '/account-suspended', '/api', '/login', '/register', '/auth', '/messages', '/notifications',
  '/booking', '/activity-booking', '/book', '/learn', '/saved', '/newsletter',
  '/trainer-agreement', '/vilkar/treneravtale', '/certificate', '/certificates', '/payout-statements',
];

export function isPrivatePath(path: string) {
  return PRIVATE_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
