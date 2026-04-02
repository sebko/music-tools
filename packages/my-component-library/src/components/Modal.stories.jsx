import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

export default {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    maxWidth: {
      control: 'select',
      options: ['max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl'],
    },
    closeOnBackdropClick: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setIsOpen(true)}>
          Open Modal
        </Button>
        <Modal {...args} isOpen={isOpen} onClose={() => setIsOpen(false)}>
          <div className="p-6">
            <h2 className="text-lg font-heading mb-4">Modal Title</h2>
            <p className="text-foreground/70 mb-6">This is the modal content.</p>
            <Button variant="primary" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      </>
    );
  },
};

export const Wide = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>Open Wide Modal</Button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} maxWidth="max-w-xl">
          <div className="p-6">
            <h2 className="text-lg font-heading mb-4">Wide Modal</h2>
            <p className="text-foreground/70">This modal uses max-w-xl.</p>
          </div>
        </Modal>
      </>
    );
  },
};

export const NoBackdropClose = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>Open Persistent Modal</Button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} closeOnBackdropClick={false}>
          <div className="p-6">
            <h2 className="text-lg font-heading mb-4">Persistent Modal</h2>
            <p className="text-foreground/70 mb-6">Clicking the backdrop won't close this modal.</p>
            <Button variant="primary" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      </>
    );
  },
};
