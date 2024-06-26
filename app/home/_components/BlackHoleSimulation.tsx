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

    const textureLoader = new THREE.TextureLoader();

    // Load textures from the public directory
    const sunTexture = textureLoader.load(
      '/Planet_Textures/sun.jpg',
      () => {
        console.log('Sun texture loaded');
      },
      undefined,
      (err) => {
        console.error('Error loading sun texture:', err);
      }
    );

    const mercuryTexture = textureLoader.load('/Planet_Textures/mercury.jpg');
    const venusTexture = textureLoader.load('/Planet_Textures/venus.jpg');
    const earthTexture = textureLoader.load('/Planet_Textures/earth.jpg');
    const marsTexture = textureLoader.load('/Planet_Textures/mars.jpg');
    const jupiterTexture = textureLoader.load('/Planet_Textures/jupiter.jpg');
    const saturnTexture = textureLoader.load('/Planet_Textures/saturn.jpg');
    const uranusTexture = textureLoader.load('/Planet_Textures/uranus.jpg');
    const neptuneTexture = textureLoader.load('/Planet_Textures/neptune.jpg');

    // Custom shader for the Sun
    const sunVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const sunFragmentShader = `
      uniform float time;
      uniform sampler2D tex;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        uv.x += sin(time + uv.y * 10.0) * 0.01;
        uv.y += cos(time + uv.x * 10.0) * 0.01;
        uv.y += sin(uv.x * 10.0 + time) * 0.01; // Adding jetstream effect
        vec4 texColor = texture2D(tex, uv);
        gl_FragColor = texColor;
      }
    `;

    const sunMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        tex: { value: sunTexture }
      },
      vertexShader: sunVertexShader,
      fragmentShader: sunFragmentShader
    });

    const sunGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    const createPlanet = (distance: number, size: number, speed: number, inclination: number, texture: THREE.Texture, hasRings = false) => {
      const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
      const planetMaterial = new THREE.MeshBasicMaterial({ map: texture });
      const planet = new THREE.Mesh(planetGeometry, planetMaterial);
      const orbit = new THREE.Object3D();
      orbit.add(planet);
      planet.position.x = distance;
      orbit.rotation.z = inclination;
      scene.add(orbit);

      if (hasRings) {
        const ringGeometry = new THREE.RingGeometry(size + 0.1, size + 0.5, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        planet.add(ring);
      }

      return { planet, orbit, speed };
    };

    const planets = [
      createPlanet(2, 0.1, 0.02, THREE.MathUtils.degToRad(7), mercuryTexture),    // Mercury
      createPlanet(3, 0.2, 0.015, THREE.MathUtils.degToRad(3.4), venusTexture),   // Venus
      createPlanet(4, 0.2, 0.01, THREE.MathUtils.degToRad(0), earthTexture),      // Earth
      createPlanet(5, 0.15, 0.008, THREE.MathUtils.degToRad(1.85), marsTexture),  // Mars
      createPlanet(6, 0.5, 0.005, THREE.MathUtils.degToRad(1.3), jupiterTexture), // Jupiter
      createPlanet(7, 0.4, 0.004, THREE.MathUtils.degToRad(2.5), saturnTexture, true), // Saturn
      createPlanet(8, 0.3, 0.003, THREE.MathUtils.degToRad(0.77), uranusTexture), // Uranus
      createPlanet(9, 0.3, 0.002, THREE.MathUtils.degToRad(1.77), neptuneTexture), // Neptune
    ];

    camera.position.z = 15;

    const animate = () => {
      requestAnimationFrame(animate);

      // Update the sun's material time uniform
      if (sunMaterial.uniforms.time && typeof sunMaterial.uniforms.time.value === 'number') {
        sunMaterial.uniforms.time.value += 0.01;
      }

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
