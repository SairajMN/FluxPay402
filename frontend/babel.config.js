module.exports = {
  plugins: [
    ['react-refresh/babel', {
      skipEnvCheck: process.env.NODE_ENV === 'production',
    }],
  ],
};
