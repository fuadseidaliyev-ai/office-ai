// Registry of the concept-art images in assets/ (built by tools/build_assets.py).
// main.js loads them before the first frame; view code reads them from `art`.

export const ART_FILES = [
  'truck', 'police', 'bus', 'billboard', 'sign', 'guardrail', 'tree1', 'tree2', 'crate', 'shotgun',
  'zombie1', 'zombie2', 'zombie3', 'zombie4', 'zombie5', 'zombie6',
  'barrel1', 'barrel2', 'barrel3', 'barrel4', 'barrelLying1', 'barrelLying2', 'tire1', 'tire2',
  'cracks1', 'cracks2', 'cracks3', 'cracks4', 'cracks5', 'blood1', 'blood2', 'blood3',
  'graffiti1', 'graffiti2', 'asphalt', 'dirt',
  'obstTree', 'obstCars', 'obstRocks', 'obstHole',
];

export const art = {};

export function setArt(images) {
  Object.assign(art, images);
}
