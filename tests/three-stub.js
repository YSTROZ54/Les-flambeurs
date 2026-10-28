// Substitut minimal de THREE.js pour les tests automatisés (aucun rendu réel).
(function () {
  function make() {
    const cache = new Map();
    const target = function () {};
    const proxy = new Proxy(target, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === 'then') return undefined;
        if (k === 'length') return 0;
        if (typeof k === 'symbol') return undefined;
        if (cache.has(k)) return cache.get(k);
        let v;
        if (k === 'domElement') v = document.createElement('canvas');
        else v = make();
        cache.set(k, v);
        return v;
      },
      set(t, k, v) { cache.set(k, v); return true; },
      apply() { return make(); },
      construct() { return make(); }
    });
    return proxy;
  }
  window.THREE = make();
})();
