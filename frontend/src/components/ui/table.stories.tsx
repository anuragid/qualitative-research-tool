import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow,
} from "./Table";

const meta = {
  title: "UI/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Analysis results for User Study Q1</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Dimension</TableHead>
          <TableHead>Count</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Chunks</TableCell>
          <TableCell>24</TableCell>
          <TableCell>Complete</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Inferences</TableCell>
          <TableCell>18</TableCell>
          <TableCell>Complete</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Patterns</TableCell>
          <TableCell>7</TableCell>
          <TableCell>Complete</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Insights</TableCell>
          <TableCell>4</TableCell>
          <TableCell>In Progress</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Principles</TableCell>
          <TableCell>&mdash;</TableCell>
          <TableCell>Pending</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
