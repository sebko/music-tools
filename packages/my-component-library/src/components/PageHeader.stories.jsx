import PageHeader from './PageHeader';
import FilterToggle from './FilterToggle';
import Button from './Button';

export default {
  title: 'Patterns/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    title: 'Albums',
    subtitle: '1,247 albums in your library',
  },
};

export const WithToolbar = {
  render: () => (
    <PageHeader title="Albums" subtitle="1,247 albums in your library">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterToggle
          filters={[
            { key: 'all', label: 'All' },
            { key: 'matched', label: 'Matched' },
            { key: 'unmatched', label: 'Unmatched' },
          ]}
          activeFilter="all"
          onFilterChange={() => {}}
        />
        <Button variant="primary" size="sm">Scan Library</Button>
      </div>
    </PageHeader>
  ),
};

export const TitleOnly = {
  args: { title: 'Settings' },
};
