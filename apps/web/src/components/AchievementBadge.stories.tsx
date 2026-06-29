import type { Meta, StoryObj } from '@storybook/react';
import AchievementBadge from './AchievementBadge';

const meta = {
  title: 'Brand/AchievementBadge',
  component: AchievementBadge,
  tags: ['autodocs'],
  argTypes: {
    tier: { control: 'select', options: ['bronze', 'silver', 'gold', 'platinum'] },
    size: { control: 'radio', options: ['small', 'large'] },
    earned: { control: 'boolean' },
  },
  args: {
    id: 'first-molt',
    icon: '🦋',
    name: 'First Molt',
    description: 'Logged your first molt.',
    tier: 'gold',
    earned: true,
    earnedAt: '2026-05-01',
    size: 'large',
  },
} satisfies Meta<typeof AchievementBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Earned: Story = {};

export const Locked: Story = { args: { earned: false, earnedAt: undefined } };

export const Small: Story = { args: { size: 'small' } };

export const AllTiers: Story = {
  render: (args) => (
    <div className="flex gap-4">
      {(['bronze', 'silver', 'gold', 'platinum'] as const).map((tier) => (
        <AchievementBadge key={tier} {...args} tier={tier} name={tier[0].toUpperCase() + tier.slice(1)} />
      ))}
    </div>
  ),
};
