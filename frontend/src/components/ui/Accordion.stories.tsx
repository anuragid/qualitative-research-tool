import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./Accordion";

const meta = {
  title: "Primitives/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is 5D Analysis?</AccordionTrigger>
        <AccordionContent>
          A five-dimensional qualitative analysis framework that processes research videos through chunks, inferences, patterns, insights, and principles.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>How are videos processed?</AccordionTrigger>
        <AccordionContent>
          Videos are transcribed using AssemblyAI, then analyzed through an AI-powered pipeline.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Can I use my own API key?</AccordionTrigger>
        <AccordionContent>
          Yes! Methodex supports BYOK (Bring Your Own Key) for premium models via OpenRouter.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  name: "Multiple Open",
  render: () => (
    <Accordion type="multiple" className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Chunks</AccordionTrigger>
        <AccordionContent>
          Meaningful segments extracted from transcripts — quotes, facts, observations.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Inferences</AccordionTrigger>
        <AccordionContent>
          Interpretations drawn from individual chunks.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Patterns</AccordionTrigger>
        <AccordionContent>
          Recurring themes identified across all inferences.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
