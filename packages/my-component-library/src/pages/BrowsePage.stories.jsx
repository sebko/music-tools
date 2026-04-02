import { useState } from 'react';
import { Settings, Music } from 'lucide-react';
import AppShell from '../components/AppShell';
import NavLink from '../components/NavLink';
import ThemeToggle from '../components/ThemeToggle';
import PageHeader from '../components/PageHeader';
import Toolbar from '../components/Toolbar';
import FilterToggle from '../components/FilterToggle';
import SearchInput from '../components/SearchInput';
import CardGrid from '../components/CardGrid';
import MediaCard from '../components/MediaCard';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';

export default {
  title: 'Pages/BrowsePage',
  parameters: {
    layout: 'fullscreen',
  },
};

const albums = [
  { id: 1, title: 'Selected Ambient Works 85-92', artist: 'Aphex Twin', year: 1992, matched: true, hd: true },
  { id: 2, title: 'Homogenic', artist: 'Bjork', year: 1997, matched: true, hd: false },
  { id: 3, title: 'Dummy', artist: 'Portishead', year: 1994, matched: false, hd: true },
  { id: 4, title: 'Endtroducing.....', artist: 'DJ Shadow', year: 1996, matched: true, hd: true },
  { id: 5, title: 'Mezzanine', artist: 'Massive Attack', year: 1998, matched: false, hd: false },
  { id: 6, title: 'Music Has the Right to Children', artist: 'Boards of Canada', year: 1998, matched: true, hd: true },
  { id: 7, title: 'Debut', artist: 'Bjork', year: 1993, matched: false, hd: false },
  { id: 8, title: 'Maxinquaye', artist: 'Tricky', year: 1995, matched: true, hd: true },
  { id: 9, title: 'Third', artist: 'Portishead', year: 2008, matched: false, hd: false },
  { id: 10, title: 'Geogaddi', artist: 'Boards of Canada', year: 2002, matched: true, hd: true },
];

export const Default = {
  render: () => {
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const filtered = albums.filter((a) => {
      if (filter === 'matched') return a.matched;
      if (filter === 'unmatched') return !a.matched;
      return true;
    }).filter((a) =>
      !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.artist.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <AppShell
        brandName="Music Manager"
        navigation={
          <>
            <NavLink isActive>Library</NavLink>
            <NavLink>Import</NavLink>
            <NavLink><Settings className="w-4 h-4" /> Settings</NavLink>
          </>
        }
        actions={<ThemeToggle />}
      >
        <PageHeader
          title="Albums"
          subtitle={`${filtered.length} albums in your library`}
        >
          <Toolbar
            left={
              <FilterToggle
                filters={[
                  { key: 'all', label: 'All' },
                  { key: 'matched', label: 'Matched' },
                  { key: 'unmatched', label: 'Unmatched' },
                ]}
                activeFilter={filter}
                onFilterChange={setFilter}
              />
            }
            right={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search albums..."
                className="w-56"
              />
            }
          />
        </PageHeader>

        {filtered.length > 0 ? (
          <>
            <CardGrid>
              {filtered.map((album) => (
                <MediaCard
                  key={album.id}
                  imageSrc={`https://picsum.photos/seed/album${album.id}/400/400`}
                  title={album.title}
                  subtitle={album.artist}
                  badges={
                    <>
                      {album.matched && <Badge variant="success" position="bottom-right">✓</Badge>}
                      {album.hd && <Badge variant="accent" position="bottom-left">HD</Badge>}
                    </>
                  }
                />
              ))}
            </CardGrid>
            <Pagination
              currentPage={page}
              totalPages={5}
              onPageChange={setPage}
              className="mt-8"
            />
          </>
        ) : (
          <EmptyState
            icon={<Music className="w-16 h-16" />}
            heading={search ? `No results for '${search}'` : 'No albums found'}
            description={search ? 'Try adjusting your search terms.' : 'Start by scanning your music library.'}
          />
        )}
      </AppShell>
    );
  },
};

export const EmptyLibrary = {
  render: () => (
    <AppShell
      brandName="Music Manager"
      navigation={<NavLink isActive>Library</NavLink>}
      actions={<ThemeToggle />}
    >
      <PageHeader title="Albums" subtitle="0 albums in your library" />
      <EmptyState
        icon={<Music className="w-16 h-16" />}
        heading="No albums yet"
        description="Add a music directory to start building your library."
      />
    </AppShell>
  ),
};
