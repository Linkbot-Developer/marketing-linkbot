// Shrinks any [data-fit] text until it fits inside its max height, so long AI-written headlines never overflow.
(function () {
  document.querySelectorAll('[data-fit]').forEach(function (el) {
    var max = parseFloat(el.getAttribute('data-fit'));
    var size = parseFloat(getComputedStyle(el).fontSize);
    var min = size * 0.5;
    while (el.scrollHeight > max && size > min) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  });
})();
