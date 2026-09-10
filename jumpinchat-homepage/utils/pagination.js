const DEFAULT_LABELS = {
  firstLabel: '«',
  previousLabel: '‹',
  nextLabel: '›',
  lastLabel: '»',
};

function validate(options) {
  if (!options) {
    throw new Error('No `options` were passed, aborting.');
  }

  const { currentPage, totalItems, itemsPerPage } = options;
  if (currentPage === undefined || !totalItems || !itemsPerPage) {
    throw new Error('You must define your options object correctly, aborting.');
  }

  if ([currentPage, totalItems, itemsPerPage].some(value => Number.isNaN(Number(value)))) {
    throw new Error('Your options object properties should be numbers, aborting.');
  }
}

/**
 * Page numbers for the `+pagination` template mixin: first/previous/next/last
 * links plus a window of `rangeLength` pages around `currentPage`.
 */
export function createPagination(options) {
  validate(options);

  const currentPage = Number(options.currentPage);
  const totalItems = Number(options.totalItems);
  const itemsPerPage = Number(options.itemsPerPage);
  const firstPage = options.firstPage === undefined ? 1 : Number(options.firstPage);
  const rangeLength = options.rangeLength || 5;
  const labels = { ...DEFAULT_LABELS };
  for (const key of Object.keys(DEFAULT_LABELS)) {
    if (options[key]) {
      labels[key] = options[key];
    }
  }

  const offset = Math.floor(rangeLength / 2);
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const lastPage = firstPage + totalPages - 1;
  const nextPage = currentPage + 1 > lastPage ? null : currentPage + 1;
  const previousPage = currentPage - 1 < firstPage ? null : currentPage - 1;

  let rangeStart = currentPage - offset;
  rangeStart = lastPage < rangeStart + rangeLength ? lastPage - rangeLength + 1 : rangeStart;
  rangeStart = rangeStart < firstPage ? firstPage : rangeStart;

  let rangeEnd = currentPage + offset;
  rangeEnd = rangeEnd < rangeLength ? rangeLength : rangeEnd;
  rangeEnd = rangeEnd > lastPage ? lastPage : rangeEnd;

  const range = [];
  if (firstPage !== currentPage) {
    range.push({ page: firstPage, isFirst: true, label: labels.firstLabel });
  }
  if (previousPage !== null) {
    range.push({ page: previousPage, isPrevious: true, label: labels.previousLabel });
  }
  for (let page = rangeStart; page <= rangeEnd; page += 1) {
    range.push(page === currentPage ? { page, isCurrent: true } : { page });
  }
  if (nextPage) {
    range.push({ page: nextPage, isNext: true, label: labels.nextLabel });
  }
  if (lastPage !== currentPage) {
    range.push({ page: lastPage, isLast: true, label: labels.lastLabel });
  }

  return {
    currentPage,
    totalItems,
    itemsPerPage,
    firstPage,
    rangeLength,
    ...labels,
    offset,
    totalPages,
    lastPage,
    nextPage,
    previousPage,
    rangeStart,
    rangeEnd,
    range,
  };
}
