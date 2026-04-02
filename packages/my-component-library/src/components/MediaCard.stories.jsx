import { ZoomIn, Disc } from 'lucide-react';
import MediaCard from './MediaCard';
import Badge from './Badge';

export default {
  title: 'Patterns/MediaCard',
  component: MediaCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};

export const Default = {
  args: {
    imageSrc: 'https://picsum.photos/seed/album1/400/400',
    title: 'Selected Ambient Works 85-92',
    subtitle: 'Aphex Twin',
  },
};

export const WithBadges = {
  args: {
    imageSrc: 'https://picsum.photos/seed/album2/400/400',
    title: 'Homogenic',
    subtitle: 'Bjork',
    badges: (
      <>
        <Badge variant="info" position="top-left">MB</Badge>
        <Badge variant="accent" position="bottom-left">HD</Badge>
        <Badge variant="success" position="bottom-right">✓</Badge>
      </>
    ),
  },
};

export const WithActions = {
  args: {
    imageSrc: 'https://picsum.photos/seed/album3/400/400',
    title: 'Vespertine',
    subtitle: 'Bjork',
    actions: (
      <button className="absolute top-2 right-2 p-1.5 rounded-base bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 w-7 h-7 flex items-center justify-center">
        <ZoomIn className="w-3 h-3" />
      </button>
    ),
  },
};

export const NoImage = {
  args: {
    title: 'Unknown Album',
    subtitle: 'Unknown Artist',
  },
};

export const CustomFallback = {
  args: {
    title: 'My Single',
    subtitle: 'Artist',
    fallbackIcon: <Disc className="w-12 h-12 text-foreground/20" />,
  },
};

export const GridExample = {
  render: () => (
    <div className="grid grid-cols-4 gap-6">
      {['Homogenic', 'Vespertine', 'Post', 'Debut'].map((title, i) => (
        <MediaCard
          key={title}
          imageSrc={`https://picsum.photos/seed/grid${i}/400/400`}
          title={title}
          subtitle="Bjork"
          badges={i === 0 && <Badge variant="success" position="bottom-right">✓</Badge>}
        />
      ))}
    </div>
  ),
  decorators: [],
};
