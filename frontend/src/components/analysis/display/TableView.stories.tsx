import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { TableView } from "./TableView";
import type { TableColumn } from "./TableView";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

interface SampleItem {
  name: string;
  type: string;
  confidence: string;
}

const sampleData: SampleItem[] = [
  { name: "Finding Alpha", type: "surprising", confidence: "high" },
  { name: "Finding Beta", type: "revealing", confidence: "medium" },
  { name: "Finding Gamma", type: "first-principles", confidence: "low" },
];

const sampleColumns: TableColumn<SampleItem>[] = [
  { key: "name", label: "Name", sortable: true, render: (item) => item.name },
  { key: "type", label: "Type", sortable: true, render: (item) => item.type },
  { key: "confidence", label: "Confidence", sortable: true, render: (item) => item.confidence },
];

const columnsWithNonSortable: TableColumn<SampleItem>[] = [
  { key: "name", label: "Name", sortable: true, render: (item) => item.name },
  { key: "type", label: "Type", sortable: false, render: (item) => item.type },
  { key: "confidence", label: "Confidence", render: (item) => item.confidence, className: "w-32" },
];

const meta = {
  title: "Analysis/TableView",
  component: TableView<SampleItem>,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onSort: fn(),
  },
} satisfies Meta<typeof TableView<SampleItem>>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default unsorted table.
 */
export const Default: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    sort: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Check headers
    await expect(canvas.getByText("Name")).toBeInTheDocument();
    await expect(canvas.getByText("Type")).toBeInTheDocument();
    await expect(canvas.getByText("Confidence")).toBeInTheDocument();
    // Check data rows
    await expect(canvas.getByText("Finding Alpha")).toBeInTheDocument();
    await expect(canvas.getByText("Finding Beta")).toBeInTheDocument();
    await expect(canvas.getByText("Finding Gamma")).toBeInTheDocument();
  },
};

/**
 * Clicking a sortable header calls onSort with desc direction for first click.
 */
export const ClickSortableHeader: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    sort: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nameHeader = canvas.getByText("Name");
    await userEvent.click(nameHeader);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "name", direction: "desc" });
  },
};

/**
 * Clicking an already desc-sorted header toggles to asc.
 */
export const ToggleDescToAsc: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    sort: { field: "name", direction: "desc" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nameHeader = canvas.getByText("Name");
    await userEvent.click(nameHeader);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "name", direction: "asc" });
  },
};

/**
 * Clicking an already asc-sorted header clears the sort.
 */
export const ToggleAscToClear: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    sort: { field: "name", direction: "asc" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nameHeader = canvas.getByText("Name");
    await userEvent.click(nameHeader);
    await expect(args.onSort).toHaveBeenCalledWith(null);
  },
};

/**
 * Clicking a non-sortable header does not trigger onSort.
 */
export const NonSortableHeader: Story = {
  args: {
    data: sampleData,
    columns: columnsWithNonSortable,
    sort: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Click the non-sortable "Type" header
    const typeHeader = canvas.getByText("Type");
    await userEvent.click(typeHeader);
    await expect(args.onSort).not.toHaveBeenCalled();
    // Click the sortable "Name" header should still work
    const nameHeader = canvas.getByText("Name");
    await userEvent.click(nameHeader);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "name", direction: "desc" });
  },
};

/**
 * Row click handler fires when provided.
 */
export const WithRowClick: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    sort: null,
    onRowClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getByText("Finding Alpha");
    await userEvent.click(cell);
    await expect(args.onRowClick).toHaveBeenCalledWith(sampleData[0]);
  },
};

/**
 * Interactive demo with real sort state management.
 */
function TableDemo() {
  const [sort, setSort] = useState<SortConfig | null>(null);
  return (
    <div>
      <TableView
        data={sampleData}
        columns={sampleColumns}
        sort={sort}
        onSort={setSort}
      />
      <p data-testid="sort-state" className="mt-4 text-sm text-text-tertiary">
        Sort: {sort ? `${sort.field} (${sort.direction})` : "none"}
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <TableDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initially unsorted
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: none");

    // Click Name header -> desc
    const nameHeader = canvas.getByText("Name");
    await userEvent.click(nameHeader);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: name (desc)");

    // Click again -> asc
    await userEvent.click(nameHeader);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: name (asc)");

    // Click again -> clear
    await userEvent.click(nameHeader);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: none");
  },
};

/**
 * Empty data set renders headers but no rows.
 */
export const EmptyData: Story = {
  args: {
    data: [],
    columns: sampleColumns,
    sort: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Headers should still be present
    await expect(canvas.getByText("Name")).toBeInTheDocument();
    await expect(canvas.getByText("Type")).toBeInTheDocument();
    // No data rows
    await expect(canvas.queryByText("Finding Alpha")).not.toBeInTheDocument();
  },
};
