'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: {
    x: number;
    y: number;
  };
  opacity: number;
  type: 'question' | 'symbol' | 'glow';
  color: string;
  symbol?: string;
}

const CYBER_SYMBOLS = ['01', '10', '∆', '◊', '[]', '//', '⚡'];
const COLORS = ['#00ff00', '#00ffff', '#ff00ff', '#ffff00'];

const STATES = {
  normal: {
    speed: 0.8,
    particleCount: 100
  },
  connected: {
    speed: 3,
    particleCount: 150
  }
};

export default function ParticleBackground() {
  const { isConnected } = useAccount();
  const particlesRef = useRef<Particle[]>([]);
  const [, forceRender] = useState({});
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(performance.now());
  const visibilityRef = useRef<boolean>(true);
  const lightSourceRef = useRef({ x: 0, y: 0, color: COLORS[0] });

  const generateParticle = useCallback((state: 'normal' | 'connected'): Particle => {
    const config = STATES[state];
    const particleType = Math.random() > 0.6 ? ('symbol' as const) : Math.random() > 0.4 ? ('question' as const) : ('glow' as const);
    const size = particleType === 'question' ? 
      (Math.random() * 30 + 20) : 
      particleType === 'symbol' ? 
        (Math.random() * 15 + 10) : 
        (Math.random() * 5 + 2);

    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size,
      speed: {
        x: Math.cos(angle) * config.speed,
        y: Math.sin(angle) * config.speed
      },
      opacity: Math.random() * 0.4 + 0.1,
      type: particleType,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      symbol: particleType === 'symbol' ? CYBER_SYMBOLS[Math.floor(Math.random() * CYBER_SYMBOLS.length)] : undefined
    };
  }, []);

  useEffect(() => {
    const config = STATES[isConnected ? 'connected' : 'normal'];
    particlesRef.current = Array.from(
      { length: config.particleCount }, 
      () => generateParticle(isConnected ? 'connected' : 'normal')
    );
    forceRender({});
  }, [isConnected, generateParticle]);

  useEffect(() => {
    const updateParticles = () => {
      if (!visibilityRef.current) return;

      particlesRef.current = particlesRef.current.map(particle => {
        let x = particle.x + particle.speed.x;
        let y = particle.y + particle.speed.y;
        
        if (x < 0) x = window.innerWidth;
        if (x > window.innerWidth) x = 0;
        if (y < 0) y = window.innerHeight;
        if (y > window.innerHeight) y = 0;
        
        return { ...particle, x, y };
      });

      lastUpdateRef.current = performance.now();
      forceRender({});
      animationFrameRef.current = requestAnimationFrame(updateParticles);
    };

    animationFrameRef.current = requestAnimationFrame(updateParticles);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      visibilityRef.current = document.visibilityState === 'visible';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    const strobeInterval = setInterval(() => {
      lightSourceRef.current = {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
      forceRender({});
    }, 2000);

    return () => clearInterval(strobeInterval);
  }, [isConnected]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {isConnected && (
        <div 
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at ${lightSourceRef.current.x}px ${lightSourceRef.current.y}px, ${lightSourceRef.current.color}20 0%, transparent 70%)`
          }}
        />
      )}
      {particlesRef.current.map((particle, index) => (
        <div
          key={index}
          className="absolute"
          style={{
            transform: `translate(${particle.x}px, ${particle.y}px)`,
            opacity: particle.opacity,
            color: particle.color,
            fontSize: `${particle.size}px`,
            textShadow: isConnected ? `0 0 10px ${particle.color}` : 'none'
          }}
        >
          {particle.type === 'question' ? '?' : 
           particle.type === 'symbol' && isConnected ? particle.symbol :
           '•'}
        </div>
      ))}
    </div>
  );
}