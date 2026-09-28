// Minimal scene stack. A scene implements any of:
//   enter(), exit(), update(dt), render(ctx), renderUI(ui)

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.current = null;
  }

  set(scene) {
    this.current?.exit?.();
    this.current = scene;
    scene.enter?.();
  }

  update(dt) {
    this.current?.update?.(dt);
  }

  render(renderer) {
    renderer.beginFrame();
    this.current?.render?.(renderer.ctx);
    renderer.present();
    this.current?.renderUI?.(renderer.ui);
  }
}
