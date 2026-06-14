/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS  —  RAG Upload UI  v1.0
 *  Handles the rag-upload.html page interactions:
 *   - Drag-and-drop + file picker
 *   - Progress reporting during extraction
 *   - Form validation and submission
 *   - Document list rendering + filtering + deletion
 *   - Stats dashboard update
 * ═══════════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM refs ── */
  const uploadZone      = document.getElementById('uploadZone');
  const fileInput       = document.getElementById('fileInput');
  const filePreview     = document.getElementById('filePreview');
  const fpIcon          = document.getElementById('fpIcon');
  const fpName          = document.getElementById('fpName');
  const fpSize          = document.getElementById('fpSize');
  const fpRemove        = document.getElementById('fpRemove');
  const progressWrap    = document.getElementById('progressWrap');
  const progressFill    = document.getElementById('progressFill');
  const progressStatus  = document.getElementById('progressStatus');
  const progressPct     = document.getElementById('progressPct');
  const extractedPrev   = document.getElementById('extractedPreview');
  const epContent       = document.getElementById('epContent');
  const epWordCount     = document.getElementById('epWordCount');
  const docTitle        = document.getElementById('docTitle');
  const docClass        = document.getElementById('docClass');
  const docSubject      = document.getElementById('docSubject');
  const docExam         = document.getElementById('docExam');
  const docChapter      = document.getElementById('docChapter');
  const uploadBtn       = document.getElementById('uploadBtn');
  const statusMsg       = document.getElementById('statusMsg');
  const docList         = document.getElementById('docList');
  const docCountBadge   = document.getElementById('docCountBadge');
  const refreshDocsBtn  = document.getElementById('refreshDocsBtn');
  const filterRow       = document.getElementById('filterRow');
  const statDocs        = document.getElementById('statDocs');
  const statChunks      = document.getElementById('statChunks');
  const statSubjects    = document.getElementById('statSubjects');
  const toast           = document.getElementById('toast');

  let selectedFile   = null;
  let extractedText  = '';
  let allDocs        = [];
  let activeFilter   = 'all';

  /* ─────────────────────────────────────────────────────────────
     TOAST
  ───────────────────────────────────────────────────────────── */
  function showToast(msg, type = 'success') {
    toast.className = `toast show ${type}`;
    toast.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + msg;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.classList.remove('show'); }, 4000);
  }

  /* ─────────────────────────────────────────────────────────────
     STATUS MESSAGE
  ───────────────────────────────────────────────────────────── */
  function setStatus(msg, type) {
    statusMsg.className = `status-msg ${type}`;
    statusMsg.innerHTML = msg;
  }
  function clearStatus() { statusMsg.className = 'status-msg'; statusMsg.innerHTML = ''; }

  /* ─────────────────────────────────────────────────────────────
     PROGRESS
  ───────────────────────────────────────────────────────────── */
  function setProgress(pct, status) {
    progressWrap.classList.add('active');
    progressFill.style.width = pct + '%';
    progressStatus.textContent = status;
    progressPct.textContent = Math.round(pct) + '%';
  }
  function hideProgress() {
    progressWrap.classList.remove('active');
    progressFill.style.width = '0%';
  }

  /* ─────────────────────────────────────────────────────────────
     FILE ICON
  ───────────────────────────────────────────────────────────── */
  function fileIcon(file) {
    if (!file) return '📄';
    if (file.type === 'application/pdf') return '📕';
    if (file.type.startsWith('image/')) return '🖼️';
    return '📝';
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /* ─────────────────────────────────────────────────────────────
     FILE SELECTION
  ───────────────────────────────────────────────────────────── */
  function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;

    // Show preview
    fpIcon.textContent = fileIcon(file);
    fpName.textContent = file.name;
    fpSize.textContent = formatBytes(file.size) + ' · ' + (file.type || 'unknown type');
    filePreview.classList.add('active');

    // Auto-fill title
    if (!docTitle.value) {
      docTitle.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }

    // Auto-extract text immediately for preview
    extractAndPreview(file);

    uploadBtn.disabled = false;
    clearStatus();
  }

  async function extractAndPreview(file) {
    extractedText = '';
    setProgress(5, 'Starting extraction…');
    extractedPrev.classList.remove('active');

    try {
      extractedText = await window.RAGEngine.extractText(file, (pct, status) => {
        setProgress(pct, status);
      });

      if (extractedText && extractedText.length > 10) {
        hideProgress();
        extractedPrev.classList.add('active');
        epContent.textContent = extractedText.slice(0, 1000) + (extractedText.length > 1000 ? '…' : '');
        const wc = extractedText.split(/\s+/).filter(Boolean).length;
        epWordCount.textContent = `~${wc.toLocaleString()} words extracted`;
      } else {
        hideProgress();
        setStatus('⚠️ Could not extract readable text from this file. Try a different format.', 'error');
      }
    } catch (err) {
      hideProgress();
      setStatus('❌ Extraction failed: ' + err.message, 'error');
    }
  }

  /* File input change */
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
  });

  /* Remove file */
  fpRemove.addEventListener('click', () => {
    selectedFile = null;
    extractedText = '';
    fileInput.value = '';
    filePreview.classList.remove('active');
    extractedPrev.classList.remove('active');
    hideProgress();
    uploadBtn.disabled = true;
    clearStatus();
  });

  /* Drag and drop */
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  /* ─────────────────────────────────────────────────────────────
     FORM VALIDATION
  ───────────────────────────────────────────────────────────── */
  function validateForm() {
    const errors = [];
    if (!selectedFile)          errors.push('Please select a file.');
    if (!docTitle.value.trim()) errors.push('Please enter a document title.');
    if (!docClass.value)        errors.push('Please select a class level.');
    if (!docSubject.value)      errors.push('Please select a subject.');
    if (!docExam.value)         errors.push('Please select a board / exam.');
    return errors;
  }

  /* ─────────────────────────────────────────────────────────────
     UPLOAD HANDLER
  ───────────────────────────────────────────────────────────── */
  uploadBtn.addEventListener('click', async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setStatus('⚠️ ' + errors[0], 'error');
      return;
    }

    uploadBtn.disabled = true;
    clearStatus();
    setStatus('⏳ Processing and uploading…', 'loading');

    const teacherEmail = window.DrAuth?.getUser()?.email || 'unknown';
    const institutionId = window.DrAuth?.getInstitutionId() || '';

    const meta = {
      title:          docTitle.value.trim(),
      class_level:    docClass.value,
      subject:        docSubject.value,
      exam_category:  docExam.value,
      chapter:        docChapter.value.trim(),
      uploaded_by:    teacherEmail,
      institution_id: institutionId
    };

    try {
      const result = await window.RAGEngine.processAndSaveFile(
        selectedFile,
        meta,
        (pct, status) => setProgress(pct, status)
      );

      hideProgress();

      if (result.success) {
        setStatus(
          `✅ <strong>${result.chunks} chunks</strong> saved! (~${result.words?.toLocaleString() || 0} words indexed). Students can now ask questions grounded in this material.`,
          'success'
        );
        showToast(`"${meta.title}" uploaded — ${result.chunks} chunks indexed!`);

        // Reset form
        fpRemove.click();
        docTitle.value   = '';
        docClass.value   = '';
        docSubject.value = '';
        docExam.value    = '';
        docChapter.value = '';

        // Refresh docs list
        await loadDocuments();
      } else {
        setStatus('❌ Upload failed: ' + (result.error || 'Unknown error'), 'error');
        showToast(result.error || 'Upload failed', 'error');
      }
    } catch (err) {
      hideProgress();
      setStatus('❌ Error: ' + err.message, 'error');
      showToast(err.message, 'error');
    } finally {
      uploadBtn.disabled = false;
    }
  });

  /* ─────────────────────────────────────────────────────────────
     DOCUMENT LIST
  ───────────────────────────────────────────────────────────── */
  const DOC_ICONS = {
    pdf: '📕', image: '🖼️', text: '📝'
  };

  function renderDocList(docs) {
    if (!docs || docs.length === 0) {
      docList.innerHTML = `
        <div class="doc-list-empty">
          <div style="font-size:2.5rem">📂</div>
          <p>No documents uploaded yet.<br>Upload your first study material above.</p>
        </div>`;
      docCountBadge.textContent = '0 docs';
      return;
    }

    docCountBadge.textContent = docs.length + ' doc' + (docs.length !== 1 ? 's' : '');

    docList.innerHTML = docs.map(doc => {
      const icon = DOC_ICONS[doc.file_type] || '📄';
      const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '';
      const chunks = doc.total_chunks || 1;
      return `
        <div class="doc-item" data-id="${doc.id}">
          <div class="doc-item-icon">${icon}</div>
          <div class="doc-item-info">
            <div class="doc-item-title" title="${escHtml(doc.title)}">${escHtml(doc.title)}</div>
            <div class="doc-item-meta">
              ${doc.class_level ? `<span class="doc-meta-pill dmp-class">Class ${escHtml(doc.class_level)}</span>` : ''}
              ${doc.subject     ? `<span class="doc-meta-pill dmp-subj">${escHtml(doc.subject)}</span>` : ''}
              ${doc.exam_category ? `<span class="doc-meta-pill dmp-exam">${escHtml(doc.exam_category)}</span>` : ''}
              <span class="doc-meta-pill dmp-chunks">${chunks} chunk${chunks !== 1 ? 's' : ''}</span>
            </div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:4px;">
              ${doc.chapter ? '📑 ' + escHtml(doc.chapter) + ' · ' : ''}${date}
            </div>
          </div>
          <div class="doc-item-actions">
            <button class="btn-del" data-doc='${JSON.stringify({source_name:doc.source_name,uploaded_by:doc.uploaded_by,class_level:doc.class_level,subject:doc.subject,title:doc.title})}'>Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Wire delete buttons
    docList.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docMeta = JSON.parse(btn.dataset.doc);
        if (!confirm(`Delete "${docMeta.title}" and all its chunks from the knowledge base?`)) return;
        btn.textContent = '…';
        btn.disabled = true;
        const result = await window.RAGEngine.deleteDocument(docMeta);
        if (result.success) {
          showToast(`"${docMeta.title}" deleted.`);
          await loadDocuments();
        } else {
          showToast('Delete failed: ' + result.error, 'error');
          btn.textContent = 'Delete';
          btn.disabled = false;
        }
      });
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function loadDocuments() {
    const teacherEmail = window.DrAuth?.getUser()?.email || '';
    const institutionId = window.DrAuth?.getInstitutionId() || '';

    // Load docs for this teacher (or all if admin)
    const filters = { institution_id: institutionId };
    if (window.DrAuth?.getRole() === 'teacher') {
      filters.uploaded_by = teacherEmail;
    }

    allDocs = await window.RAGEngine.getDocumentList(filters);
    applyFilter(activeFilter);
    updateStats(allDocs);
  }

  function applyFilter(filter) {
    activeFilter = filter;
    const filtered = filter === 'all'
      ? allDocs
      : allDocs.filter(d => d.subject === filter);
    renderDocList(filtered);
  }

  function updateStats(docs) {
    statDocs.textContent = docs.length;
    const totalChunks = docs.reduce((sum, d) => sum + (d.total_chunks || 1), 0);
    statChunks.textContent = totalChunks > 999 ? (totalChunks / 1000).toFixed(1) + 'k' : totalChunks;
    const subjects = new Set(docs.map(d => d.subject).filter(Boolean));
    statSubjects.textContent = subjects.size;
  }

  /* Filter chips */
  filterRow.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFilter(chip.dataset.filter);
    });
  });

  refreshDocsBtn.addEventListener('click', loadDocuments);

  /* ─────────────────────────────────────────────────────────────
     INIT — Wait for auth then load
  ───────────────────────────────────────────────────────────── */
  (async () => {
    // Wait briefly for auth guard to resolve
    await new Promise(r => setTimeout(r, 600));
    await loadDocuments();
  })();

});
