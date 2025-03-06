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

const CYBER_SYMBOLS = ['01', '10', '∆', '◊', '[]', '//', '⚡', '★', '♦'];
const COLORS = ['#9333ea', '#e11d48', '#f97316', '#8b5cf6', '#ec4899', '#6366f1', '#06b6d4'];

const STATES = {
  normal: {
    speed: 0.6,
    particleCount: 120,
    opacityRange: { min: 0.1, max: 0.5 }
  },
  connected: {
    speed: 1.2, 
    particleCount: 200,
    opacityRange: { min: 0.2, max: 0.7 }
  },
  loading: {
    speed: 2.0,
    particleCount: 250,
    opacityRange: { min: 0.3, max: 0.9 }
  }
};

interface ParticleBackgroundProps {
  gameLoading?: boolean;
}

export default function ParticleBackground({ gameLoading = false }: ParticleBackgroundProps) {
  const { isConnected } = useAccount();
  const particlesRef = useRef<Particle[]>([]);
  const [, forceRender] = useState({});
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(performance.now());
  const visibilityRef = useRef<boolean>(true);
  const lightSourceRef = useRef({ x: 0, y: 0, color: COLORS[0] });

  const generateParticle = useCallback((state: 'normal' | 'connected' | 'loading'): Particle => {
    const config = STATES[state];
    const particleType = Math.random() > 0.6 ? ('symbol' as const) : Math.random() > 0.4 ? ('question' as const) : ('glow' as const);
    const size = particleType === 'question' ? 
      (Math.random() * 30 + 20) : 
      particleType === 'symbol' ? 
        (Math.random() * 15 + 10) : 
        (Math.random() * 5 + 2);

    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = config.speed * (state !== 'normal' ? (Math.random() * 0.5 + 0.75) : 1);
    
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size,
      speed: {
        x: Math.cos(angle) * baseSpeed,
        y: Math.sin(angle) * baseSpeed
      },
      opacity: Math.random() * (config.opacityRange.max - config.opacityRange.min) + config.opacityRange.min,
      type: particleType,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      symbol: particleType === 'symbol' ? CYBER_SYMBOLS[Math.floor(Math.random() * CYBER_SYMBOLS.length)] : undefined
    };
  }, []);

  useEffect(() => {
    let state = 'normal';
    if (gameLoading) {
      state = 'loading';
    } else if (isConnected) {
      state = 'connected';
    }
    
    const config = STATES[state as keyof typeof STATES];
    particlesRef.current = Array.from(
      { length: config.particleCount }, 
      () => generateParticle(state as keyof typeof STATES)
    );
    forceRender({});
  }, [isConnected, generateParticle, gameLoading]);

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
    if (!isConnected && !gameLoading) return;

    const strobeInterval = setInterval(() => {
      lightSourceRef.current = {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
      forceRender({});
    }, gameLoading ? 500 : 1000); // Faster strobe effect during loading

    return () => clearInterval(strobeInterval);
  }, [isConnected, gameLoading]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-purple-950/20 to-black opacity-70" />
      
      {(isConnected || gameLoading) && (
        <div 
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at ${lightSourceRef.current.x}px ${lightSourceRef.current.y}px, ${lightSourceRef.current.color}${gameLoading ? '50' : '30'} 0%, transparent ${gameLoading ? '80%' : '70%'})` // Increased glow intensity during loading
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
            textShadow: isConnected || gameLoading ? 
              `0 0 ${gameLoading ? '20' : '15'}px ${particle.color}` : 
              `0 0 8px ${particle.color}` // Enhanced glow during loading
          }}
        >
          {particle.type === 'question' ? '?' : 
           particle.type === 'symbol' && (isConnected || gameLoading) ? particle.symbol :
           '•'}
        </div>
      ))}
    </div>
  );
}