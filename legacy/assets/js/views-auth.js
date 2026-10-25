/* ==========================================================================
   RoadAssist Web — Auth & onboarding
   Onboarding carousel, sign in, sign up, forgot password, OTP verification.

   Demo mode: any well-formed credential is accepted (see store.js >
   demoAdapter.signIn). The role is picked explicitly on the sign-in form
   rather than derived from a token claim, because there is no real backend.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var ui = RA.ui;
  var esc = U.esc;
  var icon = RA.icon;

  RA.views = RA.views || {};

  /* ======================================================================
     Shared shell
     ====================================================================== */

  var POINTS = [
    { icon: 'zap',        title: 'One-tap SOS',        text: 'Your coordinates go straight to every capable mechanic nearby.' },
    { icon: 'navigation', title: 'Live GPS tracking',  text: 'Watch the truck approach with an ETA that updates as it moves.' },
    { icon: 'verified',   title: 'Verified technicians', text: 'Licence, insurance and identity checked before their first job.' },
    { icon: 'dollar',     title: 'Price locked upfront', text: 'You see the call-out rate before you confirm. No surge pricing.' }
  ];

  function aside() {
    return '<div class="auth__aside"><div class="auth__asidein">' +
      '<p class="auth__quote">“Twelve minutes from the moment I pressed the button to the moment the truck pulled up behind me.”</p>' +
      '<div class="hstack gap-3 mt-4">' + ui.avatar('Nina Patel', { size: 'sm' }) +
        '<div><div class="fw-6">Nina Patel</div><div class="fs-xs t-2">Towing · Outer Ring Road</div></div>' +
        '<span class="push">' + ui.rating(5) + '</span></div>' +
      '<div class="auth__points">' + POINTS.map(function (p) {
        return '<div class="auth__point"><span class="i">' + icon(p.icon, 20) + '</span>' +
          '<div><div class="auth__pointtitle">' + esc(p.title) + '</div>' +
          '<div class="auth__pointtext">' + esc(p.text) + '</div></div></div>';
      }).join('') + '</div>' +
      '</div></div>';
  }

  function authShell(inner) {
    return '<div class="auth">' +
      '<div class="auth__pane"><div class="auth__box" id="main">' + inner + '</div></div>' +
      aside() + '</div>';
  }

  function head(iconName, title, sub) {
    return '<button type="button" class="auth__logo" data-nav="/" aria-label="RoadAssist home">' +
      icon(iconName || 'truck', 26) + '</button>' +
      '<h1 class="auth__title">' + esc(title) + '</h1>' +
      '<p class="auth__sub">' + esc(sub) + '</p>';
  }

  function hint(html) {
    return '<div class="demohint"><span class="i">' + icon('info', 15) + '</span><div>' + html + '</div></div>';
  }

  /* ======================================================================
     Onboarding
     ====================================================================== */

  var SLIDES = [
    { icon: 'radio',      tint: 'var(--primary-15)', tone: 'var(--primary)',
      title: 'Help, without the hold music',
      text: 'Press SOS and RoadAssist broadcasts your exact position to verified mechanics nearby. No describing landmarks to a call centre.' },
    { icon: 'navigation', tint: 'var(--accent-15)',  tone: 'var(--accent)',
      title: 'Know exactly when they’ll arrive',
      text: 'Follow your mechanic on a live map with a continuously recalculated ETA, and call them directly from the tracking screen.' },
    { icon: 'shield',     tint: 'var(--success-15)', tone: 'var(--success)',
      title: 'Set it up before you need it',
      text: 'Save your vehicles and emergency contacts now, so a future breakdown is a single tap instead of a form.' }
  ];

  RA.views.onboarding = function (params, q) {
    var i = U.clamp(parseInt(q.step, 10) || 0, 0, SLIDES.length - 1);
    var s = SLIDES[i];
    var last = i === SLIDES.length - 1;

    return {
      chrome: false, title: 'Welcome',
      html: '<div class="onb"><div class="onb__top">' +
          (last ? '' : ui.btn({ label: 'Skip', variant: 'ghost', size: 'sm', nav: '/login' })) +
        '</div>' +
        '<div class="onb__body" id="main">' +
          '<span class="onb__icon" style="--tint:' + s.tint + ';--tone:' + s.tone + '">' + icon(s.icon, 52) + '</span>' +
          '<h1 class="onb__title">' + esc(s.title) + '</h1>' +
          '<p class="onb__text">' + esc(s.text) + '</p>' +
          '<div class="onb__dots" role="tablist" aria-label="Slide">' + SLIDES.map(function (x, n) {
            return '<span class="' + ui.cx('onb__dot', n === i ? 'is-active' : '') + '"></span>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="onb__foot stack stack-3">' +
          ui.btn({ label: last ? 'Create my account' : 'Next', block: true,
                   icon: last ? 'person' : 'chevronR',
                   nav: last ? '/signup' : '/welcome?step=' + (i + 1) }) +
          ui.btn({ label: last ? 'I already have an account' : 'Sign in instead',
                   variant: 'secondary', block: true, nav: '/login' }) +
        '</div>' +
        '</div>'
    };
  };

  /* ======================================================================
     Sign in
     ====================================================================== */

  var ROLE_OPTS = [
    { value: 'customer', label: 'Customer' },
    { value: 'mechanic', label: 'Mechanic' },
    { value: 'admin',    label: 'Admin' }
  ];

  RA.views.login = function (params, q) {
    var next = q.next || '';
    var role = ROLE_OPTS.filter(function (r) { return r.value === q.as; })[0] ? q.as : 'customer';

    var inner = head('truck', 'Welcome back', 'Sign in to request assistance or manage your call-outs.') +

      hint('Demo build — any email and a password of <code>6+</code> characters will sign you in. ' +
           'Pick a portal below to land in that experience.') +

      '<form id="login-form" novalidate>' +
        '<span class="field__label" style="display:block">Sign in as</span>' +
        '<div class="toolbar__group mb-4" id="role-pick" role="group" aria-label="Portal">' +
          ROLE_OPTS.map(function (r) {
            return '<button type="button" class="' + ui.cx('chipbtn', r.value === role ? 'is-active' : '') +
              '" data-role-pick="' + r.value + '">' + esc(r.label) + '</button>';
          }).join('') +
        '</div>' +
        '<input type="hidden" name="role" value="' + U.escAttr(role) + '">' +

        ui.field({ label: 'Email or mobile number', name: 'identifier', type: 'text',
          placeholder: 'zaid@roadassist.com', icon: 'mail', autocomplete: 'username',
          value: 'zaid@roadassist.com' }) +
        ui.field({ label: 'Password', name: 'password', type: 'password',
          placeholder: '••••••••', autocomplete: 'current-password', value: 'roadassist' }) +

        '<div class="auth__row">' +
          '<button type="button" class="section__link" data-nav="/forgot">Forgot password?</button>' +
        '</div>' +

        ui.btn({ label: 'Sign in', block: true, type: 'submit', id: 'login-submit' }) +
      '</form>' +

      '<div class="auth__or">OR</div>' +
      '<div class="auth__social">' +
        ui.btn({ label: 'Google', variant: 'secondary', icon: 'google', act: 'social' }) +
        ui.btn({ label: 'Continue as guest', variant: 'secondary', icon: 'person', act: 'guest' }) +
      '</div>' +

      '<p class="auth__alt">New to RoadAssist? ' +
        '<button type="button" class="section__link" data-nav="/signup">Create an account</button></p>';

    return {
      chrome: false, title: 'Sign in',
      html: authShell(inner),
      mount: function (root) {
        var scope = RA.views._scope(root);
        var form = U.qs('#login-form', root);
        var hidden = U.qs('input[name="role"]', form);

        U.on(scope, 'click', '[data-role-pick]', function (e, node) {
          U.qsa('[data-role-pick]', root).forEach(function (b) { b.classList.remove('is-active'); });
          node.classList.add('is-active');
          hidden.value = node.getAttribute('data-role-pick');
        });

        function land(chosenRole) {
          var home = RA.chrome.NAV[chosenRole].home;
          RA.router.go(next && chosenRole === 'customer' ? next : home);
        }

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var values = ui.validateForm(form, {
            identifier: U.validate.emailOrPhone,
            password: U.validate.password
          });
          if (!values) return;

          ui.withLoading(U.qs('#login-submit', form),
            RA.store.actions.signIn(values.identifier, values.password, values.role)
          ).then(function (res) {
            ui.toast('Signed in as ' + RA.chrome.NAV[res.role].label.toLowerCase(), 'success');
            land(res.role);
          }).catch(function (err) {
            ui.showError(form, 'password', err.message || 'Could not sign in.');
          });
        });

        U.on(scope, 'click', '[data-act="social"]', function () {
          ui.toast('Social sign-in needs a real auth provider — using the demo account', 'info');
          RA.store.actions.enterAs(hidden.value).then(function (r) { land(r); });
        });

        U.on(scope, 'click', '[data-act="guest"]', function () {
          RA.store.actions.enterAs('customer').then(function () {
            ui.toast('Exploring as a guest customer', 'info');
            land('customer');
          });
        });
      }
    };
  };

  /* ======================================================================
     Sign up
     ====================================================================== */

  RA.views.signup = function () {
    var inner = head('person', 'Create your account', 'It takes about a minute, and it saves you several when you break down.') +

      '<form id="signup-form" novalidate>' +
        ui.field({ label: 'Full name', name: 'name', placeholder: 'Zaid Developer', icon: 'person', autocomplete: 'name' }) +
        ui.field({ label: 'Email address', name: 'email', type: 'email', placeholder: 'you@example.com', icon: 'mail', autocomplete: 'email' }) +
        ui.field({ label: 'Mobile number', name: 'phone', type: 'tel', placeholder: '+91 98765 43210', icon: 'phone', autocomplete: 'tel' }) +
        ui.field({ label: 'Password', name: 'password', type: 'password', placeholder: 'At least 6 characters', autocomplete: 'new-password' }) +
        ui.field({ label: 'Confirm password', name: 'confirm', type: 'password', placeholder: 'Re-enter your password', autocomplete: 'new-password' }) +

        '<label class="settingrow mb-4" style="cursor:pointer">' +
          '<input type="checkbox" name="terms" style="width:18px;height:18px;accent-color:var(--primary);flex:none">' +
          '<span class="settingrow__body"><span class="row__sub">I agree to the Terms of Service and Privacy Policy, and to being contacted about a call-out I request.</span></span>' +
        '</label>' +
        '<span class="field__error" data-error-for="terms" hidden></span>' +

        ui.btn({ label: 'Create account', block: true, type: 'submit', id: 'signup-submit' }) +
      '</form>' +

      '<p class="auth__alt">Already registered? ' +
        '<button type="button" class="section__link" data-nav="/login">Sign in</button></p>' +

      '<div class="auth__or">MECHANICS</div>' +
      ui.card('<div class="hstack gap-3">' +
          '<span class="row__icon" style="--tint:var(--warning-15);--tone:var(--warning)">' + icon('wrench', 19) + '</span>' +
          '<div class="grow"><div class="fw-6">Want to take jobs instead?</div>' +
          '<div class="fs-xs t-2">Mechanic applications go through a verification queue.</div></div>' +
        '</div>' +
        '<div class="mt-4">' + ui.btn({ label: 'Apply as a mechanic', variant: 'secondary', size: 'sm', block: true, nav: '/contact' }) + '</div>',
        { variant: 'flat' });

    return {
      chrome: false, title: 'Create account',
      html: authShell(inner),
      mount: function (root) {
        var form = U.qs('#signup-form', root);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var values = ui.validateForm(form, {
            name: U.validate.required,
            email: U.validate.email,
            phone: U.validate.phone,
            password: U.validate.password,
            confirm: function (v, all) { return v === all.password ? '' : 'Passwords do not match.'; },
            terms: function (v) { return v ? '' : 'Please accept the terms to continue.'; }
          });
          if (!values) return;

          ui.withLoading(U.qs('#signup-submit', form),
            RA.store.actions.signUp(values)
          ).then(function () {
            ui.toast('Account created — welcome to RoadAssist', 'success');
            RA.router.go('/app');
          });
        });
      }
    };
  };

  /* ======================================================================
     Forgot password
     ====================================================================== */

  RA.views.forgot = function () {
    var inner = head('lockReset', 'Reset your password', 'We’ll send a six-digit code to the email on your account.') +

      '<form id="forgot-form" novalidate>' +
        ui.field({ label: 'Email address', name: 'email', type: 'email',
          placeholder: 'you@example.com', icon: 'mail', value: 'zaid@roadassist.com' }) +
        ui.btn({ label: 'Send reset code', block: true, icon: 'send', type: 'submit', id: 'forgot-submit' }) +
      '</form>' +

      '<p class="auth__alt">Remembered it? ' +
        '<button type="button" class="section__link" data-nav="/login">Back to sign in</button></p>';

    return {
      chrome: false, title: 'Reset password',
      html: authShell(inner),
      mount: function (root) {
        var form = U.qs('#forgot-form', root);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var values = ui.validateForm(form, { email: U.validate.email });
          if (!values) return;
          ui.withLoading(U.qs('#forgot-submit', form), new Promise(function (r) { setTimeout(r, 700); }))
            .then(function () {
              ui.toast('Code sent to ' + values.email, 'success');
              RA.router.go('/verify?to=' + encodeURIComponent(values.email));
            });
        });
      }
    };
  };

  /* ======================================================================
     OTP verification
     ====================================================================== */

  var DEMO_CODE = '482915';

  RA.views.verify = function (params, q) {
    var to = q.to || 'zaid@roadassist.com';
    var cells = '';
    for (var i = 0; i < 6; i++) {
      cells += '<input class="otp__cell" type="text" inputmode="numeric" maxlength="1" ' +
        'data-otp="' + i + '" aria-label="Digit ' + (i + 1) + '">';
    }

    var inner = head('shield', 'Enter the code', 'We sent a six-digit code to ' + to + '.') +
      hint('Demo code is <code>' + DEMO_CODE + '</code> — or press Verify with the field left blank and we’ll fill it for you.') +
      '<form id="otp-form" novalidate>' +
        '<div class="otp" id="otp">' + cells + '</div>' +
        '<span class="field__error ta-c" data-error-for="code" hidden></span>' +
        ui.btn({ label: 'Verify and continue', block: true, type: 'submit', id: 'otp-submit' }) +
      '</form>' +
      '<p class="auth__alt">Didn’t get it? ' +
        '<button type="button" class="section__link" data-act="resend" id="resend">Resend code</button>' +
        '<span id="resend-timer" class="t-3"></span></p>';

    return {
      chrome: false, title: 'Verify',
      html: authShell(inner),
      mount: function (root) {
        var scope = RA.views._scope(root);
        var form = U.qs('#otp-form', root);
        var boxes = U.qsa('[data-otp]', root);
        var timerNode = U.qs('#resend-timer', root);
        var resendBtn = U.qs('#resend', root);
        var left = 30, handle = null;

        function read() {
          return boxes.map(function (b) { return b.value.replace(/\D/g, ''); }).join('');
        }

        boxes.forEach(function (b, i) {
          b.addEventListener('input', function () {
            b.value = b.value.replace(/\D/g, '').slice(0, 1);
            if (b.value && boxes[i + 1]) boxes[i + 1].focus();
          });
          b.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus();
            if (e.key === 'ArrowLeft' && boxes[i - 1]) boxes[i - 1].focus();
            if (e.key === 'ArrowRight' && boxes[i + 1]) boxes[i + 1].focus();
          });
          b.addEventListener('paste', function (e) {
            var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            if (!text) return;
            e.preventDefault();
            text.split('').slice(0, 6).forEach(function (ch, n) { if (boxes[n]) boxes[n].value = ch; });
            (boxes[Math.min(text.length, 5)] || boxes[5]).focus();
          });
        });
        if (boxes[0]) boxes[0].focus();

        function tick() {
          left -= 1;
          if (left <= 0) {
            clearInterval(handle);
            timerNode.textContent = '';
            resendBtn.disabled = false;
          } else {
            timerNode.textContent = ' (in ' + left + 's)';
          }
        }
        resendBtn.disabled = true;
        timerNode.textContent = ' (in ' + left + 's)';
        handle = setInterval(tick, 1000);

        U.on(scope, 'click', '[data-act="resend"]', function () {
          if (resendBtn.disabled) return;
          left = 30; resendBtn.disabled = true;
          timerNode.textContent = ' (in ' + left + 's)';
          clearInterval(handle); handle = setInterval(tick, 1000);
          ui.toast('New code sent', 'info');
        });

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          ui.clearErrors(form);
          var code = read();

          if (!code) {
            DEMO_CODE.split('').forEach(function (ch, n) { boxes[n].value = ch; });
            code = DEMO_CODE;
          }
          if (code.length !== 6) { ui.showError(form, 'code', 'Enter all six digits.'); return; }
          if (code !== DEMO_CODE) { ui.showError(form, 'code', 'That code is not right. The demo code is ' + DEMO_CODE + '.'); return; }

          ui.withLoading(U.qs('#otp-submit', form), new Promise(function (r) { setTimeout(r, 600); }))
            .then(function () { return RA.store.actions.enterAs('customer'); })
            .then(function () {
              ui.toast('Verified — you’re signed in', 'success');
              RA.router.go('/app');
            });
        });

        return function () { clearInterval(handle); };
      }
    };
  };

  RA.views._authShell = authShell;
  RA.views._authHead = head;
  RA.views._authHint = hint;
})(window);
