import { useState } from 'react';
import SelectBrutalist from './SelectBrutalist';

export default {
  title: 'Components/SelectBrutalist',
  component: SelectBrutalist,
  tags: ['autodocs'],
};

const sortOptions = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'year', label: 'Year' },
  { value: 'added', label: 'Date Added' },
];

export const Default = {
  render: () => {
    const [value, setValue] = useState('title');
    return (
      <div className="w-48">
        <SelectBrutalist
          options={sortOptions}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};

export const WithManyOptions = {
  render: () => {
    const [value, setValue] = useState('flac');
    return (
      <div className="w-48">
        <SelectBrutalist
          options={[
            { value: 'flac', label: 'FLAC' },
            { value: 'mp3-320', label: 'MP3 320' },
            { value: 'mp3-v0', label: 'MP3 V0' },
            { value: 'aac', label: 'AAC' },
            { value: 'ogg', label: 'OGG Vorbis' },
          ]}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};
