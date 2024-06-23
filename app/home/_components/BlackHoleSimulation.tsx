import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function SolarSystemSimulation() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      console.error('Mount ref is null');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // Create the Sun
    const sunGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    const createPlanet = (distance: number, size: number, speed: number) => {
      const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
      const planetMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const planet = new THREE.Mesh(planetGeometry, planetMaterial);
      const orbit = new THREE.Object3D();
      orbit.add(planet);
      planet.position.x = distance;
      scene.add(orbit);

      return { planet, orbit, speed };
    };

    const planets = [
      createPlanet(2, 0.1, 0.02),  // Mercury
      createPlanet(3, 0.2, 0.015), // Venus
      createPlanet(4, 0.2, 0.01),  // Earth
      createPlanet(5, 0.15, 0.008), // Mars
      createPlanet(6, 0.5, 0.005),  // Jupiter
      createPlanet(7, 0.4, 0.004),  // Saturn
      createPlanet(8, 0.3, 0.003),  // Uranus
      createPlanet(9, 0.3, 0.002),  // Neptune
    ];

    camera.position.z = 10;

    const animate = () => {
      requestAnimationFrame(animate);
      planets.forEach(({ orbit, speed }) => {
        orbit.rotation.y += speed;
      });
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup on component unmount
    return () => {
      if (mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
}

export default SolarSystemSimulation;
