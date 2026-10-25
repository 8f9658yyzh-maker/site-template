// スマホのメニュー開閉と、送信先が未設定のフォームの案内だけを担当する小さな動き。
(function () {
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('gnav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var form = document.getElementById('reserve-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) { e.preventDefault(); return; } // 迷惑送信の対策（人は入力しない欄）
      if (form.hasAttribute('data-no-endpoint')) {
        e.preventDefault();
        var m = form.querySelector('.form-msg');
        if (m) { m.hidden = false; m.textContent = 'ただいまフォームの受付準備中です。お手数ですが、お電話またはLINEでご連絡ください。'; }
      }
    });
  }
})();
