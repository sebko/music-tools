import { Settings } from 'lucide-react';
import NavLink from './NavLink';

export default {
  title: 'Layouts/NavLink',
  component: NavLink,
  tags: ['autodocs'],
  argTypes: {
    isActive: { control: 'boolean' },
  },
};

export const Default = {
  args: { children: 'Albums' },
};

export const Active = {
  args: { children: 'Albums', isActive: true },
};

export const WithIcon = {
  args: {
    children: (
      <>
        <Settings className="w-4 h-4" />
        Settings
      </>
    ),
  },
};

export const NavigationGroup = {
  render: () => (
    <nav className="flex items-center gap-2">
      <NavLink isActive>Library</NavLink>
      <NavLink>Import</NavLink>
      <NavLink>
        <Settings className="w-4 h-4" />
        Settings
      </NavLink>
    </nav>
  ),
};

export const AsChild = {
  render: () => (
    <NavLink asChild isActive>
      <a href="#albums">Albums</a>
    </NavLink>
  ),
};
