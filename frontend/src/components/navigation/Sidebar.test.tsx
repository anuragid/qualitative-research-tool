import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

// Mock Clerk's UserButton — it requires ClerkProvider which we don't have in tests
vi.mock("@clerk/react", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

// Mock ModelSettingsDialog to avoid pulling in Radix Dialog internals
vi.mock("../settings/ModelSettingsDialog", () => ({
  ModelSettingsDialog: () => null,
}));

function renderSidebar(props: { isOpen?: boolean; onClose?: () => void } = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    ...props,
  };

  const result = render(
    <MemoryRouter>
      <Sidebar {...defaultProps} />
    </MemoryRouter>
  );

  // Scope queries to the aside element to avoid duplicates from React Router v7
  const aside = result.container.querySelector(
    'aside[aria-label="Main navigation"]'
  ) as HTMLElement;

  return { ...result, onClose: defaultProps.onClose, aside };
}

describe("Sidebar", () => {
  beforeEach(() => {
    // Reset body overflow between tests (sidebar modifies it)
    document.body.style.overflow = "";
  });

  // 1. Renders methodex typemark
  it('renders the "methode" text with italic "x"', () => {
    const { aside } = renderSidebar();

    // The typemark outer span contains "methodex" as full text content
    const typemark = aside.querySelector(
      "span.select-none"
    ) as HTMLElement;
    expect(typemark).not.toBeNull();
    expect(typemark.textContent).toBe("methodex");

    // The inner span wraps the "x" portion and should be styled distinctly
    const innerSpan = typemark.querySelector("span") as HTMLElement;
    expect(innerSpan).not.toBeNull();
    expect(innerSpan.textContent).toContain("x");
  });

  // 2. Renders "All Projects" nav link
  it('renders "All Projects" nav link', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const link = scoped.getByRole("link", { name: /all projects/i });
    expect(link).toBeDefined();
  });

  // 3. "All Projects" link has href="/projects"
  it('"All Projects" link has href="/projects"', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const link = scoped.getByRole("link", { name: /all projects/i });
    expect(link.getAttribute("href")).toBe("/projects");
  });

  // 4. Renders "Settings" section header
  it('renders "Settings" section header', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const header = scoped.getByText("Settings");
    expect(header).toBeDefined();
  });

  // 5. Renders "Model Settings" button
  it('renders "Model Settings" button', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const button = scoped.getByRole("button", { name: /model settings/i });
    expect(button).toBeDefined();
  });

  // 6. Close button is visible and calls onClose when clicked
  it("close button calls onClose when clicked", async () => {
    const user = userEvent.setup();
    const { aside, onClose } = renderSidebar();
    const scoped = within(aside);

    const closeButton = scoped.getByRole("button", {
      name: /close sidebar/i,
    });
    expect(closeButton).toBeDefined();

    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 7. Escape key calls onClose when sidebar is open
  it("Escape key calls onClose when sidebar is open", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar({ isOpen: true });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape key does NOT call onClose when sidebar is closed", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar({ isOpen: false });

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  // 8. Mobile backdrop renders and calls onClose on click
  it("mobile backdrop calls onClose on click", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderSidebar({ isOpen: true });

    // The backdrop is the div with aria-hidden="true" and bg-black/30 class
    const backdrop = container.querySelector(
      'div[aria-hidden="true"]'
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();

    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 9. Sidebar has correct width class (w-72)
  it("sidebar aside element has w-72 class", () => {
    const { aside } = renderSidebar();

    expect(aside.className).toContain("w-72");
  });

  // 10. When isOpen=false, sidebar has -translate-x-full class
  it("has -translate-x-full class when isOpen is false", () => {
    const { aside } = renderSidebar({ isOpen: false });

    expect(aside.className).toContain("-translate-x-full");
    // Should NOT have standalone translate-x-0 (only lg:translate-x-0 is expected)
    const classes = aside.className.split(/\s+/);
    expect(classes).not.toContain("translate-x-0");
  });

  // 11. When isOpen=true, sidebar has translate-x-0 class
  it("has translate-x-0 class when isOpen is true", () => {
    const { aside } = renderSidebar({ isOpen: true });

    expect(aside.className).toContain("translate-x-0");
    expect(aside.className).not.toContain("-translate-x-full");
  });

  // 12. Has lg:translate-x-0 for desktop always-visible behavior
  it("has lg:translate-x-0 class for desktop always-visible behavior", () => {
    const { aside } = renderSidebar({ isOpen: false });

    expect(aside.className).toContain("lg:translate-x-0");
  });
});
