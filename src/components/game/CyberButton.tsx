import React from 'react';

interface CyberButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'correct' | 'incorrect';
  disabled?: boolean;
}

export default function CyberButton({ 
  children, 
  onClick,
  variant = 'default',
  disabled = false
}: CyberButtonProps) {
  const getButtonStyles = () => {
    switch (variant) {
      case 'correct':
        return 'bg-green-500/20 border-green-500/50 text-green-400';
      case 'incorrect':
        return 'bg-red-500/20 border-red-500/50 text-red-400';
      default:
        return disabled
          ? 'opacity-50'
          : 'hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-300';
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full px-4 py-3 
        rounded-lg border 
        bg-gray-900/80 border-gray-700/50
        text-gray-300
        transition-all duration-200
        ${getButtonStyles()}
      `}
    >
      {children}
    </button>
  );
}