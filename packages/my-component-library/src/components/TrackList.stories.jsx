import TrackList from './TrackList';

export default {
  title: 'Patterns/TrackList',
  component: TrackList,
  tags: ['autodocs'],
};

const sampleTracks = [
  { id: 1, trackNumber: 1, title: 'Windowlicker', duration: '6:07' },
  { id: 2, trackNumber: 2, title: 'Nannou', duration: '3:22' },
  { id: 3, trackNumber: 3, title: 'Peek 824545201', duration: '4:48' },
  { id: 4, trackNumber: 4, title: 'Fingerbib', duration: '3:42' },
  { id: 5, trackNumber: 5, title: 'Girl/Boy Song', duration: '4:51' },
];

export const Default = {
  args: { tracks: sampleTracks },
};

export const WithSubtitles = {
  args: {
    tracks: [
      { id: 1, trackNumber: 1, title: 'Blue Monday', subtitle: 'New Order', duration: '7:29' },
      { id: 2, trackNumber: 2, title: 'Tainted Love', subtitle: 'Soft Cell', duration: '2:35' },
      { id: 3, trackNumber: 3, title: 'Bizarre Love Triangle', subtitle: 'New Order', duration: '4:22' },
      { id: 4, trackNumber: 4, title: 'Personal Jesus', subtitle: 'Depeche Mode', duration: '3:44' },
    ],
  },
};

export const Clickable = {
  args: {
    tracks: sampleTracks,
    onTrackClick: (track) => console.log('Clicked:', track.title),
  },
};

export const NoDuration = {
  args: {
    tracks: [
      { id: 1, title: 'Track One' },
      { id: 2, title: 'Track Two' },
      { id: 3, title: 'Track Three' },
    ],
  },
};
