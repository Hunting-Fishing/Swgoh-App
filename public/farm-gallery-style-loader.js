if (!document.querySelector('link[data-farm-gallery-tabs="true"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/farm-gallery-tabs.css?v=20260820-farmgallery1';
  link.dataset.farmGalleryTabs = 'true';
  document.head.appendChild(link);
}

if (!document.querySelector('style[data-farm-gallery-compat="true"]')) {
  const style = document.createElement('style');
  style.dataset.farmGalleryCompat = 'true';
  style.textContent = `
    .farm-gallery-tabs-active [data-farm-v3-command],
    .farm-gallery-tabs-active #farmMasterPlan {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}
