import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

// Mock Clerk's UserButton — it requires ClerkProvider which we don't have in tests
vi.mock("@clerk/react", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

// Mock useTheme so we can verify theme changes
const mockSetTheme = vi.fn();
vi.mock("../../hooks/useTheme.tsx", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: mockSetTheme,
  }),
}));

// Mock ModelSettingsDialog — render a testable element that shows the open prop
vi.mock("../settings/ModelSettingsDialog", () => ({
  ModelSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="model-settings-dialog">Model Settings Dialog</div> : null,
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
    mockSetTheme.mockReset();
  });

  // 1. Renders methodex typemark via Logo component
  it("renders the methodex logo", () => {
    const { aside } = renderSidebar();

    const logo = aside.querySelector(
      'span[aria-label="methodex"]'
    ) as HTMLElement;
    expect(logo).not.toBeNull();
    expect(logo.textContent).toBe("methodex");
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

    // The backdrop is the div with aria-hidden="true" and bg-[var(--color-overlay)] class
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

  // 13. Theme toggle: renders light, dark, system toggle items
  it("renders theme toggle items for light, dark, and system", () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    expect(scoped.getByRole("radio", { name: /light theme/i })).toBeDefined();
    expect(scoped.getByRole("radio", { name: /dark theme/i })).toBeDefined();
    expect(scoped.getByRole("radio", { name: /system theme/i })).toBeDefined();
  });

  // 14. Theme toggle: clicking light calls setTheme("light")
  it('clicking light theme toggle calls setTheme with "light"', async () => {
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const lightBtn = scoped.getByRole("radio", { name: /light theme/i });
    await user.click(lightBtn);

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  // 15. Theme toggle: clicking dark calls setTheme("dark")
  it('clicking dark theme toggle calls setTheme with "dark"', async () => {
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const darkBtn = scoped.getByRole("radio", { name: /dark theme/i });
    await user.click(darkBtn);

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  // 16. Clicking the already-selected theme does not call setTheme (empty value guard)
  it("does not call setTheme when clicking the already-selected theme toggle", async () => {
    // The mock returns theme="system" which is the current value.
    // Clicking system again in a single ToggleGroup sends empty string,
    // and the handler's `if (value)` guard prevents calling setTheme.
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    await user.click(scoped.getByRole("radio", { name: /system theme/i }));
    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  // 17. Renders "Theme" label
  it('renders "Theme" label text', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    expect(scoped.getByText("Theme")).toBeDefined();
  });

  // 18. Model Settings button opens the settings dialog
  it("clicking Model Settings button opens the settings dialog", async () => {
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const modelSettingsBtn = scoped.getByRole("button", { name: /model settings/i });
    await user.click(modelSettingsBtn);

    // The mocked dialog should now be visible
    expect(screen.getByTestId("model-settings-dialog")).toBeDefined();
  });

  // 19. Body overflow is set to "hidden" when sidebar is open
  it('sets body overflow to "hidden" when isOpen', () => {
    renderSidebar({ isOpen: true });
    expect(document.body.style.overflow).toBe("hidden");
  });

  // 20. Body overflow is restored when sidebar closes
  it('restores body overflow to "" when isOpen is false', () => {
    renderSidebar({ isOpen: false });
    expect(document.body.style.overflow).toBe("");
  });

  // 21. Body overflow cleanup runs on unmount
  it("restores body overflow on unmount", () => {
    const { unmount } = renderSidebar({ isOpen: true });
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
