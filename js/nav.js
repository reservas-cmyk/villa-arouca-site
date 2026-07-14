document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', function () {
    var aberto = links.classList.toggle('aberto');
    toggle.classList.toggle('aberto', aberto);
    toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  });
  links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      links.classList.remove('aberto');
      toggle.classList.remove('aberto');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
});
