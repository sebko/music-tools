import { useState } from 'react';
import Pagination from './Pagination';

export default {
  title: 'Patterns/Pagination',
  component: Pagination,
  tags: ['autodocs'],
};

export const Default = {
  render: () => {
    const [page, setPage] = useState(3);
    return <Pagination currentPage={page} totalPages={10} onPageChange={setPage} />;
  },
};

export const FirstPage = {
  args: { currentPage: 1, totalPages: 10, onPageChange: () => {} },
};

export const LastPage = {
  args: { currentPage: 10, totalPages: 10, onPageChange: () => {} },
};

export const SinglePage = {
  args: { currentPage: 1, totalPages: 1, onPageChange: () => {} },
};
