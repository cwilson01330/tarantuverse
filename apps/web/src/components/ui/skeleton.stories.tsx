import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton, SkeletonCard, SkeletonList, SkeletonTable } from './skeleton';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    rounded: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'full'] },
    width: { control: 'text' },
    height: { control: 'text' },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {
  args: { width: 'w-48', height: 'h-4', rounded: 'md' },
  decorators: [(S) => <div className="w-80">{S()}</div>],
};

export const Card: Story = { render: () => <div className="w-80"><SkeletonCard /></div> };

export const List: Story = { render: () => <div className="w-80"><SkeletonList count={4} /></div> };

export const Table: Story = { render: () => <div className="w-[28rem]"><SkeletonTable rows={5} /></div> };
