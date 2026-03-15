import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "./form";
import { Input } from "./input";
import { Button } from "./button";
import { Textarea } from "./textarea";

const meta = {
  title: "Primitives/Form",
  component: Form,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

const simpleSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters."),
});

function SimpleFormExample() {
  const form = useForm<z.infer<typeof simpleSchema>>({
    resolver: zodResolver(simpleSchema),
    defaultValues: { username: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-80 space-y-6">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>
                This is your public display name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

export const Default: Story = {
  render: () => <SimpleFormExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Submit empty form to trigger validation error
    const submitButton = canvas.getByRole("button", { name: /submit/i });
    await userEvent.click(submitButton);

    // Validation error should appear
    const errorMessage = await canvas.findByText(
      /username must be at least 2 characters/i
    );
    await expect(errorMessage).toBeInTheDocument();
  },
};

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required."),
  description: z.string().optional(),
});

function ProjectFormExample() {
  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", description: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-96 space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input placeholder="User Study Q1" {...field} />
              </FormControl>
              <FormDescription>
                A descriptive name for your research project.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe the goals and scope of this study..."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Optional. Helps your team understand the research goals.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 pt-2">
          <Button variant="ghost">Cancel</Button>
          <Button type="submit">Create Project</Button>
        </div>
      </form>
    </Form>
  );
}

export const ProjectForm: Story = {
  name: "Create Project Form",
  render: () => <ProjectFormExample />,
};

const validationSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  apiKey: z.string().min(10, "API key must be at least 10 characters."),
});

function ValidationExample() {
  const form = useForm<z.infer<typeof validationSchema>>({
    resolver: zodResolver(validationSchema),
    defaultValues: { email: "not-an-email", apiKey: "short" },
    mode: "all",
  });

  // Trigger validation immediately so errors are visible
  form.trigger();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-96 space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                Your OpenRouter API key for BYOK usage.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save Settings</Button>
      </form>
    </Form>
  );
}

export const WithValidationErrors: Story = {
  name: "With Validation Errors",
  render: () => <ValidationExample />,
};
