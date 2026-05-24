import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export const holeCatalog = [
  {
    id: "ice-runway",
    name: "Ice Runway",
    skyColor: 0x9fdfff,
    lightIntensity: 1.65,
    deathZoneY: -5,
    start: new THREE.Vector3(-23.5, 0.34, 0),
    cup: new THREE.Vector3(23.5, 0.34, 0),
    walls: { x: 27, z: 5.5 },
    surfaces: [
      { x: 0, z: 0, sx: 54, sz: 11 }
    ],
    ice: [
      { x: -7, z: 0, sx: 13, sz: 6.4 },
      { x: 10.8, z: 1.6, sx: 9.5, sz: 3.2 }
    ],
    bumpers: [
      { x: -2.5, z: -2.7, sx: 6.8, sz: 0.34, rot: 0.36 },
      { x: 7.4, z: 2.8, sx: 7.2, sz: 0.34, rot: -0.34 },
      { x: 17.2, z: -1.9, sx: 4.8, sz: 0.34, rot: 0.72 }
    ]
  },
  {
    id: "long-canal",
    name: "Long Canal",
    skyColor: 0x182436,
    lightIntensity: 0.72,
    deathZoneY: -5,
    start: new THREE.Vector3(0, 0.34, 13.6),
    cup: new THREE.Vector3(0, 0.34, -13.7),
    walls: { x: 7.2, z: 16 },
    surfaces: [
      { x: 0, z: 0, sx: 14.4, sz: 32 }
    ],
    ice: [
      { x: 0, z: 4.8, sx: 9.4, sz: 5.5 },
      { x: -2.3, z: -7.7, sx: 5.5, sz: 5.8 }
    ],
    bumpers: [
      { x: -3.7, z: 7.2, sx: 5.6, sz: 0.34, rot: Math.PI / 2 },
      { x: 3.8, z: 1.4, sx: 5.8, sz: 0.34, rot: Math.PI / 2 },
      { x: -3.2, z: -4.5, sx: 4.2, sz: 0.34, rot: Math.PI / 2 },
      { x: 2.0, z: -10.3, sx: 5.2, sz: 0.34, rot: -0.28 }
    ]
  },
  {
    id: "l-bend",
    name: "L Bend",
    skyColor: 0xffb574,
    lightIntensity: 1.25,
    deathZoneY: -5,
    start: new THREE.Vector3(-19.4, 0.34, 6),
    cup: new THREE.Vector3(14.4, 0.34, -13.7),
    walls: { x: 23, z: 17 },
    surfaces: [
      { x: -8, z: 6, sx: 30, sz: 11 },
      { x: 13.5, z: -4.8, sx: 11, sz: 28 }
    ],
    ice: [
      { x: 13.5, z: -3.2, sx: 6.4, sz: 10.4 }
    ],
    bumpers: [
      { x: -1.4, z: 0.5, sx: 9.2, sz: 0.34, rot: 0.52 },
      { x: 8.4, z: 5.9, sx: 6.8, sz: 0.34, rot: Math.PI / 2 },
      { x: 16.4, z: -7.5, sx: 6.2, sz: 0.34, rot: Math.PI / 2 },
      { x: 10.3, z: -13.9, sx: 5.0, sz: 0.34, rot: 0 }
    ]
  },
  {
    id: "circle-loop",
    name: "Circle Loop",
    skyColor: 0x101822,
    lightIntensity: 0.58,
    deathZoneY: -5,
    start: new THREE.Vector3(-10.5, 0.34, 0),
    cup: new THREE.Vector3(10.5, 0.34, 0),
    walls: { x: 14, z: 14 },
    surfaces: [
      { type: "circle", x: 0, z: 0, r: 14 }
    ],
    ice: [
      { type: "circle", x: 0, z: 0, r: 4.4 }
    ],
    bumpers: [
      { x: 0, z: -6.2, sx: 9.2, sz: 0.34, rot: 0.25 },
      { x: 0, z: 6.2, sx: 9.2, sz: 0.34, rot: -0.25 },
      { x: -6.4, z: 0, sx: 4.8, sz: 0.34, rot: Math.PI / 2 },
      { x: 6.4, z: 0, sx: 4.8, sz: 0.34, rot: Math.PI / 2 }
    ]
  },
  {
    id: "wide-horseshoe",
    name: "Wide Horseshoe",
    skyColor: 0xc9ecff,
    lightIntensity: 1.55,
    deathZoneY: -5,
    start: new THREE.Vector3(-16.5, 0.34, -8.5),
    cup: new THREE.Vector3(-16.4, 0.34, 8.5),
    walls: { x: 23, z: 14 },
    surfaces: [
      { x: -11.5, z: -8.5, sx: 23, sz: 9 },
      { x: 4.5, z: 0, sx: 9, sz: 26 },
      { x: -11.5, z: 8.5, sx: 23, sz: 9 }
    ],
    ice: [
      { x: 4.5, z: 0, sx: 5.4, sz: 12.2 }
    ],
    bumpers: [
      { x: -7.0, z: -3.0, sx: 12.0, sz: 0.34, rot: 0.62 },
      { x: -7.0, z: 3.0, sx: 12.0, sz: 0.34, rot: -0.62 },
      { x: 8.7, z: -7.7, sx: 6.3, sz: 0.34, rot: 0.4 },
      { x: 8.7, z: 7.7, sx: 6.3, sz: 0.34, rot: -0.4 }
    ]
  },
  {
    id: "zigzag-freeze",
    name: "Zigzag Freeze",
    skyColor: 0xf0a06d,
    lightIntensity: 1.18,
    deathZoneY: -5,
    start: new THREE.Vector3(22.4, 0.34, -7.2),
    cup: new THREE.Vector3(-22.5, 0.34, 7.2),
    walls: { x: 26, z: 10.5 },
    surfaces: [
      { x: 0, z: 0, sx: 52, sz: 21 }
    ],
    ice: [
      { x: 13.3, z: -4.5, sx: 9.5, sz: 4.2, rot: -0.32 },
      { x: -7.5, z: 2.6, sx: 11.0, sz: 4.2, rot: 0.25 }
    ],
    bumpers: [
      { x: 15.2, z: 2.1, sx: 8.5, sz: 0.34, rot: 0.64 },
      { x: 6.2, z: -3.2, sx: 8.5, sz: 0.34, rot: -0.64 },
      { x: -4.2, z: 3.1, sx: 8.5, sz: 0.34, rot: 0.64 },
      { x: -14.2, z: -2.2, sx: 8.5, sz: 0.34, rot: -0.64 },
      { x: -21.1, z: 5.5, sx: 4.2, sz: 0.34, rot: 0.2 }
    ]
  }
];
