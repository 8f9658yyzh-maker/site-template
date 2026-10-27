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
      if (form.getAttribute('action') && form.hasAttribute('data-thanks')) {
        // 送信先が設定されているとき：画面を離れずに送り、成功したらお礼のページへ移動する
        e.preventDefault();
        var btn2 = form.querySelector('button[type="submit"]');
        var msg = form.querySelector('.form-msg');
        if (btn2) btn2.disabled = true;
        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
        fetch(form.getAttribute('action'), { method: 'POST', mode: 'no-cors', body: new URLSearchParams(new FormData(form)), signal: ctrl ? ctrl.signal : undefined })
          .then(function () { clearTimeout(timer); location.href = form.getAttribute('data-thanks'); })
          .catch(function () {
            clearTimeout(timer);
            if (btn2) btn2.disabled = false;
            if (msg) { msg.hidden = false; msg.textContent = '送信できませんでした。通信の状態をご確認のうえ、もう一度お試しいただくか、お電話でご連絡ください。'; }
          });
        return;
      }
      if (form.hasAttribute('data-no-endpoint')) {
        e.preventDefault();
        var m = form.querySelector('.form-msg');
        if (m) { m.hidden = false; m.textContent = 'ただいまフォームの受付準備中です。お手数ですが、お電話またはLINEでご連絡ください。'; }
      }
    });
  }
})();
