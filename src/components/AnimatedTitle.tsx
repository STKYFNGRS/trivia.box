import React from 'react';

const AnimatedTitle = () => {
  return (
    <h1 className="text-5xl md:text-6xl font-bold mb-4 animate-float">
      <span className="text-gray-100 bg-gradient-to-r from-white to-gray-100 bg-clip-text animate-shimmer">
        Welcome to{' '}
      </span>
      <span className="text-pink-500 bg-gradient-to-r from-pink-500 to-pink-400 bg-clip-text animate-shimmer">
        Trivia.Box
      </span>
    </h1>
  );
};

export default AnimatedTitle;