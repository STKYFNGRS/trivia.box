import React from 'react';

const FeatureIcons = () => {
  return (
    <div className="flex justify-center gap-16 text-[#E8DED1] font-medium opacity-0 animate-fadeIn" 
         style={{ animationDelay: '0.6s' }}>
      <div className="flex items-center gap-3 group">
        <div className="w-3 h-3 bg-[#FF3366] rounded-full group-hover:scale-125 transition-transform"></div>
        <span>Daily Challenges</span>
      </div>
      <div className="flex items-center gap-3 group">
        <div className="w-3 h-3 bg-[#FF6B6B] rounded-full group-hover:scale-125 transition-transform"></div>
        <span>Win Rewards</span>
      </div>
      <div className="flex items-center gap-3 group">
        <div className="w-3 h-3 bg-[#FF8C42] rounded-full group-hover:scale-125 transition-transform"></div>
        <span>Global Rankings</span>
      </div>
    </div>
  );
};

export default FeatureIcons;