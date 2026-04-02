import { TagPill } from './TagPill';

export default {
  title: 'Components/TagPill',
  component: TagPill,
  tags: ['autodocs'],
  argTypes: {
    isNew: { control: 'boolean' },
    isRemoved: { control: 'boolean' },
  },
};

export const Default = {
  args: { label: 'Electronic' },
};

export const New = {
  args: { label: 'Hip Hop', isNew: true },
};

export const Removed = {
  args: { label: 'Pop', isRemoved: true },
};

export const AllStates = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <TagPill label="Electronic" />
      <TagPill label="Hip Hop" isNew />
      <TagPill label="Pop" isRemoved />
      <TagPill label="Jazz" />
      <TagPill label="Trap" isNew />
      <TagPill label="Rock" isRemoved />
    </div>
  ),
};
