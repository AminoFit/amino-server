'use client';
import { Dispatch, SetStateAction } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';

interface PaginationProps {
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  totalItems: number;
  itemsPerPage?: number;
  maxVisiblePages?: number;
}

const { floor, min, max } = Math;
const range = (lo: number, hi: number) => Array.from({ length: hi - lo }, (_, i) => i + lo);

const pagination = (count: number, ellipsis = '...') => (page: number, total: number) => {
  const start = max(1, min(page - floor((count - 3) / 2), total - count + 2));
  const end = min(total, max(page + floor((count - 2) / 2), count - 1));
  return [
    ...(start > 2 ? [1, ellipsis] : start > 1 ? [1] : []),
    ...range(start, end + 1),
    ...(end < total - 1 ? [ellipsis, total] : end < total ? [total] : []),
  ];
};

const Pagination = ({
  currentPage,
  setCurrentPage,
  totalItems,
  itemsPerPage = 10,
  maxVisiblePages = 10,
}: PaginationProps) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePageClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const renderPageNumbers = () => {
    const pages = pagination(maxVisiblePages)(currentPage, totalPages);

    return pages.map((page, index) => {
      if (typeof page === 'number') {
        return (
          <button
            key={index}
            onClick={() => handlePageClick(page)}
            className={`relative inline-flex items-center justify-center w-12 px-4 py-2 text-sm font-semibold ${
              currentPage === page
                ? 'z-10 bg-indigo-600 text-white'
                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
            } focus:z-20 focus:outline-offset-0`}
          >
            {page}
          </button>
        );
      } else {
        return (
          <span key={index} className="relative inline-flex items-center justify-center w-12 px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
            {page}
          </span>
        );
      }
    });
  };

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={handlePreviousPage}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Previous
        </button>
        <button
          onClick={handleNextPage}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium">
              {currentPage * itemsPerPage > totalItems ? totalItems : currentPage * itemsPerPage}
            </span>{' '}
            of <span className="font-medium">{totalItems}</span> results
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={handlePreviousPage}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
            >
              <span className="sr-only">Previous</span>
              <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            {renderPageNumbers()}
            <button
              onClick={handleNextPage}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
            >
              <span className="sr-only">Next</span>
              <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
