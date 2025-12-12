module.exports = {
  plugins: [
    process.env.NODE_ENV === 'development' && 'react-refresh/babel'
  ].filter(Boolean),
};
