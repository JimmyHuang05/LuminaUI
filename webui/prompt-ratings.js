(() => {
  const labels = {sfw:'G', r15:'R-15', nsfw:'R-18'};
  const reserved = new Set(['G','SFW','NSFW','PG12','PG-12','R15','R-15','R15+','R-15+','R18','R-18','R18+','R-18+']);
  const level = row => row.content_rating?.level;
  window.promptRatings = {
    labels,
    label: row => labels[level(row)] || '',
    visible: row => ['r15','nsfw'].includes(level(row)),
    tagClass: row => level(row)==='r15' ? 'r15-tag' : 'nsfw-tag',
    normalTags: row => (row.tags||[]).filter(t=>!reserved.has(t.trim().toUpperCase())),
    filterTags: row => [...(labels[level(row)] ? [labels[level(row)]] : []), ...(row.tags||[]).filter(t=>!reserved.has(t.trim().toUpperCase()))],
  };
})();
