/* =============================================
   Capultura — Support Page Scripts
   FAQ + Contact form + smooth interactions
   ============================================= */

;(function () {
  'use strict';

  const initFAQ = () => {
    const items = document.querySelectorAll('.faq-item');

    items.forEach((item) => {
      const btn = item.querySelector('.faq-question');
      if (!btn) return;

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        // Close all
        items.forEach((i) => i.classList.remove('open'));

        // Open clicked (unless it was already open)
        if (!isOpen) {
          item.classList.add('open');
        }
      });
    });
  };

  const initContactForm = () => {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const inputs = form.querySelectorAll('input, textarea');
      const data = {};
      inputs.forEach((input) => {
        data[input.name] = input.value.trim();
      });

      // Simulated submission feedback
      const btn = form.querySelector('.btn-primary');
      const originalText = btn ? btn.textContent : 'Send message';
      if (btn) {
        btn.textContent = 'Sending...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
      }

      setTimeout(() => {
        if (btn) {
          btn.textContent = 'Message sent!';
          btn.style.background = 'linear-gradient(135deg, #00e676, #00c853)';
        }

        setTimeout(() => {
          form.reset();
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.background = '';
          }
        }, 2000);
      }, 1200);
    });
  };

  const initScrollReveal = () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    gsap.fromTo('.support-hero .section-tag',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
    );

    gsap.fromTo('.support-hero h1',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.1 }
    );

    gsap.fromTo('.support-hero .subtitle',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.25 }
    );

    gsap.fromTo('.contact-card',
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.contact-card',
          start: 'top 80%',
        }
      }
    );

    gsap.fromTo('.faq-item',
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.faq-list',
          start: 'top 80%',
        }
      }
    );
  };

  const init = () => {
    initFAQ();
    initContactForm();
    initScrollReveal();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
