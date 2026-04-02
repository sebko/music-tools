import { Music } from 'lucide-react';
import DetailLayout from './DetailLayout';
import { TagPill } from './TagPill';
import TrackList from './TrackList';

export default {
  title: 'Layouts/DetailLayout',
  component: DetailLayout,
  tags: ['autodocs'],
};

const ArtworkPlaceholder = () => (
  <div className="aspect-square bg-background-secondary rounded-base border-2 border-border flex items-center justify-center">
    <Music className="w-16 h-16 text-foreground/20" />
  </div>
);

export const Default = {
  args: {
    sidebar: <ArtworkPlaceholder />,
    children: (
      <div>
        <h1 className="text-2xl font-heading text-foreground">Selected Ambient Works 85-92</h1>
        <h3 className="text-lg text-foreground/60 mt-1">Aphex Twin</h3>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <span className="text-xs text-foreground/40 uppercase">Year</span>
            <p className="text-foreground">1992</p>
          </div>
          <div>
            <span className="text-xs text-foreground/40 uppercase">Label</span>
            <p className="text-foreground">Apollo Records</p>
          </div>
          <div>
            <span className="text-xs text-foreground/40 uppercase">Tracks</span>
            <p className="text-foreground">13</p>
          </div>
          <div>
            <span className="text-xs text-foreground/40 uppercase">Format</span>
            <p className="text-foreground">FLAC</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <TagPill label="Electronic" />
          <TagPill label="Ambient" />
          <TagPill label="IDM" />
        </div>
      </div>
    ),
  },
};

export const WiderSidebar = {
  args: {
    sidebar: <ArtworkPlaceholder />,
    sidebarWidth: 'w-full md:w-80',
    children: (
      <div>
        <h1 className="text-2xl font-heading text-foreground">Album Title</h1>
        <p className="text-foreground/60 mt-1">Artist Name</p>
      </div>
    ),
  },
};

export const WithTrackList = {
  render: () => (
    <div className="space-y-6">
      <DetailLayout
        sidebar={<ArtworkPlaceholder />}
      >
        <h1 className="text-2xl font-heading text-foreground">Homogenic</h1>
        <h3 className="text-lg text-foreground/60 mt-1">Bjork</h3>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <span className="text-xs text-foreground/40 uppercase">Year</span>
            <p className="text-foreground">1997</p>
          </div>
          <div>
            <span className="text-xs text-foreground/40 uppercase">Label</span>
            <p className="text-foreground">One Little Independent</p>
          </div>
        </div>
      </DetailLayout>
      <div className="card-brutalist p-6">
        <h2 className="text-lg font-heading text-foreground mb-4">Tracks</h2>
        <TrackList
          tracks={[
            { id: 1, trackNumber: 1, title: 'Hunter', duration: '4:14' },
            { id: 2, trackNumber: 2, title: 'Joga', duration: '5:05' },
            { id: 3, trackNumber: 3, title: 'Unravel', duration: '3:55' },
            { id: 4, trackNumber: 4, title: 'Bachelorette', duration: '5:18' },
            { id: 5, trackNumber: 5, title: 'All Neon Like', duration: '4:53' },
          ]}
        />
      </div>
    </div>
  ),
};
