function injectStylesheet() {
  if (document.querySelector('link[data-tb-rote-professional]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/tb-rote-professional.css?v=20260821-tbpro1';
  link.dataset.tbRoteProfessional = 'true';
  document.head.appendChild(link);
}

if (typeof document !== 'undefined') injectStylesheet();

export { injectStylesheet };
