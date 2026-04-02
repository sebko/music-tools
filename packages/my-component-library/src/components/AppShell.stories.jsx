import { Settings } from 'lucide-react';
import AppShell from './AppShell';
import NavLink from './NavLink';
import ThemeToggle from './ThemeToggle';

export default {
  title: 'Layouts/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export const Default = {
  args: {
    brandName: 'Music Manager',
    navigation: (
      <>
        <NavLink isActive>Library</NavLink>
        <NavLink>Import</NavLink>
        <NavLink>
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
      </>
    ),
    actions: <ThemeToggle />,
    children: (
      <div className="card-brutalist p-12 text-center">
        <p className="text-foreground/60">Page content goes here</p>
      </div>
    ),
  },
};

export const MinimalHeader = {
  args: {
    brandName: 'My App',
    actions: <ThemeToggle />,
    children: (
      <div className="card-brutalist p-12 text-center">
        <p className="text-foreground/60">Minimal layout with just brand + theme toggle</p>
      </div>
    ),
  },
};

export const CustomBrand = {
  args: {
    brandElement: (
      <a href="#" className="text-xl font-heading text-main hover:text-main-hover transition-colors">
        DJ Tools
      </a>
    ),
    navigation: (
      <>
        <NavLink isActive>Albums</NavLink>
        <NavLink>Singles</NavLink>
      </>
    ),
    actions: <ThemeToggle />,
    children: (
      <div className="card-brutalist p-12 text-center">
        <p className="text-foreground/60">Custom brand element as a link</p>
      </div>
    ),
  },
};
