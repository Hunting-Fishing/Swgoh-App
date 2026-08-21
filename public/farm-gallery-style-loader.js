if (!document.querySelector('link[data-farm-gallery-tabs="true"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/farm-gallery-tabs.css?v=20260821-farmgallery2';
  link.dataset.farmGalleryTabs = 'true';
  document.head.appendChild(link);
}

// Enhancement-only policy: Gallery navigation supplements the existing farm surfaces.
// Do not hide the V3 command or Master Plan; those surfaces contain detailed planning
// information and keep their existing handlers/state mounted below the gallery.
if (!document.querySelector('style[data-farm-gallery-compat="true"]')) {
  const style = document.createElement('style');
  style.dataset.farmGalleryCompat = 'true';
  style.textContent = `
    .farm-gallery-tabs-active [data-farm-v3-command],
    .farm-gallery-tabs-active [data-farm-v3-surface],
    .farm-gallery-tabs-active #farmMasterPlan {
      visibility: visible;
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}
