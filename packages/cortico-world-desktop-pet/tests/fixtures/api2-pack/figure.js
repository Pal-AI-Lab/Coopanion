/**
 * A figure pack written to manifest 2 and api 2, kept as it was: tests/packs.test.ts reads it and
 * tests/figure-frame-contract.test.js runs it in the figure frame on every run. A change that breaks it
 * breaks the packs people have published (README, 形象包兼容承诺); do not edit it to make a test pass.
 *
 * It draws one circle and writes onto it what the body handed it, for the test to read back.
 */
export async function createFixtureBody(base, { model, scheme, kit, loadImage, asset, host }) {
  let tone = scheme;
  const figure = {
    draw(petG, face, frame) {
      petG.innerHTML = `<circle cx="128" cy="160" r="${model.r}" data-face="${frame.face ?? ''}" data-gesture="${frame.gesture?.kind ?? ''}"`
        + ` data-mode="${frame.mode}" data-tone="${tone}" data-base="${base.href}" data-asset="${asset('thumb.png').href}"`
        + ` data-loader="${typeof loadImage}"/>`;
    },
    extent: [38, 70, 218, 256],
    hits: [[128, 160, 90]],
    colors: { z: '#336699' },
    setScheme(id) { tone = id; },
  };
  return kit.createBody(host, { figure, words: { salute: { motion: { seconds: 1, face: 'happy' } } } });
}
