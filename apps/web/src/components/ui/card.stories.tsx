import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Brazilian Black</CardTitle>
        <CardDescription>Grammostola pulchra</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">
          A docile terrestrial species and a keeper favorite for its jet-black coloration.
        </p>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-gray-400">Last fed 4 days ago</span>
      </CardFooter>
    </Card>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardContent className="pt-6">
        <p className="text-sm">A bare card with content and no header or footer.</p>
      </CardContent>
    </Card>
  ),
};
