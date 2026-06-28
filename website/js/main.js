/* =============================================
   Capultura — Landing Page Scripts
   GSAP scroll animations (particles handled by particles.js)
   ============================================= */

;(function () {
  'use strict';

  /* -------------------------------------------------
     GSAP — Scroll Animations
     ------------------------------------------------- */
  const initScrollAnimations = () => {
    gsap.registerPlugin(ScrollTrigger);

    // Hero entrance
    const heroTl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    heroTl
      .from('.hero-badge', { opacity: 0, y: 30, duration: 0.8 }, 0.2)
      .from('.hero-title', { opacity: 0, y: 50, duration: 1 }, 0.4)
      .from('.hero-subtitle', { opacity: 0, y: 30, duration: 0.8 }, 0.7)
      .from('.hero-actions', { opacity: 0, y: 30, duration: 0.8 }, 0.9)
      .from('.hero-visual', { opacity: 0, scale: 0.9, duration: 1.2 }, 0.5);

    // Feature cards stagger
    gsap.fromTo('.feature-card',
      { opacity: 0, y: 50, scale: 0.95 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.features-section',
          start: 'top 75%',
          toggleActions: 'play none none none',
        }
      }
    );

    // Steps stagger
    gsap.fromTo('.step',
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.steps-section',
          start: 'top 75%',
          toggleActions: 'play none none none',
        }
      }
    );

    // Section headers
    gsap.utils.toArray('.section-header').forEach(hdr => {
      gsap.fromTo(hdr,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: hdr,
            start: 'top 80%',
          }
        }
      );
    });

    // CTA reveal
    gsap.fromTo('.cta-section',
      { opacity: 0, scale: 0.95 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.cta-section',
          start: 'top 85%',
        }
      }
    );
  };

  /* -------------------------------------------------
     NAV — Scroll state
     ------------------------------------------------- */
  const initNav = () => {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const handleScroll = () => {
      if (window.scrollY > 40) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  };

  const init = () => {
    initScrollAnimations();
    initNav();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
