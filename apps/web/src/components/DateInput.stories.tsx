import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import DateInput from './DateInput';

/**
 * Calendar date field (YYYY-MM-DD). Controlled — the stories wrap it in local
 * state so the popover + selection are fully interactive in isolation.
 */
const meta = {
  title: 'Brand/DateInput',
  component: DateInput,
  tags: ['autodocs'],
} satisfies Meta<typeof DateInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const today = new Date().toISOString().slice(0, 10);

export const Empty: Story = {
  render: () => {
    const [v, setV] = useState('');
    return <div className="w-64"><DateInput value={v} onChange={setV} /></div>;
  },
};

export const Prefilled: Story = {
  render: () => {
    const [v, setV] = useState('2026-05-01');
    return <div className="w-64"><DateInput value={v} onChange={setV} /></div>;
  },
};

export const MaxToday: Story = {
  name: 'Max = today (no future dates)',
  render: () => {
    const [v, setV] = useState('');
    return <div className="w-64"><DateInput value={v} onChange={setV} max={today} placeholder="Date acquired" /></div>;
  },
};
