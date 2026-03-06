function authenticate(token) {
  const expected = process.env.APP_TOKEN;
  if (!expected || expected === 'change-me-to-a-secure-token') {
    console.warn('[auth] WARNING: Using default token. Set APP_TOKEN in .env');
  }
  return token === expected;
}

module.exports = { authenticate };
