import PageLoader from './PageLoader';

export default {
  title: 'Components/PageLoader',
  component: PageLoader,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
};

export const Default = {
  args: {},
};

export const WithDescription = {
  args: {
    message: 'Scanning library...',
    description: 'Processing 1,247 albums',
  },
};

export const Small = {
  args: {
    message: 'Loading...',
    size: 'small',
  },
};

export const Medium = {
  args: {
    message: 'Fetching metadata...',
    size: 'medium',
  },
};

export const CustomMessage = {
  args: {
    message: 'Matching albums with Redacted...',
    description: 'This may take a few minutes for large libraries',
  },
};
