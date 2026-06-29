import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import DateInput from './DateInput';

/**
 * Calendar date field (YYYY-MM-DD). Controlled — the demos wrap it in local
 * state so the popover + selection are fully interactive in isolation.
 *
 * NB: each story renders a named (uppercase) component rather than calling
 * useState inside `render`, which would violate react-hooks/rules-of-hooks and
 * fail the Next.js (Vercel) lint/build.
 */
const meta = {
  title: 'Brand/DateInput',
  component: DateInput,
  tags: ['autodocs'],
  // DateInput has required props (value/onChange). Providing defaults at the
  // meta level satisfies the type for the render-only stories below, which
  // supply their own state and ignore these.
  args: { value: '', onChange: () => {} },
} satisfies Meta<typeof DateInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const today = new Date().toISOString().slice(0, 10);

function EmptyDemo() {
  const [value, setValue] = useState('');
  return <div className="w-64"><DateInput value={value} onChange={setValue} /></div>;
}

function PrefilledDemo() {
  const [value, setValue] = useState('2026-05-01');
  return <div className="w-64"><DateInput value={value} onChange={setValue} /></div>;
}

function MaxTodayDemo() {
  const [value, setValue] = useState('');
  return (
    <div className="w-64">
      <DateInput value={value} onChange={setValue} max={today} placeholder="Date acquired" />
    </div>
  );
}

export const Empty: Story = { render: () => <EmptyDemo /> };

export const Prefilled: Story = { render: () => <PrefilledDemo /> };

export const MaxToday: Story = {
  name: 'Max = today (no future dates)',
  render: () => <MaxTodayDemo />,
};
