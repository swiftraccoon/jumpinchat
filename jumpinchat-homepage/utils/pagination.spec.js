import { expect } from 'chai';
import { createPagination } from './pagination.js';

describe('pagination', () => {
  it('builds the page window with navigation links around the current page', () => {
    const pagination = createPagination({ currentPage: 5, totalItems: 300, itemsPerPage: 30, rangeLength: 9 });
    expect(pagination.totalPages).to.equal(10);
    expect(pagination.lastPage).to.equal(10);
    expect(pagination.previousPage).to.equal(4);
    expect(pagination.nextPage).to.equal(6);
    expect(pagination.range.map(item => item.label || item.page)).to.eql(['«', '‹', 1, 2, 3, 4, 5, 6, 7, 8, 9, '›', '»']);
    expect(pagination.range.find(item => item.isCurrent).page).to.equal(5);
  });

  it('omits navigation that does not apply on the first and last pages', () => {
    const first = createPagination({ currentPage: 1, totalItems: 45, itemsPerPage: 30 });
    expect(first.range).to.eql([{ page: 1, isCurrent: true }, { page: 2 }, { page: 2, isNext: true, label: '›' }, { page: 2, isLast: true, label: '»' }]);

    const last = createPagination({ currentPage: 2, totalItems: 45, itemsPerPage: 30 });
    expect(last.range).to.eql([{ page: 1, isFirst: true, label: '«' }, { page: 1, isPrevious: true, label: '‹' }, { page: 1 }, { page: 2, isCurrent: true }]);
  });

  it('keeps a full window at the end of the list', () => {
    const pagination = createPagination({ currentPage: 10, totalItems: 300, itemsPerPage: 30, rangeLength: 9 });
    expect(pagination.rangeStart).to.equal(2);
    expect(pagination.rangeEnd).to.equal(10);
  });

  it('accepts custom labels and a custom first page', () => {
    const pagination = createPagination({ currentPage: 1, totalItems: 3, itemsPerPage: 1, firstPage: 0, nextLabel: 'next' });
    expect(pagination.firstPage).to.equal(0);
    expect(pagination.range.find(item => item.isNext).label).to.equal('next');
  });

  it('rejects incomplete or non-numeric options', () => {
    expect(() => createPagination()).to.throw('No `options` were passed');
    expect(() => createPagination({ currentPage: 1, totalItems: 0, itemsPerPage: 10 })).to.throw('define your options object correctly');
    expect(() => createPagination({ currentPage: 'x', totalItems: 1, itemsPerPage: 10 })).to.throw('should be numbers');
  });
});
