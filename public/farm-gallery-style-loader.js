if (!document.querySelector('link[data-farm-gallery-tabs="true"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/farm-gallery-tabs.css?v=20260820-farmgallery1';
  link.dataset.farmGalleryTabs = 'true';
  document.head.appendChild(link);
}
