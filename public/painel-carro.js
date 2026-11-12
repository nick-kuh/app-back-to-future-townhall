/* Painel "De Volta para o Sucesso": troca o carro de polígonos pelo DeLorean 3D realista.
 * O painel original (sucesso/public/painel.html) continua igual; este script entra depois dele e
 * substitui cada cena C3[k] por uma cena do motor compartilhado (delorean3d.js), que tem os mesmos
 * métodos: frame, charge, spark, doWarp, reset, carPos, e, dirty. O laço de animação segue sendo o do painel. */
(() => {
  if (!window.C3 || !window.Delorean3D) return;
  for (const k of Object.keys(C3)) {
    const old = C3[k];
    const scene = Delorean3D.car(old.cv, { camPos: old.o.camPos, camLook: old.o.camLook, manual: true });
    scene.e = old.e;
    C3[k] = scene;
  }
})();
