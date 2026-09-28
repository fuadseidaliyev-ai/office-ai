// ApocGo bootstrap: loads the art, then wires the engine (loop, input, renderer,
// scenes) to the game.

import { loadImages } from './engine/assets.js';
import { GameLoop } from './engine/loop.js';
import { Input } from './engine/input.js';
import { Renderer } from './engine/renderer.js';
import { SceneManager } from './engine/scene.js';
import { ART_FILES, setArt } from './game/art.js';
import { VIEW_W, VIEW_H, UI_W, UI_H } from './game/config.js';
import { loadSave, writeSave } from './game/save.js';
import { isTouchDevice } from './game/touchpad.js';
import { MenuScene } from './scenes/menu.js';
import { PlayScene } from './scenes/play.js';
import { GarageScene } from './scenes/garage.js';
import { ResultScene } from './scenes/result.js';

const SCENES = {
  menu: MenuScene,
  play: PlayScene,
  garage: GarageScene,
  result: ResultScene,
};

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');

const game = {
  debug: false,
  touchUI: isTouchDevice(), // on-screen gas / brake / steering buttons
  save: loadSave(),
  renderer: new Renderer(canvas, VIEW_W, VIEW_H, UI_W, UI_H),
  input: new Input(window, { width: UI_W, height: UI_H }),
  persist() {
    writeSave(this.save);
  },
  go(name, ...args) {
    this.scenes.set(new SCENES[name](this, ...args));
  },
};
game.input.attachTouch(canvas);
game.scenes = new SceneManager(game);
game.loop = new GameLoop({
  update: (dt) => {
    game.scenes.update(dt);
    game.input.endStep();
  },
  render: () => game.scenes.render(game.renderer),
});

const images = await loadImages(ART_FILES, './assets/', (n, total) => {
  if (loading) loading.textContent = `Загрузка… ${Math.round((n / total) * 100)}%`;
});
setArt(images);
await document.fonts?.ready;
loading?.remove();

game.go('menu');
game.loop.start();

// Handy for tinkering from the browser console.
window.apocgo = game;
