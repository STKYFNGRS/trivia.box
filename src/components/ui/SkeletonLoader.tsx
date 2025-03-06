import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
  height?: string | number;
  width?: string | number;
  rounded?: string;
}

export default function SkeletonLoader({
  className = '',
  height = '1rem',
  width = '100%',
  rounded = 'rounded-md'
}: SkeletonLoaderProps) {
  return (
    <div
      className={`animate-pulse bg-gray-700/50 ${rounded} ${className}`}
      style={{ 
        height: typeof height === 'number' ? `${height}px` : height, 
        width: typeof width === 'number' ? `${width}px` : width
      }}
    />
  );
}