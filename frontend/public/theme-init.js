(function () {
  var root = document.documentElement;

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  var preference = read('finanzas.theme');
  var systemDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = preference === 'dark' || (preference !== 'light' && systemDark);

  root.classList.toggle('dark', dark);
  if (read('finanzas.transparency') === 'reduced') {
    root.setAttribute('data-transparency', 'reduced');
  }
})();
