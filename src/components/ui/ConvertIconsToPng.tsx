'use client';

import React, { useEffect, useRef } from 'react';

/**
 * This component is used as a utility to convert SVG icons to PNG
 * It's intended to be used once during development, not in production
 */
export default function ConvertIconsToPng() {
  const canvasRef192 = useRef<HTMLCanvasElement>(null);
  const canvasRef512 = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const convertSvgToPng = async (
      svgUrl: string, 
      canvasRef: React.RefObject<HTMLCanvasElement>,
      width: number,
      height: number,
      downloadName: string
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;
      
      // Create new image from SVG
      const img = new Image();
      img.src = svgUrl;
      
      // Wait for image to load then draw to canvas
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert canvas to PNG and download
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = downloadName;
        link.href = pngUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
    };
    
    // Convert both icon sizes
    convertSvgToPng(
      '/icons/icon-192x192.svg', 
      canvasRef192, 
      192, 
      192,
      'icon-192x192.png'
    );
    
    convertSvgToPng(
      '/icons/icon-512x512.svg', 
      canvasRef512, 
      512, 
      512,
      'icon-512x512.png'
    );
  }, []);
  
  return (
    <div style={{ position: 'absolute', left: '-9999px' }}>
      <canvas ref={canvasRef192} />
      <canvas ref={canvasRef512} />
    </div>
  );
}
