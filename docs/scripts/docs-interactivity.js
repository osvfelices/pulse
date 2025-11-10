// Documentation Interactivity Script
(() => {
  'use strict';

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    initSearch();
    initNavigation();
    initKeyboardShortcuts();
    initScrollEffects();
  }

  // Search functionality
  function initSearch() {
    const searchInput = document.querySelector('.search-input');
    const searchResults = document.querySelector('.search-results');
    
    if (!searchInput || !searchResults) return;

    // Sample search data - in real implementation, this would come from a search index
    const searchData = [
      { title: 'Overview', url: 'index.html', section: 'Getting Started' },
      { title: 'Guide', url: 'guide.html', section: 'Getting Started' },
      { title: 'Playground', url: 'playground.html', section: 'Getting Started' },
      { title: 'API Reference', url: 'api.html', section: 'Reference' },
    ];

    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();

      if (query.length < 2) {
        searchResults.classList.remove('show');
        return;
      }

      searchTimeout = setTimeout(() => {
        const results = searchData.filter(item => 
          item.title.toLowerCase().includes(query) ||
          item.section.toLowerCase().includes(query)
        );

        displaySearchResults(results, query);
      }, 150);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) {
        searchResults.classList.add('show');
      }
    });

    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
      }
    });

    function displaySearchResults(results, query) {
      if (results.length === 0) {
        searchResults.innerHTML = `
          <div class="search-result-item">
            <div class="search-result-title">No results found for "${query}"</div>
          </div>
        `;
      } else {
        searchResults.innerHTML = results.map(result => `
          <a href="${result.url}" class="search-result-item">
            <div class="search-result-title">${highlightMatch(result.title, query)}</div>
            <div class="search-result-path">${result.section}</div>
          </a>
        `).join('');
      }

      searchResults.classList.add('show');
    }

    function highlightMatch(text, query) {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    }
  }

  // Navigation active state
  function initNavigation() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPath || (currentPath === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  // Keyboard shortcuts
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Focus search on '/' key
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const searchInput = document.querySelector('.search-input');
        if (searchInput && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }

      // Escape to close search
      if (e.key === 'Escape') {
        const searchResults = document.querySelector('.search-results');
        const searchInput = document.querySelector('.search-input');
        if (searchResults) {
          searchResults.classList.remove('show');
        }
        if (searchInput) {
          searchInput.blur();
        }
      }
    });
  }

  // Scroll effects
  function initScrollEffects() {
    const header = document.querySelector('.header');
    if (!header) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateHeader() {
      const scrollY = window.scrollY;
      
      if (scrollY > 50) {
        header.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
      } else {
        header.style.boxShadow = 'none';
      }

      lastScrollY = scrollY;
      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        requestAnimationFrame(updateHeader);
        ticking = true;
      }
    }

    window.addEventListener('scroll', requestTick, { passive: true });
  }

  // Add smooth scroll behavior for anchor links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  });

})();