import '../src/assets/fonts/fonts.css';
import '../src/styles/base.css';
import './storybook.css';
import { ThemeProvider } from '../src/contexts/ThemeContext';

const preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
