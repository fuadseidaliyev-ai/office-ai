// Registry of the concept-art images in assets/ (built by tools/build_assets.py).
// main.js loads them before the first frame; view code reads them from `art`.

export const ART_FILES = [
  'truck', 'truckGun', 'dogGunner', 'dogRight', 'dogBack', 'police', 'bus', 'billboard', 'sign', 'guardrail', 'tree1', 'tree2', 'crate', 'shotgun',
  'z1Down', 'z1Up', 'z1Left', 'z1Right',
  'z2Down', 'z2Up', 'z2Left', 'z2Right', 'z2DownLeft', 'z2DownRight', 'z2UpLeft', 'z2UpRight',
  'z3Down', 'z3Up', 'z3Left', 'z3Right',
  'barrel1', 'barrel2', 'barrel3', 'barrel4', 'barrelLying1', 'barrelLying2', 'tire1', 'tire2',
  'cracks1', 'cracks2', 'cracks3', 'cracks4', 'cracks5', 'blood1', 'blood2', 'blood3',
  'graffiti1', 'graffiti2', 'asphalt', 'dirt',
  'obstTree', 'obstCars', 'obstRocks', 'obstHole', 'pickScrap', 'pickFood', 'pickDogFood',
  'btnLeft', 'btnRight', 'btnBrake', 'btnGas', 'obstBarricade',
  'truckL2', 'truckL3', 'truckL4', 'turretL2', 'turretL3', 'turretL4', 'bannerL2', 'bannerL3', 'bannerL4',
];

export const art = {};

export function setArt(images) {
  Object.assign(art, images);
}
