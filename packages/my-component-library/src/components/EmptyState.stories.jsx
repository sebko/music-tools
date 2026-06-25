import { Music, Search, AlertCircle } from 'lucide-react';
import EmptyState from './EmptyState';
import Button from './Button';

export default {
  title: 'Patterns/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    icon: <Music className="w-16 h-16" />,
    heading: 'No albums yet',
    description: 'Start by scanning your music library to see your collection here.',
  },
};

export const WithAction = {
  args: {
    icon: <Music className="w-16 h-16" />,
    heading: 'No albums yet',
    description: 'Connect your music library to get started.',
    action: <Button variant="primary">Scan Library</Button>,
  },
};

export const SearchNoResults = {
  args: {
    icon: <Search className="w-16 h-16" />,
    heading: "No results for 'Aphex Twin'",
    description: 'Try adjusting your search terms or clearing filters.',
    action: <Button variant="secondary" size="sm">Clear Search</Button>,
  },
};

export const ErrorState = {
  args: {
    icon: <AlertCircle className="w-16 h-16" />,
    heading: 'Something went wrong',
    description: 'Failed to load your library. Please try again.',
    action: <Button variant="destructive" size="sm">Retry</Button>,
  },
};

export const Minimal = {
  args: {
    heading: 'Nothing here',
  },
};
