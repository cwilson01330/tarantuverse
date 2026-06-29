import type { Meta, StoryObj } from '@storybook/react';
import { TarantuverseLogoDark, TarantuverseLogoTransparent } from './TarantuverseLogo';

/**
 * The brand mark. Two variants: a dark-background lockup and a transparent
 * one. Both are plain SVGs and take any SVGProps (width/height/className).
 */
const meta = {
  title: 'Brand/TarantuverseLogo',
  component: TarantuverseLogoTransparent,
  tags: ['autodocs'],
} satisfies Meta<typeof TarantuverseLogoTransparent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Transparent: Story = { render: () => <TarantuverseLogoTransparent width={120} height={120} /> };

export const Dark: Story = { render: () => <TarantuverseLogoDark width={120} height={120} /> };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <TarantuverseLogoTransparent width={32} height={32} />
      <TarantuverseLogoTransparent width={64} height={64} />
      <TarantuverseLogoTransparent width={120} height={120} />
    </div>
  ),
};
