/* EN | हिं toggle. English is in the HTML; Hindi text for this page sits in #i18n-hi.
   Remembers the choice in localStorage. Without JS the page stays English and the toggle is hidden. */
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');
  var KEY = 'bharatjoy-lang';
  var hi = {};
  try { hi = JSON.parse(document.getElementById('i18n-hi').textContent || '{}'); } catch (e) { hi = {}; }
  var nodes = document.querySelectorAll('[data-i18n]');
  var en = {};
  for (var i = 0; i < nodes.length; i++) en[nodes[i].getAttribute('data-i18n')] = nodes[i].innerHTML;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function apply(lang) {
    for (var j = 0; j < nodes.length; j++) {
      var key = nodes[j].getAttribute('data-i18n');
      var text = lang === 'hi' && hi[key] ? hi[key] : en[key];
      if (nodes[j].innerHTML !== text) nodes[j].innerHTML = text;
      if (lang === 'hi' && hi[key]) nodes[j].setAttribute('lang', 'hi'); else nodes[j].removeAttribute('lang');
    }
    var shows = document.querySelectorAll('[data-i18n-show]');
    for (var k = 0; k < shows.length; k++) shows[k].hidden = shows[k].getAttribute('data-i18n-show') !== lang;
    root.setAttribute('lang', lang);
    var btns = document.querySelectorAll('.lang-btn');
    for (var b = 0; b < btns.length; b++) btns[b].setAttribute('aria-pressed', String(btns[b].getAttribute('data-lang') === lang));
  }

  function choose(lang) {
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
    if (reduce) { apply(lang); return; }
    root.classList.add('swap');
    setTimeout(function () { apply(lang); root.classList.remove('swap'); }, 200);
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  if (saved === 'hi') apply('hi');

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('.lang-btn') : null;
    if (!btn) return;
    var lang = btn.getAttribute('data-lang');
    if (lang !== root.getAttribute('lang')) choose(lang);
  });
})();
