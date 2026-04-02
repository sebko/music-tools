/** @type {import('storybook').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-mcp'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
