import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
} from "./combobox";
import { ModelOption } from "../settings/ModelOption";

const meta = {
  title: "Primitives/Combobox",
  component: Combobox,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Searchable autocomplete input with a dropdown list of suggestions.\n\n" +
          "**When to use:** Choosing from a large or dynamic list where search is helpful (e.g., model picker, user search).\n\n" +
          "**When NOT to use:** Small static lists with <7 options (use Select or ToggleGroup instead).",
      },
    },
  },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"];

export const Default: Story = {
  render: () => (
    <div className="w-[280px]">
      <Combobox items={frameworks}>
        <ComboboxInput placeholder="Select a framework..." />
        <ComboboxContent>
          <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    await expect(input).toBeInTheDocument();

    await userEvent.click(input);
    await userEvent.type(input, "Nux");

    const body = within(document.body);
    const option = await body.findByText("Nuxt.js");
    await expect(option).toBeInTheDocument();
  },
};

type Framework = {
  label: string;
  value: string;
  category: string;
};

const frameworkObjects: Framework[] = [
  { label: "Next.js", value: "next", category: "React" },
  { label: "Remix", value: "remix", category: "React" },
  { label: "SvelteKit", value: "sveltekit", category: "Svelte" },
  { label: "Nuxt", value: "nuxt", category: "Vue" },
  { label: "Astro", value: "astro", category: "Multi" },
];

export const WithObjects: Story = {
  render: () => (
    <div className="w-[280px]">
      <Combobox
        items={frameworkObjects}
        itemToStringLabel={(f) => f.label}
        itemToStringValue={(f) => f.value}
      >
        <ComboboxInput placeholder="Search frameworks..." />
        <ComboboxContent>
          <ComboboxEmpty>No match.</ComboboxEmpty>
          <ComboboxList>
            {(framework) => (
              <ComboboxItem key={framework.value} value={framework}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{framework.label}</span>
                  <span className="text-xs text-text-tertiary">
                    {framework.category}
                  </span>
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <div className="w-[280px]">
      <Combobox items={frameworks}>
        <ComboboxInput placeholder="Select framework..." />
        <ComboboxContent>
          <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
          <ComboboxGroup>
            <ComboboxLabel>Popular</ComboboxLabel>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxGroup>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
};

export const Empty: Story = {
  name: "Empty State",
  render: () => (
    <div className="w-[280px]">
      <Combobox items={[] as string[]}>
        <ComboboxInput placeholder="Search..." />
        <ComboboxContent>
          <ComboboxEmpty>No results found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.type(input, "xyz");

    const body = within(document.body);
    const empty = await body.findByText("No results found.");
    await expect(empty).toBeInTheDocument();
  },
};

// Domain-specific: Model search pattern
interface MockModel {
  id: string;
  name: string;
  provider: string;
  is_free: boolean;
  context_length: number | null;
}

const mockModels: MockModel[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic", is_free: false, context_length: 200000 },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "Openai", is_free: false, context_length: 128000 },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", provider: "Meta", is_free: true, context_length: 512000 },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", is_free: false, context_length: 1000000 },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", provider: "Deepseek", is_free: true, context_length: 128000 },
];

export const ModelSearch: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Model search combobox pattern using the `ModelOption` component. " +
          "In production, results come from the OpenRouter search endpoint.",
      },
    },
  },
  render: () => {
    const [selected, setSelected] = React.useState<MockModel | null>(null);

    return (
      <div className="w-[320px]">
        <Combobox
          items={mockModels}
          itemToStringLabel={(m) => m.name}
          itemToStringValue={(m) => m.id}
          value={selected}
          onValueChange={setSelected}
        >
          <ComboboxInput placeholder="Search models..." />
          <ComboboxContent>
            <ComboboxEmpty>Type to search models</ComboboxEmpty>
            <ComboboxList>
              {(model) => (
                <ComboboxItem key={model.id} value={model}>
                  <ModelOption
                    name={model.name}
                    provider={model.provider}
                    isFree={model.is_free}
                    contextLength={model.context_length}
                  />
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {selected && (
          <p className="mt-3 text-xs text-text-tertiary">
            Selected: {selected.name} ({selected.id})
          </p>
        )}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.type(input, "Claude");

    const body = within(document.body);
    const option = await body.findByText("Claude Sonnet 4.6");
    await expect(option).toBeInTheDocument();

    // Check secondary info renders
    const provider = await body.findByText(/Anthropic/);
    await expect(provider).toBeInTheDocument();
  },
};

export const AsyncModelSearch: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Async search pattern matching production usage: `filteredItems` + `filter={null}` " +
          "disables client-side filtering so the combobox only shows server-provided results. " +
          "Uses `onInputValueChange` to trigger external search.",
      },
    },
  },
  render: () => {
    const [selected, setSelected] = React.useState<MockModel | null>(null);
    const [filtered, setFiltered] = React.useState<MockModel[]>([]);
    const [emptyMsg, setEmptyMsg] = React.useState("Type to search models");

    const handleInputChange = React.useCallback((value: string) => {
      if (value.length < 2) {
        setFiltered([]);
        setEmptyMsg("Type to search models");
        return;
      }
      setEmptyMsg("Searching...");
      // Simulate server search
      const q = value.toLowerCase();
      setFiltered(
        mockModels.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q),
        ),
      );
      setEmptyMsg("No models found");
    }, []);

    return (
      <div className="w-[320px]">
        <Combobox
          items={mockModels}
          filteredItems={filtered}
          filter={null}
          itemToStringLabel={(m) => m.name}
          itemToStringValue={(m) => m.id}
          onInputValueChange={handleInputChange}
          value={selected}
          onValueChange={setSelected}
        >
          <ComboboxInput placeholder="Search models..." />
          <ComboboxContent>
            <ComboboxEmpty>{emptyMsg}</ComboboxEmpty>
            <ComboboxList>
              {(model) => (
                <ComboboxItem key={model.id} value={model}>
                  <ModelOption
                    name={model.name}
                    provider={model.provider}
                    isFree={model.is_free}
                    contextLength={model.context_length}
                  />
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {selected && (
          <p className="mt-3 text-xs text-text-tertiary">
            Selected: {selected.name} ({selected.id})
          </p>
        )}
      </div>
    );
  },
};
