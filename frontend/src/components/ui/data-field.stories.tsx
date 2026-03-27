import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataField } from "./data-field";

const meta = {
  title: "Composites/DataField",
  component: DataField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Theme",
    children: "Participants expressed frustration with the onboarding flow.",
  },
};

export const ShortContent: Story = {
  args: {
    label: "Status",
    children: "Complete",
  },
};

export const LongContent: Story = {
  args: {
    label: "Summary",
    children:
      "Multiple participants noted that the navigation structure was confusing, particularly when trying to find settings related to their account. Three out of five users attempted to use the search bar instead of the menu, suggesting the information architecture needs revision.",
  },
};

export const WithRichContent: Story = {
  args: {
    label: "Key Quotes",
    children: (
      <ul className="list-disc list-inside space-y-1">
        <li>"I couldn't figure out where to go next."</li>
        <li>"The button didn't look clickable to me."</li>
        <li>"I expected this to take me somewhere else."</li>
      </ul>
    ),
  },
};

export const MultipleFields: Story = {
  render: () => (
    <div className="space-y-4">
      <DataField label="Dimension">Physical</DataField>
      <DataField label="Theme">Workspace ergonomics affect productivity</DataField>
      <DataField label="Evidence">
        6 out of 8 participants mentioned discomfort with their desk setup during remote work sessions.
      </DataField>
      <DataField label="Confidence">High (consistent across interviews)</DataField>
    </div>
  ),
};

export const AnalysisAccordionContent: Story = {
  render: () => (
    <div className="space-y-4 p-4 border border-border-default rounded-lg">
      <DataField label="Code">Navigation Confusion</DataField>
      <DataField label="Description">
        Instances where participants struggled to find features or navigate between sections of the application.
      </DataField>
      <DataField label="Frequency">12 occurrences across 5 videos</DataField>
      <DataField label="Representative Quote">
        "I keep going back to the home page because I can't remember where that setting was."
      </DataField>
    </div>
  ),
};
