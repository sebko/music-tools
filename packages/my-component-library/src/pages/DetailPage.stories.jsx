import { ArrowLeft, Music, Settings } from 'lucide-react';
import AppShell from '../components/AppShell';
import NavLink from '../components/NavLink';
import ThemeToggle from '../components/ThemeToggle';
import DetailLayout from '../components/DetailLayout';
import TrackList from '../components/TrackList';
import { TagPill } from '../components/TagPill';
import Button from '../components/Button';

export default {
  title: 'Pages/DetailPage',
  parameters: {
    layout: 'fullscreen',
  },
};

const tracks = [
  { id: 1, trackNumber: 1, title: 'Xtal', duration: '4:54' },
  { id: 2, trackNumber: 2, title: 'Tha', subtitle: 'feat. St Etienne', duration: '9:01' },
  { id: 3, trackNumber: 3, title: 'Pulsewidth', duration: '3:47' },
  { id: 4, trackNumber: 4, title: 'Ageispolis', duration: '5:23' },
  { id: 5, trackNumber: 5, title: 'i', duration: '1:16' },
  { id: 6, trackNumber: 6, title: 'Green Calx', duration: '6:02' },
  { id: 7, trackNumber: 7, title: 'Heliosphan', duration: '4:52' },
  { id: 8, trackNumber: 8, title: 'We Are the Music Makers', duration: '7:43' },
  { id: 9, trackNumber: 9, title: 'Schottkey 7th Path', duration: '5:08' },
  { id: 10, trackNumber: 10, title: 'Ptolemy', duration: '7:12' },
  { id: 11, trackNumber: 11, title: 'Hedphelym', duration: '6:02' },
  { id: 12, trackNumber: 12, title: 'Delphium', duration: '6:34' },
  { id: 13, trackNumber: 13, title: 'Actium', duration: '7:34' },
];

export const Default = {
  render: () => (
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
      <div className="mb-6 flex items-center justify-between">
        <Button variant="secondary" size="sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button variant="primary" size="sm">Search Metadata</Button>
      </div>

      <div className="space-y-6">
        <DetailLayout
          sidebar={
            <div className="aspect-square rounded-base border-2 border-border overflow-hidden">
              <img
                src="https://picsum.photos/seed/detail1/400/400"
                alt="Album artwork"
                className="w-full h-full object-cover"
              />
            </div>
          }
        >
          <h1 className="text-2xl font-heading text-foreground">Selected Ambient Works 85-92</h1>
          <h3 className="text-lg text-foreground/60 mt-1">Aphex Twin</h3>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <span className="text-xs text-foreground/40 uppercase tracking-wide">Year</span>
              <p className="text-foreground">1992</p>
            </div>
            <div>
              <span className="text-xs text-foreground/40 uppercase tracking-wide">Label</span>
              <p className="text-foreground">Apollo Records</p>
            </div>
            <div>
              <span className="text-xs text-foreground/40 uppercase tracking-wide">Tracks</span>
              <p className="text-foreground">13</p>
            </div>
            <div>
              <span className="text-xs text-foreground/40 uppercase tracking-wide">Format</span>
              <p className="text-foreground">FLAC</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <TagPill label="Electronic" />
            <TagPill label="Ambient" />
            <TagPill label="IDM" />
            <TagPill label="Techno" />
          </div>
        </DetailLayout>

        <div className="card-brutalist p-6">
          <h2 className="text-lg font-heading text-foreground mb-4">Tracks</h2>
          <TrackList tracks={tracks} />
        </div>
      </div>
    </AppShell>
  ),
};

export const NoArtwork = {
  render: () => (
    <AppShell brandName="Music Manager" actions={<ThemeToggle />}>
      <div className="mb-6">
        <Button variant="secondary" size="sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>
      <DetailLayout
        sidebar={
          <div className="aspect-square bg-background-secondary rounded-base border-2 border-border flex items-center justify-center">
            <Music className="w-16 h-16 text-foreground/20" />
          </div>
        }
      >
        <h1 className="text-2xl font-heading text-foreground">Unknown Album</h1>
        <h3 className="text-lg text-foreground/60 mt-1">Unknown Artist</h3>
        <p className="text-foreground/40 mt-4">No metadata available for this album.</p>
      </DetailLayout>
    </AppShell>
  ),
};
