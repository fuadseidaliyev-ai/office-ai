// ApocGo bootstrap: wires the engine (loop, input, renderer, scenes) to the game.

import { GameLoop } from './engine/loop.js';
import { Input } from './engine/input.js';
import { Renderer } from './engine/renderer.js';
import { SceneManager } from './engine/scene.js';
import { VIEW_W, VIEW_H } from './game/config.js';
import { loadSave, writeSave } from './game/save.js';
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

const game = {
  debug: false,
  save: loadSave(),
  renderer: new Renderer(canvas, VIEW_W, VIEW_H),
  input: new Input(window, { width: VIEW_W, height: VIEW_H }),
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

game.go('menu');
game.loop.start();

// Handy for tinkering from the browser console.
window.apocgo = game;
