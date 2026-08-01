// Valeurs factices pour que les modules important src/lib/auth.ts (fail-fast
// sur JWT_SECRET/JWT_REFRESH_SECRET) ne lèvent pas au chargement pendant les tests.
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.JWT_REFRESH_SECRET ||= "test-jwt-refresh-secret";
