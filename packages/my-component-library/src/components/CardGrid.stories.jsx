import CardGrid from './CardGrid';

export default {
  title: 'Patterns/CardGrid',
  component: CardGrid,
  tags: ['autodocs'],
  argTypes: {
    density: {
      control: 'select',
      options: ['compact', 'default', 'relaxed'],
    },
  },
};

const PlaceholderCard = ({ index }) => (
  <div className="card-brutalist p-4">
    <div className="aspect-square bg-background-secondary rounded-base border-2 border-border mb-2" />
    <div className="text-sm font-heading truncate">Album {index + 1}</div>
    <div className="text-xs text-foreground/60 truncate">Artist Name</div>
  </div>
);

export const Default = {
  render: (args) => (
    <CardGrid {...args}>
      {Array.from({ length: 12 }, (_, i) => (
        <PlaceholderCard key={i} index={i} />
      ))}
    </CardGrid>
  ),
};

export const Compact = {
  render: () => (
    <CardGrid density="compact">
      {Array.from({ length: 12 }, (_, i) => (
        <PlaceholderCard key={i} index={i} />
      ))}
    </CardGrid>
  ),
};

export const Relaxed = {
  render: () => (
    <CardGrid density="relaxed">
      {Array.from({ length: 8 }, (_, i) => (
        <PlaceholderCard key={i} index={i} />
      ))}
    </CardGrid>
  ),
};

export const FewItems = {
  render: () => (
    <CardGrid>
      {Array.from({ length: 3 }, (_, i) => (
        <PlaceholderCard key={i} index={i} />
      ))}
    </CardGrid>
  ),
};
