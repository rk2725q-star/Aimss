/* ─── Course Catalog Logic ─── */
(function () {
  'use strict';

  /* ── Course Data: Real NEET-related YouTube videos ── */
  const COURSES = [
    // ─── Class 6 ───
    { id: 'c6-sci-1', videoId: 'rz5TGN7eUcM', title: 'Science Foundation – Light, Shadows & Reflections', subject: 'physics', classLevel: 'class-6', badge: '', rating: 4.6, learners: '3.2k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c6-math-1', videoId: 'dW8Cy6WrO94', title: 'Introduction to Algebra & Variables', subject: 'mathematics', classLevel: 'class-6', badge: '', rating: 4.5, learners: '2.8k', instructor: 'Dr.AIMSS Faculty' },

    // ─── Class 7 ───
    { id: 'c7-sci-1', videoId: 'NKmGVE85GUU', title: 'Acids, Bases and Salts – Complete Chapter', subject: 'chemistry', classLevel: 'class-7', badge: '', rating: 4.6, learners: '4.1k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c7-bio-1', videoId: 'Hf-Kz4HMTAY', title: 'Nutrition in Plants – Photosynthesis Explained', subject: 'biology', classLevel: 'class-7', badge: '', rating: 4.7, learners: '3.6k', instructor: 'Dr.AIMSS Faculty' },

    // ─── Class 8 ───
    { id: 'c8-phy-1', videoId: 'ZM8ECpBuQYE', title: 'Force and Pressure – One Shot', subject: 'physics', classLevel: 'class-8', badge: '', rating: 4.5, learners: '5.1k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c8-math-1', videoId: 'k7Uc84U04Ik', title: 'Squares, Square Roots & Cubes', subject: 'mathematics', classLevel: 'class-8', badge: '', rating: 4.4, learners: '4.2k', instructor: 'Dr.AIMSS Faculty' },

    // ─── Class 9 ───
    { id: 'c9-phy-1', videoId: 'OoO5d5P0Jn4', title: 'Motion in a Straight Line – Full Chapter', subject: 'physics', classLevel: 'class-9', badge: '', rating: 4.7, learners: '8.9k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c9-chem-1', videoId: 'TEl4jeETVmg', title: 'Atoms and Molecules – Complete Concept', subject: 'chemistry', classLevel: 'class-9', badge: '', rating: 4.6, learners: '7.2k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c9-bio-1', videoId: 'F2TWUQWE2pw', title: 'Cell – The Fundamental Unit of Life', subject: 'biology', classLevel: 'class-9', badge: 'Popular', rating: 4.8, learners: '9.4k', instructor: 'Dr.AIMSS Faculty' },

    // ─── Class 10 ───
    { id: 'c10-phy-1', videoId: 'VqyzmZ9xS3g', title: 'Electricity – Complete Chapter Physics', subject: 'physics', classLevel: 'class-10', badge: 'Bestseller', rating: 4.9, learners: '15k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c10-chem-1', videoId: 'V0LGE122jBs', title: 'Chemical Reactions & Equations – One Shot', subject: 'chemistry', classLevel: 'class-10', badge: '', rating: 4.7, learners: '12k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c10-bio-1', videoId: 'X9NFkpWqsGU', title: 'Life Processes – Complete Biology', subject: 'biology', classLevel: 'class-10', badge: '', rating: 4.8, learners: '11k', instructor: 'Dr.AIMSS Faculty' },
    { id: 'c10-math-1', videoId: 'wkoCmqd9zvY', title: 'Trigonometry – Full Chapter Revision', subject: 'mathematics', classLevel: 'class-10', badge: 'Popular', rating: 4.8, learners: '14k', instructor: 'Dr.AIMSS Faculty' },

    // ─── Class 11 ───
    { id: 'c11-phy-1', videoId: 'bKjwF9nTlHU', title: 'Laws of Motion – Complete NEET Physics', subject: 'physics', classLevel: 'class-11', badge: 'Bestseller', rating: 4.9, learners: '22k', instructor: 'Physics Faculty' },
    { id: 'c11-phy-2', videoId: 'lsHG0LoE3Hc', title: 'Work, Energy & Power – One Shot', subject: 'physics', classLevel: 'class-11', badge: '', rating: 4.7, learners: '18k', instructor: 'Physics Faculty' },
    { id: 'c11-chem-1', videoId: 'KSBMhqeFmis', title: 'Organic Chemistry – Some Basic Principles', subject: 'chemistry', classLevel: 'class-11', badge: 'Popular', rating: 4.8, learners: '20k', instructor: 'Chemistry Faculty' },
    { id: 'c11-chem-2', videoId: '8qlrB6xksSo', title: 'Chemical Bonding – Complete Chapter', subject: 'chemistry', classLevel: 'class-11', badge: '', rating: 4.7, learners: '17k', instructor: 'Chemistry Faculty' },
    { id: 'c11-bio-1', videoId: 'BCNODfb-jCQ', title: 'Cell Biology – Complete NEET Biology', subject: 'biology', classLevel: 'class-11', badge: 'Bestseller', rating: 4.9, learners: '25k', instructor: 'Biology Faculty' },
    { id: 'c11-bio-2', videoId: 'YR4GcqAKbG8', title: 'Plant Anatomy – Detailed Lecture', subject: 'biology', classLevel: 'class-11', badge: '', rating: 4.6, learners: '13k', instructor: 'Biology Faculty' },

    // ─── Class 12 ───
    { id: 'c12-phy-1', videoId: 'X4GsBJeN2Is', title: 'Electrostatics – Complete NEET Physics', subject: 'physics', classLevel: 'class-12', badge: 'Bestseller', rating: 4.9, learners: '28k', instructor: 'Physics Faculty' },
    { id: 'c12-phy-2', videoId: 'B5NN6gJcTvQ', title: 'Current Electricity – One Shot Revision', subject: 'physics', classLevel: 'class-12', badge: '', rating: 4.8, learners: '24k', instructor: 'Physics Faculty' },
    { id: 'c12-phy-3', videoId: 'G4YkBM7ppYc', title: 'Ray Optics – Full Chapter NEET', subject: 'physics', classLevel: 'class-12', badge: 'Popular', rating: 4.8, learners: '19k', instructor: 'Physics Faculty' },
    { id: 'c12-chem-1', videoId: 'y0KcXKr6JOg', title: 'Solutions – Physical Chemistry NEET', subject: 'chemistry', classLevel: 'class-12', badge: '', rating: 4.7, learners: '16k', instructor: 'Chemistry Faculty' },
    { id: 'c12-chem-2', videoId: 'WvoP5fJzShw', title: 'Electrochemistry – Complete Chapter', subject: 'chemistry', classLevel: 'class-12', badge: 'Bestseller', rating: 4.9, learners: '21k', instructor: 'Chemistry Faculty' },
    { id: 'c12-bio-1', videoId: '3zIfqFP9E60', title: 'Genetics & Evolution – NEET MahaRevision', subject: 'biology', classLevel: 'class-12', badge: 'Bestseller', rating: 4.9, learners: '32k', instructor: 'Biology Faculty' },
    { id: 'c12-bio-2', videoId: 'gxEbp-gZ1dw', title: 'Human Reproduction – Complete Biology', subject: 'biology', classLevel: 'class-12', badge: 'Popular', rating: 4.8, learners: '27k', instructor: 'Biology Faculty' },
    { id: 'c12-bio-3', videoId: 'lJBLBrjWcDs', title: 'Ecology & Environment – One Shot', subject: 'biology', classLevel: 'class-12', badge: '', rating: 4.7, learners: '14k', instructor: 'Biology Faculty' },

    // ─── NEET Special ───
    { id: 'neet-phy', videoId: 'CuTEwYhQPBs', title: 'Complete NEET Physics – Full Syllabus Revision', subject: 'physics', classLevel: 'neet', badge: 'Bestseller', rating: 4.9, learners: '45k', instructor: 'Senior Faculty' },
    { id: 'neet-chem', videoId: 'HKHgzLBoJas', title: 'Complete NEET Chemistry – MahaRevision', subject: 'chemistry', classLevel: 'neet', badge: 'Bestseller', rating: 4.9, learners: '38k', instructor: 'Senior Faculty' },
    { id: 'neet-bio', videoId: 'Ghj48M_T_rQ', title: 'Complete NEET Biology – Full Syllabus in One Shot', subject: 'biology', classLevel: 'neet', badge: 'Bestseller', rating: 4.9, learners: '52k', instructor: 'Senior Faculty' },
    { id: 'neet-pyq', videoId: 'CtRJIXXkh2E', title: 'NEET Previous Year Questions – Top 200 MCQs', subject: 'biology', classLevel: 'neet', badge: 'Popular', rating: 4.8, learners: '30k', instructor: 'Senior Faculty' },
  ];

  /* ── Helpers ── */
  const starSVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  const classLabels = {
    'class-6': 'Class 6', 'class-7': 'Class 7', 'class-8': 'Class 8',
    'class-9': 'Class 9', 'class-10': 'Class 10', 'class-11': 'Class 11',
    'class-12': 'Class 12', 'neet': 'NEET Prep'
  };

  const subjectEmoji = { physics: '🔬', chemistry: '⚗️', biology: '🧬', mathematics: '📐' };

  function createCard(course) {
    const el = document.createElement('article');
    el.className = 'gfg-card';
    el.dataset.class = course.classLevel;
    el.dataset.subject = course.subject;
    el.innerHTML = `
      <div class="gfg-card-thumb" style="background-image: url('https://img.youtube.com/vi/${course.videoId}/mqdefault.jpg');">
        ${course.badge ? `<span class="gfg-card-badge${course.badge === 'Bestseller' ? '' : ' free'}">${course.badge}</span>` : ''}
        <div class="gfg-card-play">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
      <div class="gfg-card-body">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="gfg-card-level">${classLabels[course.classLevel] || course.classLevel}</span>
          <span style="font-size: 0.78rem; color: var(--muted); font-weight: 600;">${subjectEmoji[course.subject] || ''} ${course.subject.charAt(0).toUpperCase() + course.subject.slice(1)}</span>
        </div>
        <h3 class="gfg-card-title">${course.title}</h3>
        <p style="margin: 0 0 8px; color: var(--muted); font-size: 0.85rem;">${course.instructor}</p>
        <div class="gfg-card-stats">
          <span class="gfg-rating">${starSVG} ${course.rating}</span>
          <span>• ${course.learners}+ learners</span>
        </div>
      </div>
      <div class="gfg-card-footer">
        <span class="gfg-price">Free</span>
        <span class="gfg-btn">Watch Now <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
      </div>
    `;
    el.addEventListener('click', () => {
      window.open(`https://www.youtube.com/watch?v=${course.videoId}`, '_blank');
    });
    return el;
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('catalogGrid');
    const emptyState = document.getElementById('catalogEmpty');
    const titleEl = document.getElementById('catalogTitle');
    const countEl = document.getElementById('catalogCount');
    const searchInput = document.getElementById('courseSearch');
    const filterBtns = document.querySelectorAll('.catalog-filter[data-filter]');
    const subjectBtns = document.querySelectorAll('.catalog-filter[data-subject]');

    if (!grid) return;

    let activeFilter = 'all';
    let activeSubject = '';
    let searchTerm = '';

    // Populate sidebar counts
    const countMap = {};
    COURSES.forEach(c => {
      countMap[c.classLevel] = (countMap[c.classLevel] || 0) + 1;
    });
    const countAllEl = document.getElementById('countAll');
    if (countAllEl) countAllEl.textContent = COURSES.length;
    Object.entries(countMap).forEach(([key, val]) => {
      const num = key.replace('class-', 'Class');
      const id = 'count' + (key === 'neet' ? 'Neet' : num.replace('-', ''));
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    // Fix count IDs
    ['6','7','8','9','10','11','12'].forEach(n => {
      const el = document.getElementById('countClass' + n);
      if (el) el.textContent = countMap['class-' + n] || 0;
    });

    function render() {
      grid.innerHTML = '';
      let filtered = COURSES;

      if (activeFilter !== 'all') {
        filtered = filtered.filter(c => c.classLevel === activeFilter);
      }
      if (activeSubject) {
        filtered = filtered.filter(c => c.subject === activeSubject);
      }
      if (searchTerm) {
        filtered = filtered.filter(c =>
          (c.title + ' ' + c.subject + ' ' + c.classLevel + ' ' + c.instructor)
            .toLowerCase().includes(searchTerm)
        );
      }

      if (filtered.length === 0) {
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
        filtered.forEach(c => grid.appendChild(createCard(c)));
      }

      // Update header
      const label = activeFilter === 'all' ? 'All Courses' : (classLabels[activeFilter] || activeFilter);
      const subLabel = activeSubject ? ` — ${activeSubject.charAt(0).toUpperCase() + activeSubject.slice(1)}` : '';
      titleEl.textContent = label + subLabel;
      countEl.textContent = `Showing ${filtered.length} course${filtered.length !== 1 ? 's' : ''}`;
    }

    // Filter by class
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        activeSubject = ''; // reset subject
        subjectBtns.forEach(b => b.classList.remove('active'));
        render();
      });
    });

    // Filter by subject
    subjectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const isActive = btn.classList.contains('active');
        subjectBtns.forEach(b => b.classList.remove('active'));
        if (!isActive) {
          btn.classList.add('active');
          activeSubject = btn.dataset.subject;
        } else {
          activeSubject = '';
        }
        render();
      });
    });

    // Search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        render();
      });
    }

    // Initial render
    render();
  });
})();
